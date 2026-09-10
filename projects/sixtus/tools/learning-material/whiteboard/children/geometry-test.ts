import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { z } from "@zod";
import { type Geometry, geometry, geometrySchema } from "./geometry.ts";
import { resolveGeometry } from "./geometry-resolver.ts";
import { WhiteboardOutput } from "../schema.ts";
import { WHITEBOARD_SPEC_SYSTEM_PROMPT } from "../prompt.ts";
import { geometry as exportedGeometry, whiteboardChildren } from "./index.ts";

const example = (): Geometry => structuredClone(geometry.example.output);
const position = (
  id: string,
  x: number,
  y: number,
): Geometry["points"][number] => ({ id, kind: "position", at: [x, y] });
function invalid(spec: Geometry, message: string) {
  const result = geometrySchema.safeParse(spec);
  assert(!result.success);
  assert(result.error.message.includes(message), result.error.message);
}
function circles(): Geometry {
  return {
    type: "geometry",
    title: "Circle constructions",
    points: [position("o", 0, 0), position("p", 2, 0)],
    objects: [{ id: "circle", kind: "circle", center: "o", radius: 2 }, {
      id: "other",
      kind: "circle",
      center: "p",
      radius: 2,
    }],
    labels: [],
    markings: [],
  };
}

Deno.test("geometry registers its contract with compatible JSON arrays/unions", () => {
  assertEquals(exportedGeometry, geometry);
  assertEquals(geometrySchema.parse(example()), example());
  assert(
    whiteboardChildren.some((child) => String(child.type) === "geometry"),
  );
  assert(WHITEBOARD_SPEC_SYSTEM_PROMPT.includes("## geometry"));
  assert(
    WhiteboardOutput.safeParse({ layout: "single", children: [example()] })
      .success,
  );
  const json = JSON.stringify(z.toJSONSchema(geometrySchema));
  assert(!json.includes('"oneOf"'));
  assert(!json.includes('"prefixItems"'));
  assert(json.includes('"geometry"'));
});

Deno.test("geometry resolves projection, midpoint, extrapolation, and forward dependencies", () => {
  const spec = example();
  spec.points.unshift({
    id: "mid",
    kind: "along",
    points: ["b", "c"],
    fraction: 0.5,
  });
  spec.points.push({
    id: "extended",
    kind: "along",
    points: ["b", "c"],
    fraction: 1.5,
  });
  const result = resolveGeometry(geometrySchema.parse(spec));
  assertEquals(result.points.get("d"), [2, 0]);
  assertEquals(result.points.get("mid"), [3, 0]);
  assertEquals(result.points.get("extended"), [9, 0]);
});

Deno.test("geometry rejects missing/wrong-kind references, duplicate IDs, and point/object cycles", () => {
  let spec = example();
  spec.points.push({
    id: "bad",
    kind: "projection",
    point: "abc",
    onto: ["b", "c"],
  });
  invalid(spec, "Unknown point");
  spec = example();
  spec.labels[0].id = "a";
  invalid(spec, "unique");
  spec = example();
  spec.points.push({
    id: "loop",
    kind: "along",
    points: ["loop", "a"],
    fraction: 0.5,
  });
  invalid(spec, "Cyclic");
  spec = circles();
  spec.points.push({
    id: "loop",
    kind: "on-circle",
    circle: "circle",
    angle: 0,
  });
  spec.objects[0] = {
    id: "circle",
    kind: "circle",
    center: "o",
    radius: { through: "loop" },
  };
  invalid(spec, "Cyclic");
  spec = example();
  spec.points.push({ id: "bad", kind: "on-circle", circle: "abc", angle: 0 });
  invalid(spec, "must reference a circle");
});

Deno.test("geometry resolves circle intersections in deterministic order and circle points/arcs", () => {
  const spec = circles();
  spec.points.push(
    {
      id: "first",
      kind: "intersection",
      objects: ["circle", "other"],
      solution: "first",
    },
    {
      id: "second",
      kind: "intersection",
      objects: ["circle", "other"],
      solution: "second",
    },
    { id: "top", kind: "on-circle", circle: "circle", angle: 450 },
  );
  spec.objects.push({
    id: "arc",
    kind: "arc",
    circle: "circle",
    startAngle: 350,
    endAngle: 10,
    direction: "counterclockwise",
  });
  const result = resolveGeometry(geometrySchema.parse(spec));
  assertAlmostEquals(result.points.get("first")![1], -Math.sqrt(3));
  assertAlmostEquals(result.points.get("second")![1], Math.sqrt(3));
  assertAlmostEquals(result.points.get("top")![1], 2);
  const arc = result.objects.get("arc")!;
  assert(arc.kind === "arc");
  assertEquals(arc.sweep, 20);
});

Deno.test("geometry respects segment/ray domains and tangent solution count", () => {
  const spec = circles();
  spec.points.push(position("left", -3, 0), position("right", 3, 0));
  spec.objects.push({
    id: "crossing",
    kind: "segment",
    points: ["left", "right"],
  });
  spec.points.push({
    id: "hit",
    kind: "intersection",
    objects: ["circle", "crossing"],
    solution: "second",
  });
  assertEquals(resolveGeometry(geometrySchema.parse(spec)).points.get("hit"), [
    2,
    0,
  ]);
  spec.points[2] = position("left", 0, 0);
  invalid(spec, "no 'second'");
  spec.objects[2] = { id: "crossing", kind: "ray", points: ["left", "right"] };
  invalid(spec, "no 'second'");
  spec.points[2] = position("left", -3, 2);
  spec.points[3] = position("right", 3, 2);
  invalid(spec, "no 'second'");
  spec.points[4] = {
    id: "hit",
    kind: "intersection",
    objects: ["crossing", "circle"],
    solution: "first",
  };
  assertEquals(resolveGeometry(geometrySchema.parse(spec)).points.get("hit"), [
    0,
    2,
  ]);
});

Deno.test("geometry constructs straight intersections and rejects parallel/coincident lines", () => {
  const spec = example();
  spec.objects.push({ id: "base", kind: "line", points: ["b", "c"] });
  spec.points.push({
    id: "crossing",
    kind: "intersection",
    objects: ["height", "base"],
    solution: "first",
  });
  assertEquals(
    resolveGeometry(geometrySchema.parse(spec)).points.get("crossing"),
    [2, 0],
  );
  spec.points[4] = {
    id: "crossing",
    kind: "intersection",
    objects: ["base", "base"],
    solution: "first",
  };
  invalid(spec, "isolated solution");
});

Deno.test("geometry validates polygon boundaries and nondegenerate constructions", () => {
  let spec = example();
  spec.points[2] = position("c", 0, 0);
  invalid(spec, "distinct positions");
  spec = circles();
  spec.objects[0] = {
    id: "circle",
    kind: "circle",
    center: "o",
    radius: { through: "o" },
  };
  invalid(spec, "positive finite radius");
  spec = circles();
  spec.objects.push({
    id: "arc",
    kind: "arc",
    circle: "circle",
    startAngle: 0,
    endAngle: 360,
    direction: "clockwise",
  });
  invalid(spec, "non-full-turn");
  spec = {
    type: "geometry",
    title: "Crossed polygon",
    points: [
      position("a", 0, 0),
      position("b", 4, 4),
      position("c", 0, 3),
      position("d", 5, 0),
    ],
    objects: [{ id: "shape", kind: "polygon", points: ["a", "b", "c", "d"] }],
    labels: [],
    markings: [],
  };
  invalid(spec, "intersecting edges");
  spec.objects[0] = {
    id: "shape",
    kind: "polygon",
    points: ["a", "b", "c", "a"],
  };
  invalid(spec, "repeated vertices");
});

Deno.test("geometry checks right angles, equal lengths, parallel lines, and equal angle groups", () => {
  const spec = example();
  spec.markings[0] = {
    id: "wrong",
    kind: "right-angle",
    points: ["a", "b", "c"],
  };
  invalid(spec, "right angle");
  spec.markings = [];
  spec.objects.push({ id: "ab", kind: "segment", points: ["a", "b"] }, {
    id: "ac",
    kind: "segment",
    points: ["a", "c"],
  });
  spec.markings.push({
    id: "equal",
    kind: "equal-length",
    objects: ["ab", "ac"],
  });
  invalid(spec, "contradicts");
  spec.points[0] = position("a", 3, 3);
  assert(geometrySchema.safeParse(spec).success);
  spec.markings.push({
    id: "parallel",
    kind: "parallel",
    objects: ["ab", "ac"],
  });
  invalid(spec, "contradicts");
  spec.markings.pop();
  spec.markings.push({
    id: "left",
    kind: "angle",
    points: ["a", "b", "c"],
    sweep: "minor",
    group: "base-angles",
  }, {
    id: "right",
    kind: "angle",
    points: ["a", "c", "b"],
    sweep: "minor",
    group: "base-angles",
  });
  assert(geometrySchema.safeParse(spec).success);
  spec.markings.shift();
  spec.points[0] = position("a", 2, 3);
  invalid(spec, "unequal angles");
});

Deno.test("geometry validates labels and annotation parts without revealing hidden measurements", () => {
  const spec = example();
  spec.annotations = [{
    type: "arrow",
    targetIds: ["triangle.height.mark"],
    content: "Perpendicular height",
  }];
  assert(geometrySchema.safeParse(spec).success);
  spec.annotations[0] = {
    type: "underline",
    targetIds: ["triangle.height.mark"],
    content: null,
  };
  invalid(spec, "text target");
  spec.annotations[0].targetIds = ["triangle.height-label.label"];
  assert(geometrySchema.safeParse(spec).success);
  spec.annotations[0].targetIds = ["triangle.abc.ab"];
  invalid(spec, "Unknown geometry annotation target");
  spec.annotations = [];
  spec.labels.push({ id: "bad", kind: "text", target: "absent", latex: "x" });
  invalid(spec, "unknown target");
  const parsed = geometrySchema.parse(example());
  assertEquals(parsed.labels, example().labels);
  assert(!("length" in parsed.labels[0]));
});

Deno.test("geometry rejects invalid structure", () => {
  assert(!geometrySchema.safeParse({ ...example(), pixels: [10, 20] }).success);
  assert(
    !geometrySchema.safeParse({
      ...example(),
      points: [position("a", Infinity, 0)],
    }).success,
  );
  assert(
    !geometrySchema.safeParse({
      ...example(),
      points: [{ id: "a", kind: "position", at: [1] }],
    }).success,
  );
});

import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertThrows,
} from "@std/assert";
import { type Geometry, geometry } from "../children/geometry.ts";
import { WhiteboardOutput, whiteboardRequestSchema } from "../schema.ts";
import { WHITEBOARD_SPEC_SYSTEM_PROMPT } from "../prompt.ts";
import { renderGeometryDrawing } from "./geometry.ts";
import { geometryExamples } from "./geometry-examples.ts";
import { renderWhiteboardSvg } from "./index.ts";
import { center, obstacleHitsBox } from "./placement.ts";

Deno.test("all geometry examples render deterministically with semantic targets and nonoverlapping labels", () => {
  for (const spec of geometryExamples) {
    const original = structuredClone(spec);
    const drawing = renderGeometryDrawing(spec, { id: spec.id! });
    assertEquals(renderGeometryDrawing(spec, { id: spec.id! }), drawing);
    assertEquals(spec, original);
    assert(!/NaN|Infinity|undefined/.test(drawing.markup));
    const names = [
      "title",
      ...spec.points.map((p) => `${p.id}.mark`),
      ...spec.objects.map((o) => `${o.id}.mark`),
      ...spec.markings.map((m) => `${m.id}.mark`),
      ...spec.labels.map((l) => `${l.id}.label`),
      ...spec.markings.flatMap((m) =>
        m.kind === "angle" && m.latex ? [`${m.id}.label`] : []
      ),
    ];
    assertEquals(
      [...drawing.targets.keys()].sort(),
      names.map((n) => `${spec.id}.${n}`).sort(),
    );
    for (const [id, target] of drawing.targets) {
      assert(drawing.markup.includes(`id="${id}"`));
      assert(target.bounds.x >= drawing.bounds!.x - 1e-8);
      assert(target.bounds.y >= drawing.bounds!.y - 1e-8);
      assert(
        target.bounds.x + target.bounds.width <=
          drawing.bounds!.x + drawing.bounds!.width + 1e-8,
      );
      assert(
        target.bounds.y + target.bounds.height <=
          drawing.bounds!.y + drawing.bounds!.height + 1e-8,
      );
      if (target.kind === "text") {
        for (const obstacle of drawing.obstacles) {
          if (obstacle.ownerId === id || obstacle.kind === "area") continue;
          assert(
            !obstacleHitsBox(obstacle, target.bounds, 2),
            `${id} overlaps ${obstacle.ownerId}`,
          );
        }
      }
    }
    assert(
      renderWhiteboardSvg({ layout: "single", children: [spec] }).svg.includes(
        `<g data-child-id="${spec.id}"`,
      ),
    );
  }
});

Deno.test("geometry is available in generation and direct requests and composes with math and charts", () => {
  assert(WHITEBOARD_SPEC_SYSTEM_PROMPT.includes("## geometry"));
  assert(WHITEBOARD_SPEC_SYSTEM_PROMPT.includes("mathematical coordinates"));
  assert(!geometry.instructions.includes("not implemented"));
  const input = {
    layout: "stack",
    children: [geometryExamples[0], {
      type: "math_expressions",
      id: "area",
      title: "Triangle area",
      expressions: [{ id: "formula", latex: "A = \\frac{bh}{2}" }],
    }, {
      type: "xy_chart",
      id: "chart",
      title: "Lengths",
      chartStyle: "bar",
      xLabel: "Side",
      yLabel: "cm",
      series: [{
        id: "sides",
        name: "Length",
        points: [{ id: "base", x: "Base", y: 6 }],
      }],
    }],
  };
  assert(whiteboardRequestSchema.safeParse(input).success);
  const result = renderWhiteboardSvg(WhiteboardOutput.parse(input));
  assertEquals(result.childPlacements.length, 3);
  assertEquals(result.calloutPlacements.length, 1);
  assert(result.stages.base.svg.includes('id="triangle.height.mark"'));
  assert(result.stages.callouts.svg.includes("Perpendicular height"));
  assert(result.childPlacements[1].y > result.childPlacements[0].y);
  assert(result.childPlacements[2].y > result.childPlacements[1].y);
  const ids = [...result.svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  // data-child-id is not an SVG id; exclude it from the attribute match.
  const svgIds = [...result.svg.matchAll(/(?:\s|<)id="([^"]+)"/g)].map((m) =>
    m[1]
  );
  assert(ids.length > 0);
  assertEquals(new Set(svgIds).size, svgIds.length);
});

Deno.test("geometry preserves mathematical proportions, orientation, and computed lengths", () => {
  const spec: Geometry = {
    ...geometry.example.output,
    annotations: [],
    unit: "cm",
    labels: [{ id: "measure", kind: "length", points: ["b", "c"] }],
  };
  const d = renderGeometryDrawing(spec, { id: "proportions" });
  const p = (id: string) =>
    center(d.targets.get(`triangle.${id}.mark`)!.bounds);
  const a = p("a"), b = p("b"), c = p("c"), foot = p("d");
  assert(a.y < b.y);
  assertAlmostEquals(a.x, foot.x);
  assertAlmostEquals(b.y, foot.y);
  assertAlmostEquals((c.x - b.x) / (b.y - a.y), 2);
  assert(d.markup.includes(">6 cm</text>"));
  const resized = renderGeometryDrawing(spec, {
    id: "large",
    width: 1000,
    height: 700,
  });
  const rb = center(resized.targets.get("triangle.b.mark")!.bounds),
    rc = center(resized.targets.get("triangle.c.mark")!.bounds),
    ra = center(resized.targets.get("triangle.a.mark")!.bounds);
  assertAlmostEquals((rc.x - rb.x) / (rb.y - ra.y), 2);
});

Deno.test("geometry supports concave polygons, derived intersections, clockwise arcs, and horizontal figures", () => {
  const spec: Geometry = {
    type: "geometry",
    title: "Concave polygon",
    points: [
      { id: "a", kind: "position", at: [0, 0] },
      { id: "b", kind: "position", at: [4, 0] },
      { id: "c", kind: "position", at: [2, 1] },
      { id: "d", kind: "position", at: [4, 4] },
      { id: "e", kind: "position", at: [0, 4] },
      {
        id: "hit",
        kind: "intersection",
        objects: ["ac", "eb"],
        solution: "first",
      },
    ],
    objects: [
      {
        id: "shape",
        kind: "polygon",
        points: ["a", "b", "c", "d", "e"],
        fill: true,
      },
      { id: "ac", kind: "line", points: ["a", "c"], dashed: true },
      { id: "eb", kind: "segment", points: ["e", "b"] },
    ],
    labels: [],
    markings: [],
  };
  assert(
    renderGeometryDrawing(spec, { id: "concave" }).markup.includes("clipPath"),
  );
  const circle: Geometry = {
    type: "geometry",
    title: "Clockwise arc",
    points: [{ id: "o", kind: "position", at: [0, 0] }],
    objects: [{ id: "circle", kind: "circle", center: "o", radius: 1 }, {
      id: "arc",
      kind: "arc",
      circle: "circle",
      startAngle: 90,
      endAngle: 0,
      direction: "clockwise",
      dashed: true,
    }],
    labels: [],
    markings: [],
  };
  const drawing = renderGeometryDrawing(circle, { id: "cw" });
  assert(drawing.markup.includes('stroke-dasharray="7 5"'));
  const arc = drawing.targets.get("cw.arc.mark")!.bounds,
    full = drawing.targets.get("cw.circle.mark")!.bounds;
  assertAlmostEquals(arc.width, (full.width - 2) / 2 + 2);
  assertAlmostEquals(arc.y, full.y);
  const line: Geometry = {
    type: "geometry",
    title: "Horizontal line",
    points: [{ id: "a", kind: "position", at: [-1, 0] }, {
      id: "b",
      kind: "position",
      at: [1, 0],
    }],
    objects: [{ id: "line", kind: "line", points: ["a", "b"] }],
    labels: [],
    markings: [],
  };
  assert(
    !/NaN|Infinity/.test(renderGeometryDrawing(line, { id: "flat" }).markup),
  );
});

Deno.test("geometry fills stay under labels and use unique definitions in split boards", () => {
  const a = geometryExamples.at(-1)!;
  const b = { ...structuredClone(a), id: "second-circle" };
  const result = renderWhiteboardSvg({ layout: "split", children: [a, b] });
  assert(result.svg.includes("whiteboard-child-0-disk-region"));
  assert(result.svg.includes("whiteboard-child-1-disk-region"));
  assert(!result.svg.includes("label-clearance"));
  assert(!result.svg.includes('clip-rule="evenodd"'));
  assert(!result.svg.includes('fill="white"'));
  assert(!result.svg.includes('fill="#fff"'));
  assert(result.svg.includes('fill-opacity="0.05"'));
});

Deno.test("geometry handles text annotations and rejects unreadable labels and bad options", () => {
  const spec: Geometry = structuredClone(geometry.example.output);
  spec.annotations = [{
    type: "underline",
    targetIds: ["triangle.base-label.label"],
    content: null,
  }, {
    type: "arrow",
    targetIds: ["triangle.foot.mark"],
    content: "Right angle",
  }];
  const result = renderWhiteboardSvg({ layout: "single", children: [spec] });
  assert(result.stages.base.svg !== result.stages.emphasis.svg);
  assertEquals(result.calloutPlacements.length, 1);
  assertThrows(
    () => renderGeometryDrawing(spec, { id: "bad id" }),
    Error,
    "simple SVG id",
  );
  assertThrows(
    () => renderGeometryDrawing(spec, { id: "small", width: 100 }),
    Error,
    "320",
  );
  assertThrows(
    () => renderGeometryDrawing(spec, { id: "bad", height: NaN }),
    Error,
    "finite",
  );
  spec.labels[0] = {
    id: "long",
    kind: "text",
    target: "a",
    latex: "x".repeat(500),
  };
  spec.annotations = [];
  assertThrows(
    () => renderGeometryDrawing(spec, { id: "long" }),
    Error,
    "does not fit",
  );
  spec.labels[0] = {
    id: "bad-latex",
    kind: "text",
    target: "a",
    latex: "\\notACommand",
  };
  assertThrows(
    () => renderGeometryDrawing(spec, { id: "bad" }),
    Error,
    "Geometry label 'bad-latex'",
  );
});

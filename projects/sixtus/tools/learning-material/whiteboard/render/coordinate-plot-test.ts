import { boardExample } from "./board-example.ts";
import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertThrows,
} from "@std/assert";
import {
  type CoordinatePlot,
  coordinatePlot,
} from "../figures/coordinate-plot.ts";
import { WhiteboardOutput, whiteboardRequestSchema } from "../schema.ts";
import { WHITEBOARD_SPEC_SYSTEM_PROMPT } from "../prompt.ts";
import { coordinateExamples } from "./coordinate-gallery.ts";
import {
  clipCoordinateLine,
  compileCoordinateExpression,
  coordinateEndpointValue,
  sampleCoordinateFunction,
} from "./coordinate-math.ts";
import {
  coordinateTicks,
  renderCoordinatePlotDrawing,
} from "./coordinate-plot.ts";
import { renderWhiteboardSvg } from "./index.ts";
import { mathExpressions } from "../figures/math-expressions.ts";

const example = coordinatePlot.example.output;
const draw = (plot: CoordinatePlot) =>
  renderCoordinatePlotDrawing(plot, { id: "test-plot" });
const plane: CoordinatePlot = {
  ...example,
  axes: { x: { min: -5, max: 5 }, y: { min: -5, max: 5 } },
  elements: [],
};

Deno.test("coordinate expressions evaluate real arithmetic with safe, correct precedence", () => {
  for (
    const [source, x, expected] of [
      ["-x^2", 3, -9],
      ["2^3^2", 0, 512],
      ["x^-2", 2, 0.25],
      ["sin(pi/2)+ln(e)+log10(100)", 0, 4],
      ["abs(x)+sqrt(4)", -2, 4],
    ] as const
  ) assertAlmostEquals(compileCoordinateExpression(source)(x), expected);
  assert(Number.isNaN(compileCoordinateExpression("sqrt(x)")(-1)));
  for (const expression of ["sqrt(x)^0", "(1/x)^0", "exp(-1/x)", "x^0"]) {
    assert(
      Number.isNaN(
        compileCoordinateExpression(expression)(
          expression.startsWith("sqrt") ? -1 : 0,
        ),
      ),
      expression,
    );
  }
  assert(!Number.isFinite(compileCoordinateExpression("tan(x)")(Math.PI / 2)));
  assertThrows(() => compileCoordinateExpression("globalThis.x"));
});

Deno.test("line clipping preserves direction and extent for segments, rays, and vertical lines", () => {
  const box = { x: -1, y: -1, width: 2, height: 2 };
  assertEquals(
    clipCoordinateLine({ x: 0, y: 0 }, { x: 0, y: 2 }, box, "both"),
    [{ x: 0, y: -1 }, { x: 0, y: 1 }],
  );
  assertEquals(
    clipCoordinateLine({ x: 0, y: 0 }, { x: 0.5, y: 0 }, box, "start"),
    [{ x: -1, y: 0 }, { x: 0.5, y: 0 }],
  );
  assertEquals(
    clipCoordinateLine({ x: 0, y: 0 }, { x: 0.5, y: 0 }, box, "end"),
    [{ x: 0, y: 0 }, { x: 1, y: 0 }],
  );
  assertEquals(clipCoordinateLine({ x: 2, y: 0 }, { x: 3, y: 0 }, box), null);
});

Deno.test("sampling leaves gaps at shifted poles, jumps, and natural-domain boundaries", () => {
  const box = { x: 0, y: 0, width: 600, height: 400 };
  const project = (x: number, y: number) => ({
    x: (x + 3) * 100,
    y: 200 - y * 50,
  });
  for (const source of ["1/(x-0.137)", "abs(x-0.137)/(x-0.137)"]) {
    const segments = sampleCoordinateFunction(
      compileCoordinateExpression(source),
      -3,
      3,
      project,
      box,
    );
    const pole = project(0.137, 0).x;
    assert(segments.length > 20);
    assert(segments.every(([a, b]) => !(a.x < pole && b.x > pole)), source);
  }
  const roots = sampleCoordinateFunction(
    compileCoordinateExpression("sqrt(x)"),
    -3,
    3,
    project,
    box,
  );
  assert(roots.length > 10);
  assert(roots.every(([a, b]) => a.x >= 300 && b.x >= 300));
  const tangent = sampleCoordinateFunction(
    compileCoordinateExpression("tan(x)"),
    -3,
    3,
    project,
    box,
  );
  for (const pole of [-Math.PI / 2, Math.PI / 2].map((x) => project(x, 0).x)) {
    assert(tangent.every(([a, b]) => !(a.x < pole && b.x > pole)));
  }
});

Deno.test("endpoint limits accept removable holes but reject divergent poles", () => {
  assertEquals(
    coordinateEndpointValue(
      compileCoordinateExpression("sqrt(-x)"),
      0,
      1,
      10,
      0.001,
    ),
    null,
  );
  assertEquals(
    coordinateEndpointValue(
      compileCoordinateExpression("sqrt(x)"),
      0,
      1,
      10,
      0.001,
    ),
    0,
  );
  assertAlmostEquals(
    coordinateEndpointValue(
      compileCoordinateExpression("sin(x)/x"),
      0,
      1,
      4,
      0.001,
    )!,
    1,
    1e-6,
  );
  assertEquals(
    coordinateEndpointValue(compileCoordinateExpression("1/x"), 0, 1, 4, 0.001),
    null,
  );
  const p: CoordinatePlot = {
    ...plane,
    elements: [{
      type: "function",
      id: "f",
      expression: "x",
      domain: [{ min: -2, max: 2, includeMin: true, includeMax: false }],
      endpointMarkers: true,
    }],
  };
  const result = draw(p);
  assert(result.markup.includes('fill="none" stroke='));
  assertEquals((result.markup.match(/r="4"/g) ?? []).length, 3); // Two marks and the transparent hole mask.
  const noMarkers = draw({
    ...p,
    elements: [{ type: "function", id: "f", expression: "x" }],
  });
  assert(!noMarkers.markup.includes('r="4"'));
});

Deno.test("axis names sit at the positive tips of the axes", () => {
  const full = draw(plane);
  const box = full.focusBounds;
  const xLabel = full.targets.get("slope.x-label")!.bounds;
  const yLabel = full.targets.get("slope.y-label")!.bounds;
  assert(xLabel.x >= box.x + box.width);
  assert(xLabel.y < box.y + box.height);
  assert(xLabel.y + xLabel.height > box.y);
  assert(yLabel.y + yLabel.height <= box.y);
  assert(yLabel.x < box.x + box.width / 2);
  assert(yLabel.x + yLabel.width > box.x + box.width / 2);
  assert(!full.markup.includes("rotate("));

  const quadrant = draw({
    ...plane,
    axes: {
      x: { min: 0, max: 5, label: "Time (s)" },
      y: { min: 0, max: 5, label: "Distance (m)" },
    },
  });
  const qBox = quadrant.focusBounds;
  const qX = quadrant.targets.get("slope.x-label")!.bounds;
  const qY = quadrant.targets.get("slope.y-label")!.bounds;
  assert(qX.x >= qBox.x + qBox.width);
  assert(qY.y + qY.height <= qBox.y);
  assert(qY.x + qY.width / 2 < qBox.x + 40);
});

Deno.test("equal scale preserves circles and independent scale preserves supplied ranges", () => {
  const p: CoordinatePlot = {
    ...plane,
    axes: { x: { min: -10, max: 10 }, y: { min: -5, max: 5 } },
    elements: [{ type: "circle", id: "c", center: [0, 0], radius: 2 }],
  };
  const a = draw(p),
    b = draw({ ...p, axes: { ...p.axes, scale: "independent" } });
  const circle = a.targets.get("slope.c.mark")!.bounds;
  assertAlmostEquals(circle.width, circle.height, 0.5);
  assertAlmostEquals(a.focusBounds.width / a.focusBounds.height, 2);
  assertAlmostEquals(b.focusBounds.width, 640);
  assertAlmostEquals(b.focusBounds.height, 360);
});

Deno.test("coordinate gallery integrates with schemas, prompts, annotations, and deterministic exports", () => {
  assert(WHITEBOARD_SPEC_SYSTEM_PROMPT.includes("## coordinate_plot"));
  assert(
    !WHITEBOARD_SPEC_SYSTEM_PROMPT.includes("This definition is spec-only"),
  );
  for (const plot of coordinateExamples) {
    const spec = boardExample([plot]);
    assertEquals(WhiteboardOutput.parse(spec), spec);
    assertEquals(whiteboardRequestSchema.parse(spec), spec);
    const before = JSON.stringify(spec), a = renderWhiteboardSvg(spec);
    assertEquals(a.svg, renderWhiteboardSvg(spec).svg);
    assertEquals(JSON.stringify(spec), before);
    assert(!/NaN|Infinity/.test(a.svg));
    assert(a.width > 0 && a.height > 0);
    for (const [name, target] of draw(plot).targets) {
      assert(Object.values(target.bounds).every(Number.isFinite), name);
    }
  }
  const annotated = renderWhiteboardSvg(boardExample([coordinateExamples[5]]));
  assertEquals(annotated.calloutPlacements.length, 1);
  assert(annotated.stages.base.svg !== annotated.stages.callouts.svg);
});

Deno.test("mixed math/coordinate figures render with anchor placement with unique definitions", () => {
  for (const side of ["right", "bottom"] as const) {
    const result = renderWhiteboardSvg(
      boardExample([example, mathExpressions.example.output], side),
    );
    assert(result.svg.includes('id="slope.f.mark"'));
    assertEquals(result.figurePlacements.length, 2);
  }
  const result = renderWhiteboardSvg(
    boardExample([{ ...plane, id: "a" }, { ...plane, id: "b" }], "right"),
  );
  const ids = [...result.svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assertEquals(new Set(ids).size, ids.length);
});

Deno.test("clipped content has no ghost labels or annotation targets", () => {
  const p: CoordinatePlot = {
    ...plane,
    elements: [{
      type: "point",
      id: "off",
      position: [100, 100],
      label: "Outside",
    }],
  };
  assert(!draw(p).targets.has("slope.off.mark"));
  assert(!draw(p).markup.includes("Outside"));
  assertThrows(
    () =>
      draw({
        ...p,
        annotations: [{
          type: "arrow",
          targetIds: ["slope.off.mark"],
          content: "Invisible",
        }],
      }),
    Error,
    "outside the visible window",
  );
});

Deno.test("tick configuration preserves symbolic labels and fails clearly on unreadable density", () => {
  assertEquals(coordinateTicks({ min: -1, max: 1, ticks: [] }, 400), []);
  assertEquals(
    coordinateTicks({
      min: 0,
      max: Math.PI,
      ticks: [{ value: Math.PI, label: "π" }],
    }, 400),
    [{ value: Math.PI, label: "π" }],
  );
  assertThrows(
    () => coordinateTicks({ min: 0, max: 100, tickStep: 0.001 }, 400),
    Error,
    "at most",
  );
  assertThrows(
    () =>
      draw({
        ...plane,
        axes: { ...plane.axes, x: { min: -5, max: 5, tickStep: 0.1 } },
      }),
    Error,
    "overlap",
  );
});

import { boardExample } from "./board-example.ts";
import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import type { WhiteboardSpec } from "../schema.ts";
import { mathExpressions } from "../figures/math-expressions.ts";
import type { Geometry } from "../figures/geometry.ts";
import type { CoordinatePlot } from "../figures/coordinate-plot.ts";
import { renderGeometryDrawing } from "./geometry.ts";
import { renderCoordinatePlotDrawing } from "./coordinate-plot.ts";
import { renderMathExpressionsDrawing } from "./math-expressions.ts";
import { renderWhiteboardSvg } from "./index.ts";
import { renderEmphasisAnnotations } from "./annotations.ts";
import { overlaps } from "./placement.ts";
import type { Point } from "./bounds.ts";

const geometry: Geometry = {
  type: "geometry",
  id: "g",
  title: "Diagonal segment",
  points: [{ id: "a", kind: "position", at: [0, 0] }, {
    id: "b",
    kind: "position",
    at: [4, 4],
  }],
  objects: [{ id: "s", kind: "segment", points: ["a", "b"] }],
  labels: [],
  markings: [],
};
const plane: CoordinatePlot = {
  type: "coordinate_plot",
  id: "p",
  title: "Coordinate shape",
  axes: { x: { min: -1, max: 5 }, y: { min: -1, max: 5 } },
  elements: [],
};
const plots: CoordinatePlot[] = [
  {
    ...plane,
    elements: [{
      type: "line",
      id: "s",
      from: [0, 0],
      to: [4, 4],
      extend: "neither",
    }],
  },
  {
    ...plane,
    elements: [{ type: "circle", id: "s", center: [2, 2], radius: 2 }],
  },
  {
    ...plane,
    elements: [{
      type: "polygon",
      id: "s",
      vertices: [[0, 0], [4, 0], [2, 4]],
    }],
  },
  {
    ...plane,
    elements: [{ type: "function", id: "s", expression: "1/(x-2)+2" }],
  },
];
function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

Deno.test("geometry and coordinate callouts terminate beside visible strokes, not empty bounding-box edges", () => {
  for (const figure of [geometry, ...plots]) {
    const scene = figure.type === "geometry"
      ? renderGeometryDrawing(figure, { id: "test" })
      : renderCoordinatePlotDrawing(figure, { id: "test" });
    const target = `${figure.id}.s.mark`;
    const segments = scene.obstacles.filter((o) =>
      o.ownerId === target && o.segment
    ).map((o) => o.segment!);
    assert(segments.length > 0);
    for (const type of ["arrow", "line"] as const) {
      const spec: WhiteboardSpec = boardExample([{
        ...figure,
        annotations: [{ type, targetIds: [target], content: "This shape" }],
      }]);
      const result = renderWhiteboardSvg(spec);
      const path = result.calloutPlacements[0].paths[0];
      const tip = path.at(-1)!, previous = path.at(-2)!;
      const separation = Math.min(
        ...segments.map(({ a, b }) => distanceToSegment(tip, a, b)),
      );
      assert(
        separation <= 28.01,
        `${figure.type}: tip is ${separation}px from the shape`,
      );
      // Extending the final connector leg must reach visible ink, even for
      // curves and disconnected branches whose bounding-box center is empty.
      const length = Math.hypot(tip.x - previous.x, tip.y - previous.y);
      const aim = {
        x: tip.x + (tip.x - previous.x) / length * separation,
        y: tip.y + (tip.y - previous.y) / length * separation,
      };
      assert(
        Math.min(...segments.map(({ a, b }) => distanceToSegment(aim, a, b))) <
          0.1,
      );
      assertEquals(result.svg, renderWhiteboardSvg(spec).svg);
    }
  }
});

Deno.test("circling an equation encloses its bounds without reaching the title or adjacent equation", () => {
  const figure = mathExpressions.example.output;
  const scene = renderMathExpressionsDrawing(figure, { id: "test" });
  for (const expression of figure.expressions) {
    const targetId = `solve.${expression.id}.expression`;
    const annotations = [{
      type: "circle" as const,
      targetIds: [targetId],
      content: null,
    }];
    const result = renderEmphasisAnnotations(annotations, scene.targets, {
      id: "test",
      figureId: "solve",
    });
    const oval = result.drawing.bounds!,
      target = scene.targets.get(targetId)!.bounds;
    assert(oval.x < target.x && oval.y < target.y);
    assert(oval.x + oval.width > target.x + target.width);
    assert(oval.y + oval.height > target.y + target.height);
    for (const [id, other] of scene.targets) {
      if (id !== targetId) {
        assert(!overlaps(oval, other.bounds), `${targetId} overlaps ${id}`);
      }
    }
    const board = renderWhiteboardSvg(
      boardExample([{ ...figure, annotations }]),
    );
    assert(board.svg.includes('data-annotation-type="circle"'));
  }
  // Wide text uses a tight box; extra width does not increase its height.
  const target = scene.targets.get("solve.answer.expression")!;
  const measure = (width: number) =>
    renderEmphasisAnnotations(
      [{ type: "circle", targetIds: ["row"], content: null }],
      new Map([["row", { ...target, bounds: { ...target.bounds, width } }]]),
      { id: "test", figureId: "solve", roughness: 0 },
    ).drawing.bounds!;
  assertAlmostEquals(measure(200).height, measure(600).height, 0.01);
  assertAlmostEquals(measure(600).height, target.bounds.height + 12, 0.01);
  assertAlmostEquals(measure(600).width, 612, 0.01);
});

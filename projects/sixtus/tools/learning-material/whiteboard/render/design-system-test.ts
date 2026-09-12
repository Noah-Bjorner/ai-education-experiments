import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertThrows,
} from "@std/assert";
import { whiteboardFigures } from "../figures/index.ts";
import type { WhiteboardFigureContent } from "../schema.ts";
import { renderWhiteboardSvg } from "./index.ts";
import { renderCircularGraphDrawing, renderXyGraphDrawing } from "./graphs.ts";
import { renderGeometryDrawing } from "./geometry.ts";
import { renderCoordinatePlotDrawing } from "./coordinate-plot.ts";
import { renderFreeformDrawing } from "./freeform.ts";
import { renderMathExpressionsDrawing } from "./math-expressions.ts";
import { renderTextFigureDrawing } from "./text.ts";
import { LINE_HEIGHT, SPACING, TYPE_SCALE } from "./theme.ts";
import { textBlock } from "./text-block.ts";
import { withFigureTitle, withTitleBox } from "./titles.ts";
import { graphTextBounds } from "./font.ts";
import type { TargetedDrawing } from "./targets.ts";

function draw(figure: WhiteboardFigureContent) {
  const options = { id: "design-test", roughness: 0 };
  switch (figure.type) {
    case "xy_chart":
      return renderXyGraphDrawing(figure, options);
    case "pie_chart":
      return renderCircularGraphDrawing(figure, options);
    case "geometry":
      return renderGeometryDrawing(figure, options);
    case "coordinate_plot":
      return renderCoordinatePlotDrawing(figure, options);
    case "freeform":
      return renderFreeformDrawing(figure, options);
    case "math_expressions":
      return renderMathExpressionsDrawing(figure, options);
    case "text":
      return renderTextFigureDrawing(figure, options);
  }
}

Deno.test("every figure shares wrapped heading size and preserves its body targets", () => {
  for (const definition of whiteboardFigures) {
    const figure = definition.schema.parse({
      ...definition.example.output,
      title: "A common heading that wraps without losing any words ".repeat(3),
      annotations: [],
    });
    const body = draw({ ...figure, title: null });
    const titled = draw(figure);
    const titleId = `${figure.id}.title`;
    const heading = titled.targets.get(titleId)!;
    assert(heading, figure.type);
    assert(heading.bounds.height > LINE_HEIGHT.figureTitle, figure.type);
    assert(titled.markup.includes(`font-size="${TYPE_SCALE.figureTitle}"`));
    assert(!titled.markup.includes("…"));
    assertAlmostEquals(
      heading.bounds.x + heading.bounds.width / 2,
      body.bounds!.x + body.bounds!.width / 2,
    );
    const decoration = titled.obstacles.find((o) =>
      o.ownerId === titleId && o.kind === "annotation"
    )!;
    assert(decoration, figure.type);
    assertAlmostEquals(
      body.bounds!.y - (decoration.bounds.y + decoration.bounds.height),
      SPACING.figureTitleGap,
    );
    assertEquals(titled.focusBounds, body.focusBounds);
    for (const [id, target] of body.targets) {
      assertEquals(titled.targets.get(id), target);
    }
    assert(!body.targets.has(titleId));
  }
});

Deno.test("heading decoration and annotation targets agree at negative body coordinates", () => {
  const body: TargetedDrawing = {
    markup: "",
    bounds: { x: -200, y: -80, width: 320, height: 100 },
    focusBounds: { x: -200, y: -80, width: 320, height: 100 },
    targets: new Map(),
    obstacles: [],
  };
  const result = withFigureTitle(body, "A\nwrapped\nheading", "figure", {
    id: "heading",
    roughness: 2,
  });
  const title = result.targets.get("figure.title")!;
  assert(title.bounds.y < -80);
  for (const o of result.obstacles) {
    assert(o.bounds.y >= result.bounds!.y);
    assert(o.bounds.y + o.bounds.height <= -80 - SPACING.figureTitleGap + 1e-8);
  }
});

Deno.test("freeform label, body, and prominent text keep their role sizes across allocations", () => {
  for (
    const [size, role] of [["small", "label"], ["normal", "body"], [
      "large",
      "prominent",
    ]] as const
  ) {
    const expected = graphTextBounds("Ag", TYPE_SCALE[role], 0, 0)!;
    for (const width of [400, 800, 1200]) {
      const drawing = renderFreeformDrawing({
        type: "freeform",
        id: "scene",
        title: null,
        annotations: [],
        elements: [{
          type: "text",
          id: "label",
          content: "Ag",
          size,
          width: 200,
          align: "left",
          position: { x: 20, y: 20 },
        }],
      }, { id: "scene", width, height: width * 0.65 });
      const actual = drawing.targets.get("scene.label.label")!.bounds;
      assertAlmostEquals(actual.height, expected.height);
      assertAlmostEquals(actual.width, expected.width);
    }
  }
});

Deno.test("dense equations grow vertically with fixed text size and row spacing", () => {
  const row = { id: "row", latex: "x = 8" };
  const figure = {
    type: "math_expressions" as const,
    id: "math",
    title: null,
    annotations: [],
    expressions: [row],
  };
  const single = renderMathExpressionsDrawing(figure, {
    id: "math",
    height: 140,
  });
  const dense = renderMathExpressionsDrawing({
    ...figure,
    expressions: Array.from(
      { length: 8 },
      (_, i) => ({ ...row, id: `row-${i}` }),
    ),
  }, { id: "math", height: 140 });
  const original = single.targets.get("math.row.expression")!.bounds;
  const first = dense.targets.get("math.row-0.expression")!.bounds;
  assertAlmostEquals(first.width, original.width);
  assertAlmostEquals(first.height, original.height);
  assert(dense.bounds!.height > 140);
  for (let i = 1; i < 8; i++) {
    const previous = dense.targets.get(`math.row-${i - 1}.expression`)!.bounds;
    const next = dense.targets.get(`math.row-${i}.expression`)!.bounds;
    assertAlmostEquals(
      next.y - previous.y - previous.height,
      SPACING.mathRowGap,
    );
  }
});

Deno.test("multiline blocks preserve whitespace, ink bounds, and role line spacing", () => {
  const value = "Ag\n\nÅj & < >";
  for (const align of ["left", "center", "right"] as const) {
    const block = textBlock(
      value,
      200,
      TYPE_SCALE.body,
      LINE_HEIGHT.body,
      4,
      8,
      "#111",
      align,
    );
    const baselines = [...block.markup.matchAll(/ y="([^"]+)"/g)].map((m) =>
      Number(m[1])
    );
    assertEquals(baselines.length, 3);
    assertAlmostEquals(baselines[1] - baselines[0], LINE_HEIGHT.body);
    assertAlmostEquals(baselines[2] - baselines[1], LINE_HEIGHT.body);
    assert(block.markup.includes("&amp; &lt; &gt;"));
    assert(block.bounds!.width <= 200);
  }
  assertThrows(() => textBlock("W", 1, 22, 30, 0, 0, "#111"));
  assertThrows(() => textBlock("Text", 200, 22, 10, 0, 0, "#111"));
});

Deno.test("board title gap includes its box and is independent of figure spacing", () => {
  const example = whiteboardFigures[0].example.output;
  const figures = [{ ...example, annotations: [], anchor: null, side: null }];
  const body = renderWhiteboardSvg({ title: null, figures }, { roughness: 0 });
  const result = renderWhiteboardSvg({ title: "SHARED TITLE", figures }, {
    roughness: 0,
  });
  const text = textBlock(
    "SHARED TITLE",
    Math.max(body.width, TYPE_SCALE.boardTitle * 4),
    TYPE_SCALE.boardTitle,
    LINE_HEIGHT.boardTitle,
    0,
    0,
    "#111",
    "center",
  );
  const boxed = withTitleBox(text, { id: "expected", roughness: 0 });
  assertAlmostEquals(
    body.bounds.y - (result.bounds.y + boxed.bounds!.height),
    SPACING.boardTitleGap,
  );
  const otherGap = renderWhiteboardSvg({ title: "SHARED TITLE", figures }, {
    gap: 100,
    roughness: 0,
  });
  assertEquals(result.bounds, otherGap.bounds);
});

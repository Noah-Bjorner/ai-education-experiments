import { assert, assertEquals, assertThrows } from "@std/assert";
import { whiteboardFigures } from "../figures/index.ts";
import { prepareFigure } from "./prepare.ts";
import {
  composeWhiteboard,
  figureOptions,
  renderWhiteboardSvg,
} from "./index.ts";
import { boardExample } from "./board-example.ts";
import { WhiteboardRenderError } from "./issues.ts";
import { drawingBuilder, transformDrawing } from "./drawing.ts";
import type { TargetedDrawing } from "./targets.ts";
import { graphTextBounds } from "./font.ts";
import { textLabel } from "./label.ts";
import type { WhiteboardFigureContent } from "../schema.ts";

Deno.test("every figure family prepares and composes through the shared contract", () => {
  for (const definition of whiteboardFigures) {
    const spec = boardExample([definition.example.output]);
    const { anchor: _anchor, side: _side, ...content } = spec.figures[0];
    const before = JSON.stringify(content);
    const result = prepareFigure(content, figureOptions({}, 0));
    assert(result.ok, definition.type);
    assertEquals(JSON.stringify(content), before);
    assertEquals(
      composeWhiteboard(spec, [result.figure]),
      renderWhiteboardSvg(spec),
    );
    assertThrows(
      () => composeWhiteboard(spec, [result.figure], { seed: 500 }),
      WhiteboardRenderError,
      "must match",
    );
  }
});

const math: WhiteboardFigureContent = {
  type: "math_expressions",
  id: "figure-1",
  title: null,
  annotations: [],
  expressions: [{ id: "final", latex: "x=8" }],
};
Deno.test("preparation reports typed glyph, target, and content-fit failures", () => {
  const cases: [WhiteboardFigureContent, string][] = [
    [
      { ...math, expressions: [{ id: "final", latex: "∵ x=8" }] },
      "UNSUPPORTED_GLYPH",
    ],
    [
      {
        ...math,
        expressions: [{ id: "final", latex: "x+".repeat(100) + "x" }],
      },
      "CONTENT_DOES_NOT_FIT",
    ],
    [{
      ...math,
      annotations: [{
        type: "highlight",
        targetIds: ["final.result"],
        text: null,
      }],
    }, "UNKNOWN_TARGET"],
    [{
      ...math,
      annotations: [{
        type: "highlight",
        targetIds: ["title"],
        text: null,
      }],
    }, "UNKNOWN_TARGET"],
  ];
  for (const [spec, code] of cases) {
    const result = prepareFigure(spec, { id: "test" });
    assert(!result.ok);
    assertEquals(result.issues[0].code, code);
    assertEquals(result.issues[0].figureId, "figure-1");
    assert(result.error.repairable);
  }
});

Deno.test("empty coordinate planes remain valid; clipped targets fail centrally and marks accept every intent", () => {
  const plane: WhiteboardFigureContent = {
    type: "coordinate_plot",
    id: "plane",
    title: null,
    axes: { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } },
    elements: [],
  };
  assert(prepareFigure(plane, { id: "test" }).ok);
  const clipped = prepareFigure({
    ...plane,
    elements: [{ type: "point", id: "point", position: [100, 100] }],
    annotations: [{ type: "strikeout", targetIds: ["point"], text: null }],
  }, { id: "test" });
  assert(!clipped.ok);
  assertEquals(clipped.issues[0].code, "UNKNOWN_TARGET");
  const visible = prepareFigure({
    ...plane,
    elements: [{ type: "point", id: "point", position: [0, 0] }],
    annotations: [{ type: "strikeout", targetIds: ["point"], text: null }],
  }, { id: "test" });
  assert(visible.ok);
  assert(visible.figure.emphasis.markup.includes('data-annotation-mark="cross"'));
});

Deno.test("a figure cannot successfully discard its only content", () => {
  const result = prepareFigure({
    type: "text",
    id: "note",
    title: null,
    annotations: [],
    role: "note",
    text: "😀",
  }, { id: "test" });
  assert(!result.ok);
  assertEquals(result.issues[0].code, "UNSUPPORTED_GLYPH");
  assertEquals(result.issues[0].figureId, "note");
});

Deno.test("drawing builder rejects duplicate targets and invalid measured geometry", () => {
  const builder = drawingBuilder();
  const drawing = {
    markup: "<path/>",
    bounds: { x: 0, y: 0, width: 10, height: 10 },
  };
  builder.add({ id: "target", drawing, kind: "mark" });
  assertThrows(
    () => builder.add({ id: "target", drawing, kind: "mark" }),
    WhiteboardRenderError,
    "Duplicate",
  );
  assertThrows(
    () =>
      builder.add({
        id: "bad",
        drawing: { ...drawing, bounds: { ...drawing.bounds, x: NaN } },
        kind: "mark",
      }),
    WhiteboardRenderError,
    "invalid measured bounds",
  );
  assertEquals(builder.targets.size, 1);
  assertEquals(builder.parts.length, 1);
});

Deno.test("shared transforms move drawing, target decorations, attachments, and obstacles together", () => {
  const builder = drawingBuilder();
  const b = { x: 1, y: 2, width: 3, height: 4 };
  builder.add({
    id: "label",
    kind: "text",
    drawing: { markup: "<text>x</text>", bounds: b },
  });
  builder.add({
    id: "mark",
    kind: "mark",
    attachment: {
      type: "anchor",
      point: { x: 2, y: 3 },
      direction: { x: 0, y: 1 },
    },
    drawing: {
      markup: "<path/>",
      bounds: b,
      obstacles: [{
        bounds: b,
        kind: "stroke",
        segment: { a: { x: 1, y: 2 }, b: { x: 4, y: 6 } },
        circle: { cx: 2, cy: 3, r: 1 },
      }],
    },
  });
  const original = builder.finish(b);
  const copy = structuredClone(original);
  const transformed: TargetedDrawing = transformDrawing(original, 10, 20, 2);
  assertEquals(original, copy);
  assertEquals(transformed.bounds, { x: 12, y: 24, width: 6, height: 8 });
  assertEquals(transformed.focusBounds, transformed.bounds);
  assertEquals(transformed.targets.get("mark")!.attachment, {
    type: "anchor",
    point: { x: 14, y: 26 },
    direction: { x: 0, y: 1 },
  });
  const text = transformed.targets.get("label")!;
  assert(text.kind === "text");
  assertEquals(text.decorations.underline.a, { x: 12, y: 38 });
  const stroke = transformed.obstacles.find((obstacle) => obstacle.segment)!;
  assertEquals(stroke.segment, { a: { x: 12, y: 24 }, b: { x: 18, y: 32 } });
  assertEquals(stroke.circle, { cx: 14, cy: 26, r: 2 });
});

Deno.test("single-line labels measure the normalized visible glyphs and retain original text", () => {
  const result = textLabel("v⃗", 0, 0, 16);
  assert(result.markup.includes("<title>v⃗</title>"));
  assert(result.markup.includes("v→</text>"));
  assertEquals(result.bounds, graphTextBounds("v→", 16, 0, 0));
});

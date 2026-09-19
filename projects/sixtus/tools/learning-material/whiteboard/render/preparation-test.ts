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

Deno.test("pie wedges reject highlight and keep callouts", () => {
  const pie: WhiteboardFigureContent = {
    type: "pie_chart",
    id: "books",
    title: null,
    annotations: [{ type: "highlight", targetIds: ["fiction"], text: null }],
    slices: [
      { id: "fiction", label: "Fiction", value: 12 },
      { id: "rest", label: "Rest", value: 8 },
    ],
  };
  const blocked = prepareFigure(pie, { id: "test" });
  assert(!blocked.ok);
  assertEquals(blocked.issues[0].code, "INVALID_ANNOTATION");
  assertEquals(blocked.issues[0].figureId, "books");
  assert(blocked.issues[0].availableTargetIds?.includes("fiction.percentage"));
  assert(!blocked.issues[0].availableTargetIds?.includes("fiction"));
  const allowed = prepareFigure({
    ...pie,
    annotations: [{
      type: "callout",
      targetIds: ["fiction"],
      text: "More than half",
    }],
  }, { id: "test" });
  assert(allowed.ok);
  assert(allowed.figure.complete.markup.includes('data-annotation-type="callout"'));
  assert(!allowed.figure.complete.markup.includes('data-annotation-type="highlight"'));
});

// The row that failed in production: one budget split written as a single equation.
const budgetRow = String
  .raw`\$50 = \$20\ \text{food} + \$15\ \text{transit} + \$10\ \text{fun} + \$5\ \text{savings}`;

Deno.test("content that needs more room grows the allocation deterministically, up to the ceiling", () => {
  const wide: WhiteboardFigureContent = {
    ...math,
    id: "current-budget",
    expressions: [{ id: "split", latex: budgetRow }],
  };
  const grown = prepareFigure(wide, { id: "test" });
  assert(grown.ok);
  assert(grown.figure.allocation.width > 800);
  assertEquals(grown.figure.allocation.height, 520);
  assert(grown.figure.base.bounds!.width > 800 - 2 * 24);
  // Growth is a pure function of content and requested options.
  const again = prepareFigure(wide, { id: "test" });
  assert(again.ok);
  assertEquals(again.figure.allocation, grown.figure.allocation);
  assertEquals(again.figure.complete.markup, grown.figure.complete.markup);
  assertEquals(again.figure.optionsKey, grown.figure.optionsKey);
  // The board composes the grown figure; the export widens instead of clipping.
  const board = renderWhiteboardSvg(boardExample([wide]));
  assert(board.width > 800 - 2 * 24);

  // A ceiling equal to the request restores the strict behavior, with the exact need reported.
  const capped = prepareFigure(wide, { id: "test", maxWidth: 800 });
  assert(!capped.ok);
  assertEquals(capped.issues[0].code, "CONTENT_DOES_NOT_FIT");
  assertEquals(capped.issues[0].path, ["expressions"]);
  assertEquals(capped.issues[0].elementId, "split");
  assertEquals(capped.issues[0].figureId, "current-budget");
  const required = capped.issues[0].required;
  assert(typeof required === "object" && required.width! > 800);
  assert(!/increase the (width|height|board)/i.test(capped.issues[0].message));

  // Past twice the allocation the content itself must change; the failure stays repairable.
  const huge = prepareFigure({
    ...math,
    expressions: [{ id: "final", latex: "x+".repeat(60) + "x" }],
  }, { id: "test" });
  assert(!huge.ok);
  assertEquals(huge.issues[0].code, "CONTENT_DOES_NOT_FIT");
  assert(huge.error.repairable);

  // Content that fits keeps the requested allocation, so existing boards are unchanged.
  const plain = prepareFigure(math, { id: "test" });
  assert(plain.ok);
  assertEquals(plain.figure.allocation, { width: 800, height: 520 });
});

Deno.test("every figure family grows toward its stated requirement or in steps, never past the ceiling", () => {
  const pie = prepareFigure({
    type: "pie_chart",
    id: "pie",
    title: null,
    annotations: [],
    slices: Array.from({ length: 12 }, (_, i) => ({
      id: `s${i}`,
      label: `Slice ${i}`,
      value: 10,
    })),
  } as WhiteboardFigureContent, { id: "test" });
  assert(pie.ok);
  assertEquals(pie.figure.allocation, { width: 800, height: 12 * 48 + 130 });

  const bars = prepareFigure({
    type: "xy_chart",
    id: "bars",
    title: null,
    annotations: [],
    chartStyle: "bar",
    xLabel: "x",
    yLabel: "y",
    series: Array.from({ length: 6 }, (_, s) => ({
      id: `series-${s}`,
      name: `S${s}`,
      points: Array.from({ length: 40 }, (_, c) => ({
        id: `p${s}-${c}`,
        x: `c${c}`,
        y: c + s,
      })),
    })),
  } as WhiteboardFigureContent, { id: "test" });
  assert(bars.ok);
  assert(bars.figure.allocation.width > 800);
  assert(bars.figure.allocation.width <= 1600);
  assertEquals(bars.figure.allocation.height, 520);

  // Overlapping ticks only say "grow": the allocation steps by 25% until labels clear.
  const plane = (tickStep: number) =>
    prepareFigure({
      type: "coordinate_plot",
      id: "plane",
      title: null,
      annotations: [],
      axes: { x: { min: 0, max: 10, tickStep }, y: { min: -1, max: 1 } },
      elements: [],
    } as WhiteboardFigureContent, { id: "test" });
  const loose = plane(0.5);
  assert(loose.ok);
  assertEquals(loose.figure.allocation, { width: 800, height: 520 });
  const dense = plane(0.25);
  assert(dense.ok);
  assert([1000, 1250, 1563].includes(dense.figure.allocation.width));
  assert([650, 813, 1016].includes(dense.figure.allocation.height));

  // Landscape boards cap width growth tighter than portrait ones.
  const landscape = prepareFigure(
    {
      ...math,
      expressions: [{ id: "split", latex: budgetRow }],
    },
    figureOptions({ orientation: "landscape" }, 0),
  );
  assert(landscape.ok);
  assertEquals(figureOptions({ orientation: "landscape" }, 0).maxWidth, 1200);
  assertEquals(figureOptions({}, 0).maxWidth, 1600);
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

import { assert, assertEquals, assertThrows } from "@std/assert";
import { textFigure, textFigureSchema } from "../figures/text.ts";
import { WHITEBOARD_SPEC_SYSTEM_PROMPT } from "../prompt.ts";
import { WhiteboardOutput } from "../schema.ts";
import { graphTextBounds } from "./font.ts";
import { renderHandwritten } from "./handwritten.ts";
import { renderWhiteboardSvg } from "./index.ts";
import {
  hardTextBoard,
  normalTextBoard,
  textExample,
  textExamples,
} from "./text-examples.ts";
import { renderTextFigureDrawing } from "./text.ts";
import { COLORS, SERIES_COLORS, TEXT_FIGURE_STYLE } from "./theme.ts";

Deno.test("text is registered in the output schema and generation prompt", () => {
  const example = { ...textFigure.example.output, anchor: null, side: null };
  assertEquals(
    WhiteboardOutput.parse({ title: null, figures: [example] }).figures[0],
    example,
  );
  assert(WHITEBOARD_SPEC_SYSTEM_PROMPT.includes("## text"));
  assert(
    WHITEBOARD_SPEC_SYSTEM_PROMPT.includes(
      JSON.stringify(textFigure.example.output.text),
    ),
  );
  assert(
    WHITEBOARD_SPEC_SYSTEM_PROMPT.includes(
      "before and above the visualization",
    ),
  );
  assert(
    WHITEBOARD_SPEC_SYSTEM_PROMPT.includes("after and below the visualization"),
  );
  for (const text of ["", " \n ", 123, null]) {
    assert(
      !textFigureSchema.safeParse({
        ...textFigure.example.output,
        text,
      }).success,
    );
  }
  for (
    const extra of [{ role: "warning" }, { fontSize: 40 }, { text: undefined }]
  ) {
    assert(
      !textFigureSchema.safeParse({ ...textFigure.example.output, ...extra })
        .success,
    );
  }
});

Deno.test("roles share dimensions and typography with the requested dashed colors", () => {
  const drawings = (["note", "question", "takeaway"] as const).map((role) =>
    renderTextFigureDrawing(textExample(role, "Identical content."), {
      id: "test",
    })
  );
  const borders = [SERIES_COLORS[5], SERIES_COLORS[1], SERIES_COLORS[3]];
  drawings.forEach((drawing, i) => {
    assertEquals(drawing.bounds, drawings[0].bounds);
    assert(drawing.markup.includes(`stroke="${borders[i]}"`));
    assert(
      drawing.markup.includes(
        `stroke-dasharray="${TEXT_FIGURE_STYLE.dashArray.join(" ")}"`,
      ),
    );
    assert(
      drawing.markup.includes(
        `fill="${i === 2 ? SERIES_COLORS[3] : COLORS.ink}" xml:space`,
      ),
    );
    assert(
      drawing.markup.includes(`font-size="${TEXT_FIGURE_STYLE.fontSize}"`),
    );
    assert(drawing.markup.includes('fill="none"'));
  });
});

Deno.test("long text, explicit newlines, and glyphs are retained inside growing borders", () => {
  const text = "Åäö & < >\n\n" + "abcdefghijklmnopqrstuvwxyz".repeat(30);
  const drawing = renderTextFigureDrawing(textExample("note", text), {
    id: "test",
    width: 240,
    height: 80,
  });
  assert(drawing.bounds!.height > 80);
  assert(!drawing.markup.includes("clipPath"));
  const lines = [
    ...drawing.markup.matchAll(
      /<text x="([^"]+)" y="([^"]+)"[^>]*>(.*?)<\/text>/g,
    ),
  ];
  const decode = (s: string) =>
    s.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
  assertEquals(
    lines.map((m) => decode(m[3])).join(""),
    text.replaceAll("\n", ""),
  );
  assert(lines.some((m) => m[3] === ""), "Blank lines must survive wrapping.");
  for (const line of lines) {
    const bounds = graphTextBounds(
      decode(line[3]),
      TEXT_FIGURE_STYLE.fontSize,
      Number(line[1]),
      Number(line[2]),
    );
    if (!bounds) continue;
    assert(bounds.x >= TEXT_FIGURE_STYLE.padding - 1e-6);
    assert(bounds.x + bounds.width <= 240 - TEXT_FIGURE_STYLE.padding + 1e-6);
    assert(bounds.y >= TEXT_FIGURE_STYLE.padding - 1e-6);
    assert(
      bounds.y + bounds.height <=
        drawing.focusBounds.height - TEXT_FIGURE_STYLE.padding + 1e-6,
    );
  }
});

Deno.test("text borders hug the longest measured line within the maximum width", () => {
  for (
    const text of [
      "Yes.",
      "Short\nA longer second line",
      "A longer message that wraps across several lines. ".repeat(8),
    ]
  ) {
    const figure = textExample("note", text);
    const drawing = renderTextFigureDrawing(figure, { id: "test", width: 360 });
    const content = drawing.targets.get("note.text")!.bounds;
    assertEquals(
      drawing.focusBounds.width,
      content.width + 2 * TEXT_FIGURE_STYLE.padding,
    );
    assert(drawing.focusBounds.width <= 360 + 1e-6);
    assertEquals(content.x, TEXT_FIGURE_STYLE.padding);
    if (text === "Yes.") {
      assert(drawing.focusBounds.width < 120);
      const wider = renderTextFigureDrawing(figure, { id: "test", width: 800 });
      assertEquals(wider.focusBounds, drawing.focusBounds);
    }
  }
});

Deno.test("titles center over compact text borders without widening them", () => {
  const figure = {
    ...textExample("note", "Yes."),
    title: "A much longer title above a short message",
  };
  const drawing = renderTextFigureDrawing(figure, { id: "test" });
  const title = drawing.targets.get("note.title")!.bounds;
  const body = drawing.targets.get("note.text")!.bounds;
  assert(
    Math.abs(
      title.x + title.width / 2 - (() => {
        const b = renderTextFigureDrawing({ ...figure, title: null }, {
          id: "test",
        }).bounds!;
        return b.x + b.width / 2;
      })(),
    ) < 1e-6,
  );
  assert(drawing.focusBounds.width < title.width);
  assert(title.y + title.height < drawing.focusBounds.y);
  assert(body.y > drawing.focusBounds.y);
  const result = renderWhiteboardSvg({
    title: null,
    figures: [{ ...figure, anchor: null, side: null }],
  });
  assert(result.bounds.x <= title.x);
  assert(result.width >= title.width);
});

Deno.test("text borders use one repeatable handwritten dashed pass with rounded ends", () => {
  const figure = textExample("note", "A handwritten border.");
  const drawing = renderTextFigureDrawing(figure, { id: "test", seed: 10 });
  const clean = renderTextFigureDrawing(figure, { id: "test", roughness: 0 });
  const differentSeed = renderTextFigureDrawing(figure, {
    id: "test",
    seed: 11,
  });
  assertEquals(
    drawing,
    renderTextFigureDrawing(figure, { id: "test", seed: 10 }),
  );
  assertEquals(drawing.targets, clean.targets);
  assertEquals(drawing.targets, differentSeed.targets);
  assert(drawing.markup !== clean.markup);
  assert(drawing.markup !== differentSeed.markup);
  assertEquals((drawing.markup.match(/<path\b/g) ?? []).length, 1);
  assert(drawing.markup.includes('stroke-linecap="round"'));
  assert(drawing.markup.includes('stroke-linejoin="round"'));
  assert(!drawing.markup.includes('opacity="0.45"'));
  assert(!drawing.markup.includes("<rect"));
  // Existing annotation outlines retain their normal two solid passes.
  const annotation = renderHandwritten({
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
  }, { id: "annotation" });
  assertEquals((annotation.markup.match(/<path\b/g) ?? []).length, 2);
  assert(!annotation.markup.includes("stroke-dasharray"));
});

Deno.test("title and text targets participate in the complete annotation pipeline", () => {
  const figure = {
    ...textExample("note", "Text with a teaching annotation."),
    title: "A title that wraps across several lines without losing any words",
    annotations: [
      { type: "underline" as const, targetIds: ["note.title"], content: null },
      {
        type: "arrow" as const,
        targetIds: ["note.text"],
        content: "Read the complete message.",
      },
    ],
  };
  const drawing = renderTextFigureDrawing(figure, { id: "test", width: 300 });
  assert(drawing.targets.has("note.title"));
  assert(drawing.targets.has("note.text"));
  const result = renderWhiteboardSvg({
    title: null,
    figures: [{ ...figure, anchor: null, side: null }],
  }, { width: 300 });
  assertEquals(result.calloutPlacements.length, 1);
  assertEquals(result.svg.split("@font-face").length - 1, 1);
  const noTitle = renderTextFigureDrawing(textExample("note", "No title"), {
    id: "test",
  });
  assert(!noTitle.targets.has("note.title"));
});

Deno.test("all gallery boards render through the parent pipeline in visual reading order", () => {
  for (const { board } of textExamples) {
    const result = renderWhiteboardSvg(board);
    assert(Number.isFinite(result.width) && result.width > 0);
    assert(Number.isFinite(result.height) && result.height > 0);
    const local = board.figures.map((figure) =>
      renderWhiteboardSvg({
        title: null,
        figures: [{ ...figure, anchor: null, side: null }],
      }).bounds
    );
    for (let i = 1; i < board.figures.length; i++) {
      const above = result.figurePlacements[i - 1],
        below = result.figurePlacements[i];
      assert(
        above.y + local[i - 1].y + local[i - 1].height + 32 <=
          below.y + local[i].y + 1e-6,
      );
    }
  }
});

Deno.test("mixed boards reject reversed, disconnected, or sideways text ordering", () => {
  const invalid = (mutate: (spec: typeof normalTextBoard) => void) => {
    const spec = structuredClone(normalTextBoard);
    mutate(spec);
    assert(!WhiteboardOutput.safeParse(spec).success);
    assertThrows(() => renderWhiteboardSvg(spec));
  };
  invalid((spec) => {
    spec.figures[1].side = "top";
  });
  invalid((spec) => {
    spec.figures[2].side = "top";
  });
  invalid((spec) => {
    spec.figures[3].side = "left";
  });
  invalid((spec) => {
    spec.figures[2].anchor = "question";
  });
  invalid((spec) => {
    spec.figures[1].anchor = null;
  });
  invalid((spec) => {
    spec.figures.push({
      ...textExample("question", "Too late?"),
      anchor: "fruit",
      side: "bottom",
    });
  });
  invalid((spec) => {
    spec.figures[0] = {
      ...textExample("note", "Too early."),
      anchor: null,
      side: null,
    };
  });
  invalid((spec) => {
    spec.figures[2].anchor = "takeaway";
  });
});

Deno.test("question groups and repeated question/answer sections preserve valid placement", () => {
  const spec = structuredClone(normalTextBoard);
  spec.figures.splice(1, 0, {
    ...textExample("question", "How can the bars help?"),
    id: "followup",
    anchor: "question",
    side: "bottom",
  });
  spec.figures[2].anchor = "followup";
  assert(WhiteboardOutput.safeParse(spec).success);
  const next = structuredClone(normalTextBoard.figures).map((figure) => ({
    ...figure,
    id: `${figure.id}-two`,
    anchor: figure.anchor === null ? "takeaway" : `${figure.anchor}-two`,
    side: "bottom" as const,
  }));
  spec.figures.push(...next);
  assert(WhiteboardOutput.safeParse(spec).success);
  renderWhiteboardSvg(spec);
});

Deno.test("invalid glyphs, targets, duplicate IDs, and unusable widths fail explicitly", () => {
  assertThrows(
    () =>
      renderTextFigureDrawing(textExample("note", "Unsupported 🦄"), {
        id: "test",
      }),
    Error,
    "has no glyph",
  );
  for (const width of [0, 32, NaN, Infinity]) {
    assertThrows(() =>
      renderTextFigureDrawing(textExample("note", "Wide"), {
        id: "test",
        width,
      })
    );
  }
  const spec = structuredClone(hardTextBoard);
  spec.figures[2].annotations = [{
    type: "circle",
    targetIds: ["note.missing"],
    content: null,
  }];
  assertThrows(() => renderWhiteboardSvg(spec), Error, "note.missing");
  spec.figures[2].id = "question";
  assert(!WhiteboardOutput.safeParse(spec).success);
});

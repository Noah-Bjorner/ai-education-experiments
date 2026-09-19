import { boardExample } from "./board-example.ts";
import type { WhiteboardFigureContent } from "../schema.ts";
/**
 * Tests: deno test --allow-read=fonts index-test.ts
 * Demo:  deno run --allow-read=fonts --allow-write=output-ex index-test.ts
 * Uses saved sample data; no LLM call or credentials needed.
 */
import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertThrows,
} from "@std/assert";
import { mathExpressions } from "../figures/math-expressions.ts";
import { textFigure } from "../figures/text.ts";
import { WhiteboardOutput, type WhiteboardSpec } from "../schema.ts";
import { coordinateExamples } from "./coordinate-gallery.ts";
import { geometryExamples } from "./geometry-examples.ts";
import { renderCoordinatePlotDrawing } from "./coordinate-plot.ts";
import { renderGeometryDrawing } from "./geometry.ts";
import { renderCircularGraphDrawing, renderXyGraphDrawing } from "./graphs.ts";
import { renderWhiteboardSvg } from "./index.ts";
import { renderMathExpressionsDrawing } from "./math-expressions.ts";
import { renderTextFigureDrawing } from "./text.ts";

const books = {
  type: "pie_chart",
  id: "books",
  title: "Book collection (20 books)",
  annotations: [
    { type: "highlight", targetIds: ["fiction.percentage"], text: null },
    { type: "highlight", targetIds: ["fiction.legend-label"], text: null },
    {
      type: "callout",
      targetIds: ["fiction"],
      text: "Fiction makes up more than half the collection",
    },
    {
      type: "group",
      targetIds: ["nonfiction.legend-label", "poetry.legend-label"],
      text: "The remaining genres",
    },
  ],
  slices: [
    { id: "fiction", label: "Fiction", value: 12 },
    { id: "nonfiction", label: "Nonfiction", value: 6 },
    { id: "poetry", label: "Poetry", value: 2 },
  ],
} satisfies WhiteboardFigureContent;

const trend = {
  type: "xy_chart",
  id: "trend",
  title: "Illustrative rise and fall",
  chartStyle: "line",
  xLabel: "Time",
  yLabel: "Value",
  series: [{
    id: "values",
    name: "Example values",
    // Deliberately unsorted: semantic identities must survive sorting.
    points: [{ id: "last", x: 3, y: 2 }, { id: "peak", x: 2, y: 4 }, {
      id: "first",
      x: 0,
      y: 0,
    }, { id: "middle", x: 1, y: 2 }],
  }],
  annotations: [
    { type: "highlight", targetIds: ["peak"], text: null },
    { type: "number", targetIds: ["first", "last"], text: null },
    { type: "strikeout", targetIds: ["values"], text: null },
    { type: "strikeout", targetIds: ["y-label"], text: null },
  ],
} satisfies WhiteboardFigureContent;

const bookSpec: WhiteboardSpec = boardExample([books]);
const count = (text: string, pattern: RegExp) =>
  [...text.matchAll(pattern)].length;

Deno.test("base and emphasis are retained before callout placement", () => {
  const before = JSON.stringify(bookSpec);
  const result = renderWhiteboardSvg(bookSpec);
  assertEquals(JSON.stringify(bookSpec), before);
  assertEquals(renderWhiteboardSvg(bookSpec), result);
  assert(!result.stages.base.svg.includes("data-annotation-type"));
  assert(result.stages.base.svg.includes('data-figure-type="pie_chart"'));
  assert(result.stages.base.svg.includes('data-layer="base"'));
  assert(result.svg.includes('data-annotation-index="0"'));
  assertEquals(count(result.stages.emphasis.svg, /data-annotation-type=/g), 2);
  assertEquals(count(result.svg, /data-annotation-type=/g), 4);
  assertEquals(result.svg, result.stages.callouts.svg);
  assertEquals(result.calloutPlacements.map((item) => item.type).sort(), [
    "arrow",
    "bracket",
  ]);
  assert(result.svg.includes("The remaining genres"));
  for (
    const id of [
      "books.fiction.percentage",
      "books.fiction.legend-label",
      "books.fiction.mark",
    ]
  ) {
    assert(result.stages.base.svg.includes(`id="${id}"`));
  }
  const withoutAnnotations = renderWhiteboardSvg(
    boardExample([{ ...books, annotations: [] }]),
  );
  const stripFrame = (svg: string) =>
    svg.replace(/ width="[^"]+" height="[^"]+" viewBox="[^"]+"/, "");
  assertEquals(
    stripFrame(result.stages.base.svg),
    stripFrame(withoutAnnotations.svg),
  );
});

Deno.test("emphasis intents pick marks from their targets, including numbering and rotated text", () => {
  const spec: WhiteboardSpec = boardExample([books, trend]);
  const result = renderWhiteboardSvg(spec, { roughness: 0 });
  for (const type of ["highlight", "number", "strikeout"]) {
    assert(result.svg.includes(`data-annotation-type="${type}"`));
  }
  // Compact marks and text get circles; elongated text gets a box; striking
  // out text uses the strikethrough segment.
  for (const mark of ["circle", "box", "strikethrough", "number"]) {
    assert(result.svg.includes(`data-annotation-mark="${mark}"`), mark);
  }
  // One number annotation fans out in target order.
  assert(result.svg.includes(">1</text>"));
  assert(result.svg.includes(">2</text>"));
  const base = renderXyGraphDrawing(trend, { id: "test" });
  assert(
    base.targets.get("trend.first.mark")!.bounds.x <
      base.targets.get("trend.last.mark")!.bounds.x,
  );
  const vertical = base.targets.get("trend.y-label")!;
  assert(vertical.kind === "text");
  assertEquals(
    vertical.decorations.strikethrough.a.x,
    vertical.decorations.strikethrough.b.x,
  );
  const b = vertical.bounds;
  const x = (b.x + b.width / 2).toFixed(2);
  assert(
    result.svg.includes(`M ${x} ${b.y.toFixed(2)} C ${x}`),
    "Y-axis strikethrough must run vertically through the label",
  );
});

Deno.test("emphasis follows resized targets and enlarges tight export bounds", () => {
  const figure = {
    ...trend,
    annotations: [{
      type: "highlight" as const,
      targetIds: ["title"],
      text: null,
    }],
  };
  const small = renderWhiteboardSvg(boardExample([figure]), {
    width: 600,
    height: 400,
  });
  const large = renderWhiteboardSvg(boardExample([figure]), {
    width: 1000,
    height: 600,
  });
  const smallPlain = renderWhiteboardSvg(
    boardExample([{ ...figure, annotations: [] }]),
    { width: 600, height: 400 },
  );
  const largePlain = renderWhiteboardSvg(
    boardExample([{ ...figure, annotations: [] }]),
    { width: 1000, height: 600 },
  );
  assert(small.bounds.y < smallPlain.bounds.y);
  assert(large.bounds.y < largePlain.bounds.y);
  assert(small.bounds.height > smallPlain.bounds.height);
  assert(large.bounds.height > largePlain.bounds.height);
  assert(small.svg !== large.svg);
  for (const result of [small, large]) {
    assert(
      result.svg.includes(
        `viewBox="${result.bounds.x} ${result.bounds.y} ${result.width} ${result.height}"`,
      ),
    );
    for (
      const match of result.svg.matchAll(
        /\s(?:d|x|y|cx|cy|r|width|height|viewBox|transform)="([^"]*)"/g,
      )
    ) {
      assert(!/NaN|Infinity/.test(match[1]));
    }
  }
});

Deno.test("anchored figures translate complete content and share font definitions", () => {
  for (const side of ["top", "left", "right", "bottom"] as const) {
    const result = renderWhiteboardSvg(boardExample([books, trend], side));
    assertEquals(count(result.svg, /@font-face/g), 1);
    for (const stage of Object.values(result.stages)) {
      for (const [i, id] of ["books", "trend"].entries()) {
        const { x, y } = result.figurePlacements[i];
        assert(
          new RegExp(
            `data-figure-id="${id}" data-figure-type="[^"]+" transform="translate\\(${x} ${y}\\)"`,
          ).test(stage.svg),
        );
      }
    }

    assert(
      result.svg.includes(
        `translate(${result.figurePlacements[1].x} ${
          result.figurePlacements[1].y
        })`,
      ),
    );
    const ids = [...result.svg.matchAll(/\sid="([^"]+)"/g)].map((match) =>
      match[1]
    );
    assertEquals(new Set(ids).size, ids.length);
    for (const match of result.svg.matchAll(/url\(#([^)]+)\)/g)) {
      assert(ids.includes(match[1]));
    }
  }
});

Deno.test("export balances annotation overflow so the base stays centered", () => {
  const figure = {
    type: "math_expressions" as const,
    id: "combine",
    title: "Combine like terms",
    annotations: [{
      type: "callout" as const,
      targetIds: ["group"],
      text: "Constants: 5 - 1 = 4, not -4",
    }],
    expressions: [
      { id: "start", latex: "3x + 5 + 2x - 1" },
      { id: "group", latex: "(3x + 2x) + (5 - 1)" },
      { id: "answer", latex: "5x + 4" },
    ],
  };
  const annotated = renderWhiteboardSvg(boardExample([figure]));
  const plain = renderWhiteboardSvg(
    boardExample([{ ...figure, annotations: [] }]),
  );
  for (const stage of Object.values(annotated.stages)) {
    assertEquals(stage.bounds, annotated.bounds);
  }
  const subject = plain.bounds;
  const frame = annotated.bounds;
  assertAlmostEquals(
    subject.x - frame.x,
    frame.x + frame.width - (subject.x + subject.width),
  );
  assertEquals(frame.y, annotated.contentBounds.y);
  assertEquals(frame.height, annotated.contentBounds.height);
  assert(frame.width > subject.width);
  assert(annotated.contentBounds.width <= frame.width);
  const titled = renderWhiteboardSvg({
    title: "Combine like terms",
    figures: boardExample([figure]).figures,
  });
  const titledPlain = renderWhiteboardSvg({
    title: "Combine like terms",
    figures: boardExample([{ ...figure, annotations: [] }]).figures,
  });
  const titleX = (svg: string) => {
    const match = svg.match(
      /data-board-title=""[^>]*transform="translate\(([^ ]+) /,
    );
    assert(match);
    return Number(match[1]);
  };
  assertAlmostEquals(titleX(titled.svg), titleX(titledPlain.svg));
});

Deno.test("invalid references and duplicate IDs fail clearly; striking out a mark draws a cross", () => {
  const renderTarget = (
    targetId: string,
    type: "highlight" | "strikeout" = "highlight",
  ) =>
    renderWhiteboardSvg(boardExample([{
      ...books,
      annotations: [{ type, targetIds: [targetId], text: null }],
    }]));
  for (
    const target of [
      "missing.percentage",
      "books.missing.percentage",
      "other.fiction.percentage",
      "fiction.wedge",
    ]
  ) {
    assertThrows(() => renderTarget(target), Error, "Unknown or unavailable");
  }
  assertThrows(
    () => renderTarget("fiction", "strikeout"),
    Error,
    "cannot target",
  );
  assert(
    renderWhiteboardSvg(boardExample([{
      ...trend,
      annotations: [{ type: "strikeout", targetIds: ["peak"], text: null }],
    }])).svg.includes('data-annotation-mark="cross"'),
  );
  assert(
    renderTarget("fiction.legend-label", "strikeout").svg.includes(
      'data-annotation-mark="strikethrough"',
    ),
  );
  assertThrows(
    () => renderWhiteboardSvg(boardExample([books, books], "right")),
    Error,
    "Duplicate figure ID",
  );
  assertThrows(
    () =>
      renderWhiteboardSvg(
        boardExample([{
          ...books,
          slices: [books.slices[0], books.slices[0]],
        }]),
      ),
    Error,
    "Duplicate element ID",
  );
  assertThrows(
    () => renderWhiteboardSvg(bookSpec, { width: Infinity }),
    Error,
    "finite positive",
  );
});

Deno.test("tiny slices keep a percentage target on the legend detail line", () => {
  const figure = {
    ...books,
    slices: [{ id: "majority", label: "Majority", value: 99 }, {
      id: "tiny",
      label: "Tiny",
      value: 1,
    }],
    annotations: [],
  };
  const base = renderCircularGraphDrawing(figure, { id: "test" });
  assert(base.targets.has("books.tiny.mark"));
  const fallback = base.targets.get("books.tiny.percentage")!;
  const legend = base.targets.get("books.tiny.legend-label")!;
  assert(fallback.kind === "text");
  // The interior label is omitted, so the target sits under the legend name.
  assert(fallback.bounds.y > legend.bounds.y);
  assert(fallback.bounds.x >= legend.bounds.x - 0.01);
  const result = renderWhiteboardSvg(boardExample([{
    ...figure,
    annotations: [{
      type: "highlight",
      targetIds: ["tiny.percentage"],
      text: null,
    }],
  }]));
  assert(result.svg.includes('data-target-id="books.tiny.percentage"'));
});

Deno.test("board figures require explicit IDs and placement; legacy layout is rejected", () => {
  const { id: _id, ...withoutId } = books;
  assert(
    !WhiteboardOutput.safeParse({
      title: null,
      figures: [{ ...withoutId, anchor: null, side: null }],
    }).success,
  );
  assert(
    !WhiteboardOutput.safeParse({ title: null, figures: [books] }).success,
  );
  assert(
    !WhiteboardOutput.safeParse({ ...bookSpec, layout: "single" }).success,
  );
});

Deno.test("board title is uppercase, boxed, centered on the base figures, and shared across stages", () => {
  const figures = boardExample([{ ...books, annotations: [] }]).figures;
  const untitled = renderWhiteboardSvg({ title: null, figures });
  const titled = renderWhiteboardSvg({
    title: "Compare the charts",
    figures,
  });
  assertEquals(titled.figurePlacements, untitled.figurePlacements);
  assertEquals(count(titled.svg, /data-board-title(?!-)/g), 1);
  assert(titled.svg.includes('data-drawing="static"'));
  assertEquals(count(titled.svg, /data-board-title-box/g), 1);
  assert(!untitled.svg.includes("data-board-title"));
  assert(titled.svg.includes(">COMPARE THE CHARTS<"));
  const alternateGap = renderWhiteboardSvg({
    title: "Compare the charts",
    figures,
  }, { gap: 80 });
  // Figure spacing is independent of title spacing for a single-figure board.
  assertEquals(titled.bounds, alternateGap.bounds);
  assert(titled.bounds.y < untitled.bounds.y);
  for (const stage of Object.values(titled.stages)) {
    assert(stage.svg.includes("data-board-title"));
    assert(stage.svg.includes("data-board-title-box"));
    assert(stage.bounds.y < untitled.bounds.y);
  }
});

Deno.test("null figure titles omit the title target and reject title annotations", () => {
  const untitled = { ...books, title: null, annotations: [] };
  const result = renderWhiteboardSvg(boardExample([untitled]));
  assert(!result.svg.includes('id="books.title"'));
  assert(!result.svg.includes("title-underline"));
  assertThrows(
    () =>
      renderWhiteboardSvg(boardExample([{
        ...untitled,
        annotations: [{
          type: "highlight",
          targetIds: ["title"],
          text: null,
        }],
      }])),
    Error,
    "Unknown or unavailable",
  );
});

Deno.test("untitled figures have no reserved title gap and titled figures are underlined", () => {
  const options = { id: "untitled-figure" };
  const pairs = [
    [
      renderCircularGraphDrawing(
        { ...books, title: null, annotations: [] },
        options,
      ),
      renderCircularGraphDrawing({ ...books, annotations: [] }, options),
    ],
    [
      renderXyGraphDrawing({ ...trend, title: null, annotations: [] }, options),
      renderXyGraphDrawing({ ...trend, annotations: [] }, options),
    ],
    [
      renderMathExpressionsDrawing({
        ...mathExpressions.example.output,
        title: null,
      }, options),
      renderMathExpressionsDrawing({
        ...mathExpressions.example.output,
        title: "Solve for x",
      }, options),
    ],
    [
      renderGeometryDrawing({
        ...geometryExamples[0],
        title: null,
        annotations: [],
      }, options),
      renderGeometryDrawing(
        { ...geometryExamples[0], annotations: [] },
        options,
      ),
    ],
    [
      renderCoordinatePlotDrawing({
        ...coordinateExamples[0],
        title: null,
        annotations: [],
      }, options),
      renderCoordinatePlotDrawing({
        ...coordinateExamples[0],
        annotations: [],
      }, options),
    ],
    [
      renderTextFigureDrawing({
        ...textFigure.example.output,
        title: null,
        annotations: [],
      }, options),
      renderTextFigureDrawing({
        ...textFigure.example.output,
        title: "A heading",
        annotations: [],
      }, options),
    ],
  ] as const;
  for (const [untitled, titled] of pairs) {
    assert(
      ![...untitled.targets.keys()].some((id) => id.endsWith(".title")),
    );
    assert([...titled.targets.keys()].some((id) => id.endsWith(".title")));
    assert(untitled.bounds && titled.bounds);
    assert(
      untitled.bounds.y > titled.bounds.y,
      "Untitled export must not reserve empty title space",
    );
  }
  const board = renderWhiteboardSvg(
    boardExample([{ ...books, annotations: [] }]),
  );
  assert(board.svg.includes("data-figure-title-underline"));
  assert(board.svg.includes('id="books.title"'));
});

if (import.meta.main) {
  const output = new URL("./output-ex/", import.meta.url);
  await Deno.mkdir(output, { recursive: true });
  const result = renderWhiteboardSvg(bookSpec);
  await Deno.writeTextFile(
    new URL("whiteboard-base.svg", output),
    result.stages.base.svg,
  );
  await Deno.writeTextFile(new URL("whiteboard-final.svg", output), result.svg);
  const emphasisDemo = renderWhiteboardSvg(boardExample([trend]));
  await Deno.writeTextFile(
    new URL("whiteboard-emphasis-demo.svg", output),
    emphasisDemo.svg,
  );
  console.log(
    `Wrote base, final, and emphasis demo SVGs to ${output.pathname}`,
  );
  console.log(
    `Placed: ${
      result.calloutPlacements.map((item) => `${item.type} (${item.side})`)
        .join(", ")
    }`,
  );
}

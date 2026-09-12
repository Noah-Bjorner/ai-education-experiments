import { boardExample } from "./board-example.ts";
import type { WhiteboardFigureContent } from "../schema.ts";
/**
 * Tests: deno test --allow-read=fonts index-test.ts
 * Demo:  deno run --allow-read=fonts --allow-write=output-ex index-test.ts
 * Uses saved sample data; no LLM call or credentials needed.
 */
import { assert, assertEquals, assertThrows } from "@std/assert";
import { mathExpressions } from "../figures/math-expressions.ts";
import { WhiteboardOutput, type WhiteboardSpec } from "../schema.ts";
import { coordinateExamples } from "./coordinate-gallery.ts";
import { freeformExamples } from "./freeform-examples.ts";
import { geometryExamples } from "./geometry-examples.ts";
import { renderCoordinatePlotDrawing } from "./coordinate-plot.ts";
import { renderFreeformDrawing } from "./freeform.ts";
import { renderGeometryDrawing } from "./geometry.ts";
import { renderCircularGraphDrawing, renderXyGraphDrawing } from "./graphs.ts";
import { renderWhiteboardSvg } from "./index.ts";
import { renderMathExpressionsDrawing } from "./math-expressions.ts";

const books = {
  type: "pie_chart",
  id: "books",
  title: "Book collection (20 books)",
  annotations: [
    { type: "circle", targetIds: ["books.fiction.percentage"], content: null },
    {
      type: "underline",
      targetIds: ["books.fiction.legend-label"],
      content: null,
    },
    {
      type: "arrow",
      targetIds: ["books.fiction.mark"],
      content: "Fiction makes up more than half the collection",
    },
    {
      type: "bracket",
      targetIds: ["books.nonfiction.legend-label", "books.poetry.legend-label"],
      content: "The remaining genres",
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
    { type: "box", targetIds: ["trend.peak.mark"], content: null },
    { type: "number", targetIds: ["trend.first.mark"], content: "1" },
    { type: "number", targetIds: ["trend.last.mark"], content: "2" },
    {
      type: "strikethrough",
      targetIds: ["trend.values.legend-label"],
      content: null,
    },
    { type: "underline", targetIds: ["trend.y-label"], content: null },
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
  assertEquals(result.stages.base.svg, withoutAnnotations.svg);
});

Deno.test("all five emphasis types render, including numbering and rotated text", () => {
  const spec: WhiteboardSpec = boardExample([books, trend]);
  const result = renderWhiteboardSvg(spec, { roughness: 0 });
  for (
    const type of ["circle", "box", "underline", "strikethrough", "number"]
  ) {
    assert(result.svg.includes(`data-annotation-type="${type}"`));
  }
  assert(result.svg.includes(">1</text>"));
  assert(result.svg.includes(">2</text>"));
  const base = renderXyGraphDrawing(trend, { id: "test" });
  assert(
    base.targets.get("trend.first.mark")!.bounds.x <
      base.targets.get("trend.last.mark")!.bounds.x,
  );
  const vertical = base.targets.get("trend.y-label")!;
  assert(vertical.vertical);
  const b = vertical.bounds;
  const x = (b.x + b.width + 3).toFixed(2);
  assert(
    result.svg.includes(`M ${x} ${b.y.toFixed(2)} C ${x}`),
    "Y-axis underline must run vertically beside the label",
  );
});

Deno.test("emphasis follows resized targets and enlarges tight export bounds", () => {
  const figure = {
    ...trend,
    annotations: [{
      type: "circle" as const,
      targetIds: ["trend.title"],
      content: null,
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
  assert(small.bounds.y < small.stages.base.bounds.y);
  assert(large.bounds.y < large.stages.base.bounds.y);
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
          stage.svg.includes(
            `data-figure-id="${id}" transform="translate(${x} ${y})"`,
          ),
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

Deno.test("invalid references, duplicate IDs, and unsupported text targets fail clearly", () => {
  const renderTarget = (
    targetId: string,
    type: "circle" | "underline" = "circle",
  ) =>
    renderWhiteboardSvg(boardExample([{
      ...books,
      annotations: [{ type, targetIds: [targetId], content: null }],
    }]));
  assertThrows(
    () => renderTarget("books.missing.percentage"),
    Error,
    "Unknown or unavailable",
  );
  assertThrows(
    () => renderTarget("other.fiction.percentage"),
    Error,
    "Unknown or unavailable",
  );
  assertThrows(
    () => renderTarget("books.fiction.mark", "underline"),
    Error,
    "requires a text target",
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

Deno.test("tiny slices do not expose nonexistent percentage labels", () => {
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
  assert(!base.targets.has("books.tiny.percentage"));
  assertThrows(
    () =>
      renderWhiteboardSvg(boardExample([{
        ...figure,
        annotations: [{
          type: "circle",
          targetIds: ["books.tiny.percentage"],
          content: null,
        }],
      }])),
    Error,
    "Unknown or unavailable",
  );
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

Deno.test("board title is uppercase, boxed, centered on the figure union, and shared across stages", () => {
  const figures = boardExample([{ ...books, annotations: [] }]).figures;
  const untitled = renderWhiteboardSvg({ title: null, figures });
  const titled = renderWhiteboardSvg({
    title: "Compare the charts",
    figures,
  });
  assertEquals(titled.figurePlacements, untitled.figurePlacements);
  assertEquals(count(titled.svg, /data-board-title(?!-)/g), 1);
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
          type: "circle",
          targetIds: ["books.title"],
          content: null,
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
      renderMathExpressionsDrawing(mathExpressions.example.output, options),
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
      renderFreeformDrawing({
        ...freeformExamples[0],
        title: null,
        annotations: [],
      }, options),
      renderFreeformDrawing(
        { ...freeformExamples[0], annotations: [] },
        options,
      ),
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

import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  mathExpressions,
  mathExpressionsSchema,
} from "../children/math-expressions.ts";
import { whiteboardInputSchema, WhiteboardOutput } from "../schema.ts";
import { WHITEBOARD_SPEC_SYSTEM_PROMPT } from "../prompt.ts";
import { parseMathLatex } from "./latex.ts";
import { renderMathExpressionsDrawing } from "./math-expressions.ts";
import { renderWhiteboardSvg } from "./index.ts";

const child = mathExpressions.example.output;

Deno.test("math child is registered in input, output and generation instructions", () => {
  assertEquals(
    whiteboardInputSchema.parse({ goal: "Solve an equation" }).goal,
    "Solve an equation",
  );
  assertEquals(
    WhiteboardOutput.parse({ layout: "single", children: [child] }).children[0],
    child,
  );
  assert(WHITEBOARD_SPEC_SYSTEM_PROMPT.includes("## math_expressions"));
  assert(WHITEBOARD_SPEC_SYSTEM_PROMPT.includes('"\\\\frac{x}{2} + 3 = 7"'));
  assert(
    !mathExpressionsSchema.safeParse({ ...child, expressions: [] }).success,
  );
  assert(
    !mathExpressionsSchema.safeParse({
      ...child,
      expressions: [{ id: "empty", latex: "  " }],
    }).success,
  );
});

Deno.test("LaTeX preserves fraction structure and script argument boundaries", () => {
  assertEquals(parseMathLatex(String.raw`\frac{x_1}{2}^2`), {
    kind: "row",
    children: [{
      kind: "scripts",
      base: {
        kind: "fraction",
        numerator: {
          kind: "row",
          children: [{
            kind: "scripts",
            base: { kind: "text", value: "x" },
            sup: undefined,
            sub: { kind: "text", value: "1" },
          }],
        },
        denominator: { kind: "row", children: [{ kind: "text", value: "2" }] },
      },
      sup: { kind: "text", value: "2" },
      sub: undefined,
    }],
  });
  const result = parseMathLatex("x^12");
  assert(result.kind === "row");
  assertEquals(result.children.length, 2); // TeX consumes one unbraced character.
  for (
    const input of [
      String.raw`\sqrt[3]{x}`,
      String.raw`\left[\frac{1}{2}\right]`,
      String.raw`\text{Area} = a^2`,
      String.raw`a_{i+1}^{2}`,
    ]
  ) {
    assertEquals(
      parseMathLatex(JSON.parse(JSON.stringify(input))),
      parseMathLatex(input),
    );
  }
});

Deno.test("malformed, unsupported and excessive LaTeX fails explicitly", () => {
  for (
    const input of [
      "",
      " ",
      "{}",
      "x^",
      "x_",
      "x^2^3",
      "x_1_2",
      "{x",
      "x}",
      "$x$",
      String.raw`\frac{x}`,
      String.raw`\frac{}{2}`,
      String.raw`\sqrt{}`,
      String.raw`\left(x\right]`,
      String.raw`\left(x`,
      String.raw`\left(x\rightarrow)`,
      String.raw`\alpha`,
      String.raw`\begin{matrix}`,
      String.raw`\href{url}{x}`,
      String.raw`\constructor`,
      String.raw`\text{a\command}`,
      "x".repeat(2001),
      "{".repeat(33) + "x" + "}".repeat(33),
    ]
  ) {
    assertThrows(() => parseMathLatex(input), Error);
  }
});

Deno.test("math renders in the board font with pen paths and measured row targets", () => {
  const input = {
    ...child,
    expressions: [
      {
        id: "quadratic",
        latex: String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
      },
      { id: "root", latex: String.raw`\sqrt[3]{8} = 2` },
      {
        id: "scripts",
        latex: String.raw`a_{i+1}^{2} \leq \left(\frac{b}{c}\right)^2`,
      },
    ],
  };
  const original = JSON.stringify(input);
  const drawing = renderMathExpressionsDrawing(input, { id: "math" });
  const result = renderWhiteboardSvg({ layout: "single", children: [input] });
  assertEquals(JSON.stringify(input), original);
  assertEquals(
    result.svg,
    renderWhiteboardSvg({ layout: "single", children: [input] }).svg,
  );
  assertEquals([...result.svg.matchAll(/@font-face/g)].length, 1);
  assert(result.svg.includes("Shantell Sans"));
  assert(result.svg.includes("<path"));
  assert(!/<(?:foreignObject|script|image)\b/.test(result.svg));
  let bottom = drawing.targets.get("solve.title")!.bounds.y +
    drawing.targets.get("solve.title")!.bounds.height;
  for (const expression of input.expressions) {
    const b = drawing.targets.get(`solve.${expression.id}.expression`)!.bounds;
    assert(b.y > bottom, "Equation rows must not overlap");
    assert(b.x >= 0 && b.x + b.width <= 800);
    assert(b.y + b.height <= 520);
    bottom = b.y + b.height;
  }
  for (
    const match of result.svg.matchAll(
      /\s(?:d|x|y|width|height|viewBox|transform)="([^"]*)"/g,
    )
  ) assert(!/NaN|Infinity/.test(match[1]));
});

Deno.test("math annotations and mixed chart boards compose without ID collisions", () => {
  const annotated = {
    ...child,
    annotations: [
      {
        type: "circle" as const,
        targetIds: ["solve.answer.expression"],
        content: null,
      },
      {
        type: "arrow" as const,
        targetIds: ["solve.subtract.expression"],
        content: "Subtract 3 from both sides",
      },
    ],
  };
  const result = renderWhiteboardSvg({
    layout: "split",
    children: [annotated, {
      type: "pie_chart",
      id: "pie",
      title: "Parts",
      slices: [{ id: "part", label: "Whole", value: 1 }],
    }],
  });
  assertEquals(result.calloutPlacements.length, 1);
  assert(result.svg.includes('data-annotation-type="circle"'));
  assert(!result.stages.base.svg.includes("data-annotation-type"));
  const ids = [...result.svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assertEquals(ids.length, new Set(ids).size);
  assertThrows(
    () =>
      renderWhiteboardSvg({
        layout: "single",
        children: [{
          ...child,
          expressions: [child.expressions[0], child.expressions[0]],
        }],
      }),
    Error,
    "Duplicate element ID",
  );
  assertThrows(
    () =>
      renderWhiteboardSvg({
        layout: "single",
        children: [{
          ...child,
          annotations: [{
            type: "circle",
            targetIds: ["solve.missing.expression"],
            content: null,
          }],
        }],
      }),
    Error,
    "Unknown or unavailable",
  );
});

Deno.test("math rejects unreadable content and unsupported glyphs and escapes text", () => {
  const render = (latex: string) =>
    renderWhiteboardSvg({
      layout: "single",
      children: [{ ...child, expressions: [{ id: "test", latex }] }],
    });
  assertThrows(
    () => render("x+".repeat(200) + "x"),
    Error,
    "do not fit legibly",
  );
  assertThrows(() => render(String.raw`\text{Δ}`), Error, "has no glyph");
  const result = render(String.raw`\text{<script>&}`);
  assert(result.svg.includes("&lt;script&gt;&amp;"));
  assert(!result.svg.includes("<script>"));
  for (
    const op of [
      "+",
      "-",
      "=",
      "<",
      ">",
      "times",
      "cdot",
      "div",
      "pm",
      "leq",
      "geq",
      "neq",
    ]
  ) {
    assert(
      render(`a ${op.length > 1 ? "\\" : ""}${op} b`).svg.includes("<path") ||
        op === "cdot",
    );
  }
});

if (import.meta.main) {
  const gallery = renderWhiteboardSvg({
    layout: "stack",
    children: [
      {
        ...child,
        annotations: [{
          type: "circle",
          targetIds: ["solve.answer.expression"],
          content: null,
        }],
      },
      {
        type: "math_expressions",
        id: "formulas",
        title: "Fractions, roots, and powers",
        expressions: [
          {
            id: "quadratic",
            latex: String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
          },
          { id: "root", latex: String.raw`\sqrt[3]{8} = 2` },
          {
            id: "scripts",
            latex: String.raw`a_{i+1}^{2} \leq \left(\frac{b}{c}\right)^2`,
          },
        ],
      },
    ],
  });
  await Deno.writeTextFile(
    new URL("./output-ex/math-expressions.svg", import.meta.url),
    gallery.svg,
  );
  console.log("Wrote output-ex/math-expressions.svg");
}

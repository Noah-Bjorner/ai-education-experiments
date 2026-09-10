import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  mathExpressions,
  mathExpressionsSchema,
} from "../children/math-expressions.ts";
import { whiteboardInputSchema, WhiteboardOutput } from "../schema.ts";
import { WHITEBOARD_SPEC_SYSTEM_PROMPT } from "../prompt.ts";
import { normalizeMathLatex, renderMathLatex } from "./latex.ts";
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

Deno.test("fractions use a round-capped bar without a TeX rule", () => {
  for (
    const latex of [
      String.raw`\frac{a}{b}`,
      String.raw`\frac{x_1}{2}^2`,
      String.raw`\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
      String.raw`\left\lceil\frac{a}{b}\right\rceil`,
    ]
  ) {
    const result = renderMathLatex(latex);
    assert(result.markup.includes("<path"), latex);
    assert(result.markup.includes('data-mml-node="mfrac"'), latex);
    assert(!result.markup.includes("<rect"), latex);
    assert(!/<(?:text|use|foreignObject|image)\b/.test(result.markup), latex);
  }
  const binom = renderMathLatex(String.raw`\binom{n}{k}`);
  assert(!binom.markup.includes("<rect"));
});

Deno.test("radicals join the surd to a stem-matched overline without a TeX rule", () => {
  for (
    const latex of [
      String.raw`\sqrt{x}`,
      String.raw`\sqrt{1 - x^2}`,
      String.raw`\sqrt[3]{8}`,
    ]
  ) {
    const result = renderMathLatex(latex);
    assert(result.markup.includes("<path"), latex);
    assert(!result.markup.includes("<rect"), latex);
    assert(!/<(?:text|use|foreignObject|image)\b/.test(result.markup), latex);
  }
});

Deno.test("cube-root index sits in the upper notch, not at TeX's 0.55 height", () => {
  const result = renderMathLatex(String.raw`\sqrt[3]{x+1}`);
  const index = result.markup.match(
    /data-mml-node="mn" transform="translate\(([-\d.]+),([-\d.]+)\) scale\(([\d.]+)\)"/,
  );
  const surd = result.markup.match(
    /data-mml-node="mo" transform="translate\([^"]*\) scale\(([\d.]+)\)"/,
  );
  assert(index && surd, result.markup);
  const y = Number(index[2]);
  const script = Number(index[3]);
  const surdScale = Number(surd[1]);
  assertEquals(script, 0.5);
  // TeX 0.55 of this √ would land near 490. The handwritten notch is higher.
  assert(y > 0.7 * 695 * surdScale, `index y=${y} surdScale=${surdScale}`);
});

Deno.test("align* splits rows on \\\\ and columns on &", () => {
  const result = renderMathLatex(String.raw`\begin{align*}
x^2 + y^2 &= 1 \\
y &= \sqrt{1 - x^2}
\end{align*}`);
  assertEquals([...result.markup.matchAll(/data-mml-node="mtr"/g)].length, 2);
  assertEquals([...result.markup.matchAll(/data-mml-node="mtd"/g)].length, 4);
});

Deno.test("LaTeX supports common math using the actual font and accepts paste wrappers", () => {
  const expressions = [
    String.raw`\frac{x_1}{2}^2`,
    String.raw`\sqrt[3]{x}`,
    String.raw`\alpha+\beta=\gamma`,
    String.raw`\Gamma\Delta\Theta\Lambda\Xi\Pi\Sigma\Upsilon\Phi\Psi\Omega`,
    String.raw`\int_0^1 x^2\,dx = \frac13`,
    String.raw`\sum_{k=1}^{n} k`,
    String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`,
    String.raw`\begin{cases}x&x\ge0\\-x&x<0\end{cases}`,
    String.raw`\begin{aligned}x+1&=2\\x&=1\end{aligned}`,
    String
      .raw`\forall x\in\mathbb{R},\quad x\in A\cap B\iff x\in A\land x\in B`,
    String.raw`\left\lceil\frac{a}{b}\right\rceil`,
    String.raw`\sin^2\theta + \cos^2\theta = 1`,
    String.raw`P(A \mid B) = \frac{P(A \cap B)}{P(B)}`,
    String.raw`\text{Δ and ÅÄÖ}`,
  ];
  for (const latex of expressions) {
    const result = renderMathLatex(latex);
    assert(result.markup.includes("<path"), latex);
    assert(
      !result.markup.includes('d="MM'),
      "MathJax must receive valid SVG path data",
    );
    assert(!/<(?:text|use|foreignObject|image)\b/.test(result.markup), latex);
    assert(
      result.bounds && Object.values(result.bounds).every(Number.isFinite),
    );
  }
  for (
    const source of [
      "$x^2$",
      "$$x^2$$",
      String.raw`\(x^2\)`,
      String.raw`\[x^2\]`,
    ]
  ) {
    assertEquals(normalizeMathLatex(source), "x^2");
    assertEquals(renderMathLatex(source), renderMathLatex("x^2"));
  }
  assertEquals(
    renderMathLatex("x^12").bounds,
    renderMathLatex("x^{1}2").bounds,
  );
});

Deno.test("malformed or unsupported LaTeX fails and does not poison the next render", () => {
  const valid = renderMathLatex("x+1");
  for (
    const input of [
      "",
      " ",
      "{}",
      "x^2^3",
      "x_1_2",
      "{x",
      "x}",
      String.raw`\frac{x}`,
      String.raw`\left(x`,
      String.raw`\unknowncommand`,
      String.raw`\begin{matrix}`,
      String.raw`\href{https://example.com}{x}`,
      String.raw`\require{html}`,
      String.raw`\includegraphics{file}`,
      String.raw`\newcommand{\foo}{x}\foo`,
      String.raw`\mathcal{F}`,
      String.raw`\mathbb{A}`,
      String.raw`\text{😀}`,
      "x".repeat(2001),
      "{".repeat(33) + "x" + "}".repeat(33),
    ]
  ) {
    assertThrows(() => renderMathLatex(input), Error, undefined, input);
    assertEquals(renderMathLatex("x+1"), valid);
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

Deno.test("MathJax format characters and punctuation aliases use existing outlines", () => {
  for (
    const latex of [
      String.raw`\sin\theta`,
      String.raw`\cos\theta`,
      String.raw`\sin(\theta)`,
      String.raw`\log x`,
      String.raw`P(A \mid B)`,
      String.raw`a \perp b`,
    ]
  ) {
    const result = renderMathLatex(latex);
    assert(result.markup.includes("<path"), latex);
    assert(!/<(?:text|use|foreignObject|image)\b/.test(result.markup), latex);
  }
  const board = renderWhiteboardSvg({
    layout: "single",
    children: [{
      type: "math_expressions",
      id: "board",
      title: "Conditional probability",
      expressions: [
        {
          id: "p-a-given-b",
          latex: String.raw`P(A \mid B) = \frac{P(A \cap B)}{P(B)}`,
        },
        {
          id: "cos-theta-expr",
          latex: String.raw`\cos\theta`,
        },
      ],
    }],
  });
  assert(board.svg.includes("<path"));
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
  assertThrows(() => render(String.raw`\text{😀}`), Error, "has no glyph");
  const result = render(String.raw`\text{<script>\&}`);
  assert(result.svg.includes("&lt;script&gt;"));
  assert(result.svg.includes("&amp;"));
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
      {
        type: "math_expressions",
        id: "circle",
        title: "Unit circle",
        expressions: [{
          id: "solve",
          latex: String.raw`\begin{align*}
x^2 + y^2 &= 1 \\
y &= \sqrt{1 - x^2}
\end{align*}`,
        }],
      },
      {
        type: "math_expressions",
        id: "roots",
        title: "Radical join",
        expressions: [
          { id: "short", latex: String.raw`\sqrt{x}` },
          { id: "plain", latex: String.raw`\sqrt{1 - x^2}` },
          { id: "nested", latex: String.raw`\sqrt{b^2 - 4ac}` },
          { id: "cube", latex: String.raw`\sqrt[3]{8} = 2` },
          { id: "frac", latex: String.raw`\sqrt{\frac{a}{b}}` },
        ],
      },
    ],
  });
  await Deno.writeTextFile(
    new URL("./output-ex/math-expressions.svg", import.meta.url),
    gallery.svg,
  );
  const preview = renderWhiteboardSvg({
    layout: "single",
    children: [{
      type: "math_expressions",
      id: "roots",
      title: "Radical join",
      expressions: [
        { id: "short", latex: String.raw`\sqrt{x}` },
        { id: "plain", latex: String.raw`\sqrt{1 - x^2}` },
        { id: "nested", latex: String.raw`\sqrt{b^2 - 4ac}` },
        { id: "cube", latex: String.raw`\sqrt[3]{8} = 2` },
        { id: "frac", latex: String.raw`\sqrt{\frac{a}{b}}` },
      ],
    }],
  });
  await Deno.writeTextFile(
    new URL("./output-ex/radical-join.svg", import.meta.url),
    preview.svg,
  );
  console.log("Wrote output-ex/math-expressions.svg and radical-join.svg");
}

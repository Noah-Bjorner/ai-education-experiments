import { z } from "@zod";
import {
  elementIdField,
  figureEnvelope,
  titleTargetParts,
  type WhiteboardFigureDefinition,
} from "./shared.ts";

export const mathExpressionsSchema = figureEnvelope("math_expressions")
  .safeExtend({
    expressions: z.array(
      z.object({
        id: elementIdField,
        latex: z.string().trim().min(1).max(2000).describe(
          "One LaTeX math expression (MathJax base and AMS commands). Prefer no dollar signs or display delimiters. Escape backslashes in JSON.",
        ),
      }).strict(),
    ).min(1).max(8),
  });

export type MathExpressions = z.infer<typeof mathExpressionsSchema>;

export const mathExpressions = {
  type: "math_expressions",
  schema: mathExpressionsSchema,
  summary:
    "Mathematical expressions, formulas, or equations displayed in rows.",
  useWhen:
    "the learner needs to read mathematical notation or follow a calculation or algebra sequence, such as substituting values into a formula, simplifying an expression, or solving an equation",
  need: {
    question: "Does `goal` need formulas or equations written out?",
    criteria: {
      true:
        "A formula or equation should be written out, such as 2(x + 3) = 10 or \\frac{x}{2} + 3 = 7.",
      false:
        "A formula only names a curve to plot, or there is no formula to write out.",
    },
  },
  rules: String
    .raw`- Each expression is a separate centered row, in supplied order.
- Supports MathJax base and AMS math: Greek letters, operators and relations, fractions, roots, scripts, sums/products/integrals with limits, \sin and other functions, \text{...}, \mathbb{R}, \left...\right delimiters, matrices, cases, and aligned equations.
- Use braces around multi-character script arguments. Prefer math source without dollar signs or display wrappers (one surrounding pair is accepted).
- The board uses Shantell Sans Math Medium everywhere. Equations use paths extracted from that same font; structural bars are drawn by the layout engine. Ordinary bold/italic styles use Medium. Calligraphic/Fraktur alphabets and unbundled symbols are unavailable; do not replace them with a different mathematical meaning. Double-struck letters supported: C, N, P, Q, R, Z.
- This is math-mode LaTeX, not a full document compiler. No document preambles, package loading, user-defined macros, HTML, or external content. Unsupported commands or missing glyphs produce explicit errors.
- No styling or coordinates are supplied by the agent. Expressions retain the shared display size; keep rows short enough to fit. More rows grow the figure vertically rather than shrinking the text.
- JSON must escape each LaTeX backslash: "\\frac{1}{2}".`,
  annotationTargetParts: (figure) => [
    ...titleTargetParts(figure),
    ...figure.expressions.map((e) => ({
      part: `${e.id}.expression`,
      kind: "text" as const,
    })),
  ],
  annotationTargets: [
    "<expressionId> — the whole row. Individual terms are not targets.",
    "title — only when title is not null",
  ],
  example: {
    instructions: "Show the steps for solving x/2 + 3 = 7.",
    output: {
      type: "math_expressions",
      id: "solve",
      title: null,
      annotations: [],
      expressions: [
        { id: "start", latex: String.raw`\frac{x}{2} + 3 = 7` },
        { id: "subtract", latex: String.raw`\frac{x}{2} = 4` },
        { id: "answer", latex: "x = 8" },
      ],
    },
  },
} satisfies WhiteboardFigureDefinition<typeof mathExpressionsSchema>;

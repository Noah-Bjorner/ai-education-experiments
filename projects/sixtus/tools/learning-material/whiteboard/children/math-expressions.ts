import { z } from "@zod";
import {
  childAnnotationsField,
  childTitleField,
  elementIdField,
  type WhiteboardChildDefinition,
} from "./shared.ts";

export const mathExpressionsSchema = z.object({
  type: z.literal("math_expressions"),
  id: elementIdField.optional(),
  title: childTitleField,
  annotations: childAnnotationsField.optional(),
  expressions: z.array(z.object({
    id: elementIdField,
    latex: z.string().trim().min(1).max(2000).describe(
      "One LaTeX math expression (MathJax base and AMS commands). Prefer no dollar signs or display delimiters. Escape backslashes in JSON.",
    ),
  })).min(1).max(8),
});

export type MathExpressions = z.infer<typeof mathExpressionsSchema>;

export const mathExpressions = {
  type: "math_expressions",
  schema: mathExpressionsSchema,
  instructions: String.raw`### When to use it

Use for equations, formulas, or a short sequence of algebra steps. Each expression is a separate centered row, in supplied order.

### Fields and supported LaTeX

- type: always "math_expressions".
- title, id, annotations: follow the shared rules.
- expressions: 1-8 objects with a unique stable id and a latex string (at most 2000 characters).
- Supports MathJax base and AMS math: Greek letters, operators and relations, fractions, roots, scripts, sums/products/integrals with limits, \sin and other functions, \text{...}, \mathbb{R}, \left...\right delimiters, matrices, cases, and aligned equations.
- Use braces around multi-character script arguments. Prefer math source without dollar signs or display wrappers (one surrounding pair is accepted).
- The board uses Shantell Sans Math Medium everywhere. Equations use paths extracted from that same font; structural bars are drawn by the layout engine. Ordinary bold/italic styles use Medium. Calligraphic/Fraktur alphabets and unbundled symbols are unavailable; do not replace them with a different mathematical meaning. Double-struck letters supported: C, N, P, Q, R, Z.
- This is math-mode LaTeX, not a full document compiler. No document preambles, package loading, user-defined macros, HTML, or external content. Unsupported commands or missing glyphs produce explicit errors.
- No styling or coordinates are supplied by the agent.
- JSON must escape each LaTeX backslash: "\\frac{1}{2}".
- Annotation targets: <childId>.title and <childId>.<expressionId>.expression. The latter covers the whole row and supports text emphasis and callouts. Individual terms are not targets yet.`,
  example: {
    goal: "Show the steps for solving x/2 + 3 = 7.",
    output: {
      type: "math_expressions",
      id: "solve",
      title: "Solve for x",
      annotations: [],
      expressions: [
        { id: "start", latex: String.raw`\frac{x}{2} + 3 = 7` },
        { id: "subtract", latex: String.raw`\frac{x}{2} = 4` },
        { id: "answer", latex: "x = 8" },
      ],
    },
  },
} satisfies WhiteboardChildDefinition<typeof mathExpressionsSchema>;

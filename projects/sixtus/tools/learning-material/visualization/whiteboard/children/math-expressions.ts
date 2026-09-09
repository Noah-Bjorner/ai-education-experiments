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
      "One expression in the supported LaTeX subset, without dollar signs or display delimiters. Escape backslashes in JSON.",
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
- expressions: 1–8 objects with a unique stable id and a latex string (at most 2000 characters).
- Supported: Latin letters, numbers, ordinary parentheses/brackets, + - = < > / |, decimal punctuation, groups {...}, superscripts ^ and subscripts _, \frac{...}{...}, \sqrt{...}, \sqrt[n]{...}.
- Commands: \times, \cdot, \div, \pm, \le, \leq, \ge, \geq, \ne, \neq; \sin, \cos, \tan, \log, \ln; \text{...}; spaces \, \: \; \quad \qquad and escaped space.
- Stretch delimiters with matching \left( ... \right), \left[ ... \right], or \left| ... \right|. Use braces around multi-character script arguments.
- No dollar signs, display wrappers, environments, matrices, macros, Greek commands, or other commands in this first version. Do not replace an unsupported symbol with a different mathematical meaning.
- The renderer uses the board font for text and draws operators, fraction bars, and roots as pen strokes. No styling or coordinates are supplied by the agent.
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

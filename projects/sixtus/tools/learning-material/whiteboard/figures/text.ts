import { z } from "@zod";
import {
  elementIdField,
  figureAnnotationsField,
  figureTitleField,
  type WhiteboardFigureDefinition,
} from "./shared.ts";

export const textFigureSchema = z.strictObject({
  type: z.literal("text"),
  id: elementIdField,
  title: figureTitleField,
  annotations: figureAnnotationsField,
  role: z.enum(["note", "question", "takeaway"]).describe(
    "question introduces the visualization that answers it; note adds supporting context after a visualization; takeaway states the conclusion after a visualization.",
  ),
  text: z.string().min(1).refine((value) => value.trim().length > 0, {
    message: "Text figures require nonempty text.",
  }).describe(
    "Complete plain text. Newlines are supported; text wraps without truncation.",
  ),
});

export type TextFigure = z.infer<typeof textFigureSchema>;

export const textFigure = {
  type: textFigureSchema.shape.type.value,
  schema: textFigureSchema,
  instructions: `### When to use it

Use for a standalone question, supporting note, or takeaway accompanying a visualization. Use annotations for messages pointing at a specific visual target; use freeform text for labels inside a diagram and math_expressions for typeset equations.

### Fields

- \`type\`: always "text".
- \`id\`, \`title\`, and \`annotations\`: follow the shared rules. Prefer a null title when the text speaks for itself.
- \`role\`: "note", "question", or "takeaway".
- \`text\`: nonempty plain text, with optional newlines. Preserve the complete message.
- \`anchor\` and \`side\`: follow the shared placement rules and the reading order below.

### Rules

- A question must come before and above the visualization that answers it. In a mixed board, put the question immediately before its answer in the figures array, and anchor the answer to the question with side "bottom". Several consecutive questions may form a bottom-anchored chain ending in their answering visualization.
- Put notes and takeaways after and below the visualization they describe. Anchor them to that visualization with side "bottom", or chain them below another note or takeaway belonging to it.
- A later question starts a new question/answer group below an earlier figure; it must use side "bottom". Never place a question after its answer or a note/takeaway above its visualization.
- Text-only boards are supported; after the root, chain text figures with side "bottom".
- Annotation targets: \`<id>.text\` for the complete text block and \`<id>.title\` only when title is not null. There are no per-word or border targets.
- Do not emit font sizes, widths, colors, border styles, pixels, or additional layout fields. The renderer styles each role and wraps text.`,
  example: {
    goal: "State the conclusion after comparing 4 apples and 6 oranges.",
    output: {
      type: "text",
      id: "fruit-takeaway",
      title: null,
      annotations: [],
      role: "takeaway",
      text: "There are 2 more oranges than apples.",
    },
  },
} satisfies WhiteboardFigureDefinition<typeof textFigureSchema>;

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
    "question gives the learner a specific comparison, prediction, or reasoning task; note supplies necessary context or an assumption the visualization cannot convey; takeaway states a needed inference or general principle that may not be clear from the visualization alone.",
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
  summary:
    "Standalone text for a focused question, necessary context, or an inference that needs to be explicit.",
  useWhen: `standalone text performs a necessary job for the requested purpose and teaching depth that the visualization, its labels, or a brief annotation cannot do clearly.
  - Question: give the learner a specific comparison, prediction, or reasoning task that guides their reading and serves the learning goal. Do not turn a topic heading into a question merely to introduce a figure.
  - Note: supply necessary context or an assumption the visualization cannot convey. When that context is needed to answer a particular question, include the question itself so it is clear why the note is there.
  - Takeaway: state an inference or general principle the learner needs but may not reliably extract from the visualization. Add one only when making that inference explicit is necessary for the requested teaching depth. Omit it when it merely repeats a visible result, label, or completed calculation.
  Do not routinely wrap a visualization in an opening question and closing takeaway. Specify the role and exact message for each text figure`,
  rules: `- Preserve the complete message, including newlines.
- Default to a null title. Do not add a heading that repeats the message or merely names its role, such as "Question" or "Takeaway".
- Express the requested message directly; do not add an introduction, recap, or additional explanation beyond the instructions.
- Do not emit font sizes, widths, colors, border styles, pixels, or additional layout fields. The renderer styles each role and wraps text.`,
  annotationTargets: [
    "<id>.text — the complete text block; no per-word or border targets",
    "<id>.title — only when title is not null",
  ],
  example: {
    instructions:
      "For a lesson on interpreting observational data, use the takeaway role to make the limit of an association explicit. An illustrative scatter plot shows that students who study longer tend to have higher scores, but the observations do not establish causation. State exactly: 'Students who study longer tend to score higher, but these observations alone do not show that extra study time caused the higher scores.' Use no title or annotations.",
    output: {
      type: "text",
      id: "association-takeaway",
      title: null,
      annotations: [],
      role: "takeaway",
      text: "Students who study longer tend to score higher, but these observations alone do not show that extra study time caused the higher scores.",
    },
  },
} satisfies WhiteboardFigureDefinition<typeof textFigureSchema>;

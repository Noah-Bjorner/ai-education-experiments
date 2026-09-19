import { z } from "@zod";
import {
  elementIdField,
  figureAnnotationsField,
  figureEnvelope,
  titleTargetParts,
  type WhiteboardFigureDefinition,
} from "./shared.ts";

export const textFigureSchema = figureEnvelope("text").safeExtend({
  id: elementIdField,
  annotations: figureAnnotationsField,
  role: z.enum(["note", "question", "takeaway"]).describe(
    "question gives the learner a specific comparison, prediction, or reasoning task; note supplies necessary context or an assumption the visualization cannot convey; takeaway states a needed inference or general principle in a few words, not a full sentence.",
  ),
  text: z.string().min(1).refine((value) => value.trim().length > 0, {
    message: "Text figures require nonempty text.",
  }).describe(
    "Complete plain text. Newlines are supported; text wraps without truncation. For takeaway: a few words, like a heading, unless the goal already states the wording.",
  ),
}).strict();

export type TextFigure = z.infer<typeof textFigureSchema>;

export const textFigure = {
  type: "text" as const,
  schema: textFigureSchema,
  summary:
    "Standalone text for a focused question, necessary context, or an inference that needs to be explicit.",
  useWhen:
    `standalone text performs a necessary job for the requested purpose and teaching depth that the visualization, its labels, or a brief annotation cannot do clearly.
  - Question: give the learner a specific comparison, prediction, or reasoning task that guides their reading and serves the learning goal. Do not turn a topic heading into a question merely to introduce a figure.
  - Note: supply necessary context or an assumption the visualization cannot convey. When that context is needed to answer a particular question, include the question itself so it is clear why the note is there.
  - Takeaway: state an inference or general principle the learner needs but may not reliably extract from the visualization, in a few words rather than a full sentence. If the goal already names the takeaway, use those words. Add one only when making that inference explicit is necessary for the requested teaching depth. Omit it when it merely repeats a visible result, label, or completed calculation.
  Do not routinely wrap a visualization in an opening question and closing takeaway. Specify the role and exact message for each text figure`,
  need: {
    question: "Does `goal` need a written question, note, or takeaway?",
    criteria: {
      true:
        "The goal is teaching an idea, or it asks to write a question, note, or conclusion.",
      false: "The goal is only to visualize.",
    },
  },
  boardRules:
    `- A text figure's position is its meaning. A question comes immediately before the visualization it frames, or before the next question in the same group. Nothing else sits between a question and its visualization.
- A note or takeaway comes immediately after the visualization it refers to, or after another note or takeaway on that same visualization. It never follows a question directly.
- Do not routinely wrap a visualization in an opening question and a closing takeaway. Each text figure must do a job the visualization, its labels, or an annotation cannot.
- A board with only text figures is ordered for reading.`,
  rules: `- Preserve the complete message, including newlines.
- Default to a null title. Do not add a heading that repeats the message or merely names its role, such as "Question" or "Takeaway".
- Express the requested message directly; do not add an introduction, recap, or additional explanation beyond the instructions.
- Takeaway text is a few words, like a heading, not a sentence or paragraph (e.g. "association ≠ causation"). If the goal already states what the takeaway should say, use those words rather than rephrasing them.
- Do not emit font sizes, widths, colors, border styles, pixels, or additional layout fields. The renderer styles each role and wraps text.`,
  annotationTargetParts: (figure) => [
    ...titleTargetParts(figure),
    { part: "text", kind: "text" },
  ],
  annotationTargets: [
    "text — the complete text block; no per-word or border targets",
    "title — only when title is not null",
  ],
  example: {
    instructions:
      "For a lesson on interpreting observational data, use the takeaway role to make the limit of an association explicit. An illustrative scatter plot shows that students who study longer tend to have higher scores, but the observations do not establish causation. The takeaway is: association ≠ causation. Use no title or annotations.",
    output: {
      type: "text",
      id: "association-takeaway",
      title: null,
      annotations: [],
      role: "takeaway",
      text: "association ≠ causation",
    },
  },
} satisfies WhiteboardFigureDefinition<typeof textFigureSchema>;

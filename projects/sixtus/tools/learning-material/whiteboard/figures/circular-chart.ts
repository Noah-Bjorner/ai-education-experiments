import { z } from "@zod";
import {
  elementIdField,
  figureEnvelope,
  titleTargetParts,
  type WhiteboardFigureDefinition,
} from "./shared.ts";

const circularChartSchema = figureEnvelope("pie_chart").safeExtend({
  chartStyle: z.enum(["pie", "donut"]).optional(),
  slices: z.array(
    z.object({
      id: elementIdField,
      label: z.string().min(1),
      value: z.number().finite().positive(),
    }).strict(),
  ).min(1),
});

export const circularChart = {
  type: "pie_chart" as const,
  schema: circularChartSchema,
  summary:
    "A pie or donut chart showing how categories divide a single whole into parts.",
  useWhen:
    "the learner needs to understand proportions, such as each genre's share of a book collection. The categories should be distinct parts that together make up the whole",
  need: {
    question: "Does `goal` need a pie or donut chart?",
    criteria: {
      true:
        "The amounts are parts of one whole, such as a budget split by category.",
      false: "The amounts are not parts of one whole.",
    },
  },
  rules: `- All slices must refer to the same whole and use the same unit.
- Categories must not overlap.
- Use the supplied amounts directly; counts do not need conversion to percentages.
- If values describe a complete percentage breakdown, they should total approximately 100, allowing for rounding.
- Omit zero-value categories because slice values must be positive.
- Do not silently invent an "Other" slice to complete missing data.
- Only target an interior percentage when the slice is at least 8% of the total; smaller slices have no interior percentage.`,
  annotationTargetParts: (figure) => [
    ...titleTargetParts(figure),
    ...figure.slices.flatMap((s) => [
      { part: `${s.id}.mark`, kind: "mark" as const },
      { part: `${s.id}.legend-label`, kind: "text" as const },
      ...(s.value /
            figure.slices.reduce((sum, slice) => sum + slice.value, 0) >= 0.08
        ? [{ part: `${s.id}.percentage`, kind: "text" as const }]
        : []),
    ]),
  ],
  annotationTargets: [
    "<figureId>.title — only when title is not null",
    "<figureId>.<sliceId>.mark — the wedge",
    "<figureId>.<sliceId>.legend-label",
    "<figureId>.<sliceId>.percentage — only when the slice is at least 8% of the total",
  ],
  example: {
    instructions:
      "Help a learner understand how each genre contributes to a whole collection of 20 books: 12 fiction, 6 nonfiction, and 2 poetry. Circle Fiction's percentage and use an arrow callout to explain that Fiction is more than half the collection.",
    output: {
      "type": "pie_chart",
      "id": "books",
      "title": "Book collection",
      "annotations": [
        {
          "type": "circle",
          "targetIds": ["books.fiction.percentage"],
          "content": null,
        },
        {
          "type": "arrow",
          "targetIds": ["books.fiction.mark"],
          "content": "More than half the collection",
        },
      ],
      "slices": [
        {
          "id": "fiction",
          "label": "Fiction",
          "value": 12,
        },
        {
          "id": "nonfiction",
          "label": "Nonfiction",
          "value": 6,
        },
        {
          "id": "poetry",
          "label": "Poetry",
          "value": 2,
        },
      ],
    },
  },
} satisfies WhiteboardFigureDefinition<typeof circularChartSchema>;

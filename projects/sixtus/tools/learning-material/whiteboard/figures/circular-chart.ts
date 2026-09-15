import { z } from "@zod";
import {
  figureAnnotationsField,
  figureTitleField,
  elementIdField,
  type WhiteboardFigureDefinition,
} from "./shared.ts";

const circularChartSchema = z.object({
  type: z.literal("pie_chart"),
  id: elementIdField.optional(),
  title: figureTitleField,
  annotations: figureAnnotationsField.optional(),
  chartStyle: z.enum(["pie", "donut"]).optional(),
  slices: z.array(z.object({
    id: elementIdField.optional(),
    label: z.string().min(1),
    value: z.number().positive(),
  })).min(1),
});

export const circularChart = {
  type: circularChartSchema.shape.type.value,
  schema: circularChartSchema,
  summary:
    "A pie or donut chart showing how categories divide a single whole into parts.",
  useWhen:
    "the learner needs to understand proportions, such as each genre's share of a book collection. The categories should be distinct parts that together make up the whole",
  rules: `- All slices must refer to the same whole and use the same unit.
- Categories must not overlap.
- Use the supplied amounts directly; counts do not need conversion to percentages.
- If values describe a complete percentage breakdown, they should total approximately 100, allowing for rounding.
- Omit zero-value categories because slice values must be positive.
- Do not silently invent an "Other" slice to complete missing data.
- Only target an interior percentage when the slice is at least 8% of the total; smaller slices have no interior percentage.`,
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

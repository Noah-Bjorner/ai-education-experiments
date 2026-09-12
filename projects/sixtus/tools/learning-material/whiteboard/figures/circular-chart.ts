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
  instructions: `### When to use it

composition / parts of a whole
Use to show how distinct parts contribute to one whole.
Use an XY bar chart instead when the values are independent comparisons.

### Fields

- \`type\`: always "pie_chart".
- \`title\`: the chart's title.
- \`id\` and \`annotations\`: follow the shared annotation rules.
- \`chartStyle\`: "pie" (default) or "donut".
- \`slices\`: an array of slices.

Each slice contains:
- \`id\`: a stable ID, unique among slices in this figure.
- \`label\`: the name of the part.
- \`value\`: a positive number representing its amount.

### Rules


- All slices must refer to the same whole and use the same unit.
- Categories must not overlap.
- Use the supplied amounts directly; counts do not need conversion to percentages.
- If values describe a complete percentage breakdown, they should total approximately 100, allowing for rounding.
- Omit zero-value categories because slice values must be positive.
- Do not silently invent an "Other" slice to complete missing data.
- Annotation targets: \`<figureId>.title\` (only when title is not null), \`<figureId>.<sliceId>.mark\` (the wedge), \`<figureId>.<sliceId>.legend-label\`, and \`<figureId>.<sliceId>.percentage\`. Only target an interior percentage when the slice is at least 8% of the total; smaller slices have no interior percentage.`,
  example: {
    goal:
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

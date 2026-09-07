import { z } from "@zod";
import { childTitleField, type WhiteboardChildDefinition } from "./shared.ts";

const pieChartSchema = z.object({
  type: z.literal("pie_chart"),
  title: childTitleField,
  slices: z.array(z.object({
    label: z.string().min(1),
    value: z.number().positive(),
  })).min(2),
});

export const pieChart = {
  type: pieChartSchema.shape.type.value,
  schema: pieChartSchema,
  instructions: `### When to use it

composition / parts of a whole
Use to show how distinct parts contribute to one whole.
Use an XY bar chart instead when the values are independent comparisons.

### Fields

- \`type\`: always "pie_chart".
- \`title\`: the chart's title.
- \`slices\`: an array of slices.

Each slice contains:
- \`label\`: the name of the part.
- \`value\`: a positive number representing its amount.

### Rules

- All slices must refer to the same whole and use the same unit.
- Categories must not overlap.
- Use the supplied amounts directly; counts do not need conversion to percentages.
- If values describe a complete percentage breakdown, they should total approximately 100, allowing for rounding.
- Omit zero-value categories because slice values must be positive.
- Do not silently invent an "Other" slice to complete missing data.`,
  example: {
    instruction:
      "Show a collection containing 12 fiction books, 6 nonfiction books, and 2 poetry books.",
    output: {
      "type": "pie_chart",
      "title": "Book collection",
      "slices": [
        {
          "label": "Fiction",
          "value": 12,
        },
        {
          "label": "Nonfiction",
          "value": 6,
        },
        {
          "label": "Poetry",
          "value": 2,
        },
      ],
    },
  },
} satisfies WhiteboardChildDefinition<typeof pieChartSchema>;

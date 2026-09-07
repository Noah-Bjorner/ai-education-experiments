import { z } from "@zod";
import { childTitleField, type WhiteboardChildDefinition } from "./shared.ts";

const xyChartSchema = z.object({
  type: z.literal("xy_chart"),
  title: childTitleField,
  chartStyle: z.enum(["line", "bar", "scatter", "area"]),
  xLabel: z.string().min(1),
  yLabel: z.string().min(1),
  series: z.array(z.object({
    name: z.string().min(1),
    points: z.array(z.object({
      x: z.union([z.number(), z.string().min(1)]),
      y: z.number(),
    })).min(1),
  })).min(1),
});

export const xyChart = {
  type: xyChartSchema.shape.type.value,
  schema: xyChartSchema,
  instructions: `### When to use it

trends, comparisons, functions, or distributions on X/Y (line, bar, or scatter)
Use for values plotted against categories or a numeric X axis.
Choose \`chartStyle\` according to the relationship:
- \`line\`: change over an ordered numeric axis, such as time or an input variable.
- \`bar\`: comparisons between categories.
- \`scatter\`: relationships between paired numeric observations.

### Fields

- \`type\`: always "xy_chart".
- \`title\`: the chart's title.
- \`chartStyle\`: "line", "bar", or "scatter".
- \`xLabel\`: the horizontal axis label, including units when they help a learner read the values.
- \`yLabel\`: the vertical axis label, including units when they help a learner read the values.
- \`series\`: an array of series.

Each series contains:
- \`name\`: a short label identifying the series.
- \`points\`: an array of objects containing \`x\` and \`y\`.

Each point contains:
- \`x\`: a number for a numeric axis, or a string for a category.
- \`y\`: a number.

### Rules

- Use numeric X values for line and scatter charts.
- For category comparisons, use bar charts with category names as X values.
- Within a chart, use a consistent kind of X value.
- Order line-chart points by ascending X value.
- Give each series a distinct, meaningful name.
- All series share the chart's axis labels and units.
- Use multiple series in one XY chart when they share axes and comparing them together is clearer than using separate children.`,
  example: {
    instruction: "Plot y = 2x for x = 0, 1, 2, and 3.",
    output: {
      "type": "xy_chart",
      "title": "y = 2x",
      "chartStyle": "line",
      "xLabel": "x",
      "yLabel": "y",
      "series": [
        {
          "name": "y = 2x",
          "points": [
            {
              "x": 0,
              "y": 0,
            },
            {
              "x": 1,
              "y": 2,
            },
            {
              "x": 2,
              "y": 4,
            },
            {
              "x": 3,
              "y": 6,
            },
          ],
        },
      ],
    },
  },
} satisfies WhiteboardChildDefinition<typeof xyChartSchema>;

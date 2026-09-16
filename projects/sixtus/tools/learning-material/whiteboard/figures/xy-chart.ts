import { z } from "@zod";
import {
  figureAnnotationsField,
  figureTitleField,
  elementIdField,
  type WhiteboardFigureDefinition,
} from "./shared.ts";

const xyChartSchema = z.object({
  type: z.literal("xy_chart"),
  id: elementIdField.optional(),
  title: figureTitleField,
  annotations: figureAnnotationsField.optional(),
  chartStyle: z.enum(["line", "bar", "scatter", "area"]),
  xLabel: z.string().min(1),
  yLabel: z.string().min(1),
  series: z.array(z.object({
    id: elementIdField.optional(),
    name: z.string().min(1),
    points: z.array(z.object({
      id: elementIdField.optional(),
      x: z.union([z.number(), z.string().min(1)]),
      y: z.number(),
    })).min(1),
  })).min(1),
});

export const xyChart = {
  type: xyChartSchema.shape.type.value,
  schema: xyChartSchema,
  summary:
    "A bar, line, area, or scatter chart built from explicit data points, with one or more series.",
  useWhen:
    "the learner needs to compare categories (bar), follow trends over time or another numeric variable (line or area), or see relationships between measurements (scatter). Use coordinate_plot for functions defined by formulas",
  need: {
    question:
      "Does this goal need a bar, line, area, or scatter chart drawn from data values?",
    criteria: {
      true:
        "The goal compares independent amounts across categories, shows how a quantity changes over time or another variable, or relates two measured quantities. The data values are given or can reasonably be supplied.",
      false:
        "There is no data series to plot, or the values are shares or percentages of one whole. A curve defined by a formula or shapes placed on axes do not count either.",
    },
  },
  rules: `Choose \`chartStyle\` according to the relationship:
- \`line\`: change over an ordered numeric axis, such as time or an input variable.
- \`bar\`: comparisons between categories.
- \`area\`: magnitude over an ordered numeric axis, filled to zero (multiple series overlap, not stack).
- \`scatter\`: relationships between paired numeric observations.

- Use numeric X values for line, area, and scatter charts.
- For category comparisons, use bar charts with category names as X values.
- Within a chart, use a consistent kind of X value.
- Order line- and area-chart points by ascending X value.
- Give each series a distinct, meaningful name.
- All series share the chart's axis labels and units.
- Use multiple series in one XY chart when they share axes and comparing them together is clearer than using separate figures.
- Point marks mean the plotted point or bar; do not invent separate point-label targets.`,
  annotationTargets: [
    "<figureId>.title — only when title is not null",
    "<figureId>.x-label",
    "<figureId>.y-label",
    "<figureId>.<seriesId>.legend-label",
    "<figureId>.<pointId>.mark — the plotted point or bar",
  ],
  example: {
    instructions:
      "Help a learner understand that y = 2x increases by 2 for every increase of 1 in x, using x = 0, 1, 2, and 3.",
    output: {
      "type": "xy_chart",
      "id": "doubling",
      "title": "y = 2x",
      "annotations": [],
      "chartStyle": "line",
      "xLabel": "x",
      "yLabel": "y",
      "series": [
        {
          "id": "linear",
          "name": "y = 2x",
          "points": [
            {
              "id": "origin",
              "x": 0,
              "y": 0,
            },
            {
              "id": "one",
              "x": 1,
              "y": 2,
            },
            {
              "id": "two",
              "x": 2,
              "y": 4,
            },
            {
              "id": "three",
              "x": 3,
              "y": 6,
            },
          ],
        },
      ],
    },
  },
} satisfies WhiteboardFigureDefinition<typeof xyChartSchema>;

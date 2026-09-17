import { z } from "@zod";
import {
  elementIdField,
  figureEnvelope,
  titleTargetParts,
  type WhiteboardFigureDefinition,
} from "./shared.ts";

const xyChartSchema = figureEnvelope("xy_chart").safeExtend({
  chartStyle: z.enum(["line", "bar", "scatter", "area"]),
  xLabel: z.string().min(1),
  yLabel: z.string().min(1),
  series: z.array(
    z.object({
      id: elementIdField,
      name: z.string().min(1),
      points: z.array(
        z.object({
          id: elementIdField,
          x: z.union([z.number().finite(), z.string().min(1)]),
          y: z.number().finite(),
        }).strict(),
      ).min(1),
    }).strict(),
  ).min(1),
}).superRefine((figure, ctx) => {
  const xType = typeof figure.series[0].points[0].x;
  for (const [s, series] of figure.series.entries()) {
    const categories = new Set<string | number>();
    for (const [p, point] of series.points.entries()) {
      if (
        typeof point.x !== xType ||
        (figure.chartStyle !== "bar" && typeof point.x !== "number") ||
        (typeof point.x === "string" && !point.x.trim())
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["series", s, "points", p, "x"],
          message:
            "X values must have a consistent type; only bar charts accept nonempty categories.",
        });
      }
      if (figure.chartStyle === "bar" && categories.has(point.x)) {
        ctx.addIssue({
          code: "custom",
          path: ["series", s, "points", p, "x"],
          message: "A bar series may have only one value per category.",
        });
      }
      categories.add(point.x);
    }
  }
});

export const xyChart = {
  type: "xy_chart" as const,
  schema: xyChartSchema,
  summary:
    "A bar, line, area, or scatter chart built from explicit data points, with one or more series.",
  useWhen:
    "the learner needs to compare categories (bar), follow trends over time or another numeric variable (line or area), or see relationships between measurements (scatter). Use coordinate_plot for functions defined by formulas",
  need: {
    question: "Does `goal` need a bar, line, area, or scatter chart?",
    criteria: {
      true: "The goal has data to compare or track, such as monthly rainfall.",
      false:
        "The data are parts of one whole, or there is no data to compare or track.",
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
  annotationTargetParts: (figure) => [
    ...titleTargetParts(figure),
    { part: "x-label", kind: "text" },
    { part: "y-label", kind: "text" },
    ...figure.series.flatMap((s) => [
      { part: `${s.id}.legend-label`, kind: "text" as const },
      ...s.points.map((p) => ({
        part: `${p.id}.mark`,
        kind: "mark" as const,
      })),
    ]),
  ],
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

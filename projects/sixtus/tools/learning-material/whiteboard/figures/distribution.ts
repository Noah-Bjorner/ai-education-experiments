import { z } from "@zod";
import {
  collectElementIds,
  elementIdField,
  figureEnvelope,
  titleTargetParts,
  type WhiteboardFigureDefinition,
} from "./shared.ts";

const number = z.number().finite();
const label = z.string().trim().min(1);

const binSchema = z.object({
  id: elementIdField,
  start: number.describe("Left edge of the bin, in x units."),
  end: number.describe(
    "Right edge of the bin, in x units. Must be greater than start.",
  ),
  count: number.nonnegative().describe(
    "Frequency in this bin. Zero is allowed.",
  ),
}).strict();

const stackSchema = z.object({
  id: elementIdField,
  x: number.describe("Numeric position on the number line."),
  count: z.number().int().positive().max(40).describe(
    "How many dots to stack at this x. Integer from 1 to 40.",
  ),
}).strict();

const outlierSchema = z.object({
  id: elementIdField,
  value: number,
}).strict();

const groupSchema = z.object({
  id: elementIdField,
  name: label.describe("Category label under this box."),
  min: number.describe("Lower whisker; the smallest non-outlier value."),
  q1: number,
  median: number,
  q3: number,
  max: number.describe("Upper whisker; the largest non-outlier value."),
  outliers: z.array(outlierSchema).max(32).optional().describe(
    "Values outside the whiskers. Omit or use [] when there are none.",
  ),
}).strict();

const curveSchema = z.object({
  id: elementIdField,
  name: label.describe("Legend name, such as N(0, 1)."),
  family: z.enum(["normal"]).describe(
    "Probability family. Only normal is supported.",
  ),
  mean: number.describe("μ for a normal curve."),
  sd: number.positive().describe("σ for a normal curve; must be positive."),
}).strict();

const regionSchema = z.object({
  id: elementIdField,
  curveId: elementIdField.describe(
    "ID of the curve this shaded band belongs to.",
  ),
  from: number.nullable().describe("Left bound. Null means unbounded below."),
  to: number.nullable().describe("Right bound. Null means unbounded above."),
}).strict();

const guideSchema = z.object({
  id: elementIdField,
  at: number.describe(
    "X position of the vertical guide, in the same units as the curve.",
  ),
  label: label.describe("Tick label, such as μ or −1σ."),
}).strict();

const styleFields = {
  bins: z.array(binSchema).max(32).optional().describe(
    "Histogram bars. Required for histogram; omit otherwise.",
  ),
  stacks: z.array(stackSchema).max(48).optional().describe(
    "Dot-plot stacks. Required for dot_plot; omit otherwise.",
  ),
  groups: z.array(groupSchema).max(8).optional().describe(
    "Box-plot groups. Required for box; omit otherwise.",
  ),
  curves: z.array(curveSchema).max(4).optional().describe(
    "Density curves. Required for density; omit otherwise.",
  ),
  regions: z.array(regionSchema).max(8).optional().describe(
    "Shaded bands under a density curve. Density only; omit otherwise.",
  ),
  guides: z.array(guideSchema).max(16).optional().describe(
    "Labeled vertical guides on a density curve, such as μ and ±σ. Density only; omit otherwise.",
  ),
} as const;

export const distributionSchema = figureEnvelope("distribution").safeExtend({
  chartStyle: z.enum(["histogram", "dot_plot", "box", "density"]),
  xLabel: label.describe("Horizontal axis name."),
  yLabel: label.nullable().describe(
    "Vertical axis name. Required for histogram and box; null for dot_plot and usually null for density.",
  ),
  ...styleFields,
}).strict().superRefine((figure, ctx) => {
  const issue = (
    path: (string | number)[],
    message: string,
  ) => ctx.addIssue({ code: "custom", path, message });
  const present = (key: keyof typeof styleFields) =>
    (figure[key]?.length ?? 0) > 0;

  if (figure.chartStyle === "histogram") {
    if (!present("bins")) issue(["bins"], "A histogram needs bins.");
    if (figure.yLabel === null) {
      issue(["yLabel"], "A histogram needs a y-axis label such as Frequency.");
    }
    for (
      const key of ["stacks", "groups", "curves", "regions", "guides"] as const
    ) {
      if (present(key)) {
        issue(
          [key],
          "Histogram figures use bins; omit the other style fields.",
        );
      }
    }
    const bins = [...(figure.bins ?? [])].sort((a, b) => a.start - b.start);
    for (const [i, bin] of bins.entries()) {
      if (!(bin.start < bin.end)) {
        issue(["bins", i, "end"], "Each bin needs start < end.");
      }
      if (i > 0 && bins[i - 1].end !== bin.start) {
        issue(
          ["bins", i, "start"],
          "Histogram bins must be contiguous: each start equals the previous end.",
        );
      }
    }
  } else if (figure.chartStyle === "dot_plot") {
    if (!present("stacks")) issue(["stacks"], "A dot plot needs stacks.");
    if (figure.yLabel !== null) {
      issue(["yLabel"], "A dot plot has no y-axis; set yLabel to null.");
    }
    for (
      const key of ["bins", "groups", "curves", "regions", "guides"] as const
    ) {
      if (present(key)) {
        issue([key], "Dot plots use stacks; omit the other style fields.");
      }
    }
    const xs = new Set<number>();
    for (const [i, stack] of (figure.stacks ?? []).entries()) {
      if (xs.has(stack.x)) {
        issue(["stacks", i, "x"], "Each stack needs a distinct x value.");
      }
      xs.add(stack.x);
    }
  } else if (figure.chartStyle === "box") {
    if (!present("groups")) issue(["groups"], "A box plot needs groups.");
    if (figure.yLabel === null) {
      issue(
        ["yLabel"],
        "A box plot needs a y-axis label for the measured variable.",
      );
    }
    for (
      const key of ["bins", "stacks", "curves", "regions", "guides"] as const
    ) {
      if (present(key)) {
        issue([key], "Box plots use groups; omit the other style fields.");
      }
    }
    for (const [g, group] of (figure.groups ?? []).entries()) {
      if (
        !(group.min <= group.q1 && group.q1 <= group.median &&
          group.median <= group.q3 && group.q3 <= group.max)
      ) {
        issue(
          ["groups", g, "median"],
          "Each group needs min ≤ q1 ≤ median ≤ q3 ≤ max.",
        );
      }
      for (const [o, outlier] of (group.outliers ?? []).entries()) {
        if (outlier.value >= group.min && outlier.value <= group.max) {
          issue(
            ["groups", g, "outliers", o, "value"],
            "Outliers must lie outside the whiskers.",
          );
        }
      }
    }
  } else if (figure.chartStyle === "density") {
    if (!present("curves")) issue(["curves"], "A density figure needs curves.");
    for (const key of ["bins", "stacks", "groups"] as const) {
      if (present(key)) {
        issue(
          [key],
          "Density figures use curves, regions, and guides; omit bins, stacks, and groups.",
        );
      }
    }
    const curveIds = new Set((figure.curves ?? []).map((curve) => curve.id));
    for (const [i, region] of (figure.regions ?? []).entries()) {
      if (!curveIds.has(region.curveId)) {
        issue(
          ["regions", i, "curveId"],
          "Region curveId must match a curve in this figure.",
        );
      }
      if ((region.from ?? -Infinity) >= (region.to ?? Infinity)) {
        issue(
          ["regions", i, "from"],
          "A region needs from < to; use null for an unbounded side.",
        );
      }
    }
  }

  const seen = new Set<string>();
  for (const element of collectElementIds(figure)) {
    if (seen.has(element.id)) {
      issue(
        [...element.path, "id"],
        "Element IDs must be unique within the figure.",
      );
    }
    seen.add(element.id);
  }
});

export type Distribution = z.infer<typeof distributionSchema>;

export const distribution = {
  type: "distribution" as const,
  schema: distributionSchema,
  summary:
    "A histogram, dot plot, box plot, or density curve showing how values spread, cluster, or follow a probability model.",
  useWhen:
    "the learner needs to see how values spread or cluster, such as quiz scores in bins, stacked counts on a number line, five-number summaries, or a normal curve with σ bands. Use a bar or line chart for category comparisons and trends",
  need: {
    question:
      "Does `goal` need a histogram, box plot, dot plot, or distribution curve?",
    criteria: {
      true:
        "The goal shows how values spread, cluster, or follow a probability curve, such as class scores or a normal curve with σ bands.",
      false:
        "The amounts are named categories or a trend over time, not a spread.",
    },
  },
  rules: `Choose \`chartStyle\` according to the relationship:
- \`histogram\`: frequencies in contiguous numeric bins. Supply \`bins\` with start, end, and count. Counts may be zero. Adjacent bins share edges: each start equals the previous end. \`yLabel\` names the frequency axis.
- \`dot_plot\`: stacked counts on a number line. Supply \`stacks\` with x and a positive integer count. \`yLabel\` must be null.
- \`box\`: five-number summaries, one box per group. Supply \`groups\` with min, q1, median, q3, max, optional outliers, and a name. Whiskers are min and max of the non-outlier values. \`yLabel\` names the measured variable.
- \`density\`: a probability curve, currently \`family: "normal"\` with mean (μ) and positive sd (σ). Supply \`curves\`. Optional \`guides\` are labeled vertical lines (μ, −1σ, +1σ, …). Optional \`regions\` shade an interval under a named curve; null from/to means unbounded on that side. \`yLabel\` is usually null.

- Use only the fields for the chosen style. Do not send empty leftover arrays for the others.
- Histogram bins and density windows are numeric; do not substitute category names.
- For a standard-normal teaching figure, add guides at μ and ±1σ, ±2σ, ±3σ with those labels, and shade a region when the learner should notice a probability band such as between −1σ and +1σ.
- Give each curve a distinct name. A legend appears only when there are two or more curves.
- Do not bin raw lists in the renderer: supply the bins, stacks, or five-number summaries directly.
- Do not use this type for a function to plot on a grid, or for comparing named categories that are not a spread.`,
  annotationTargetParts: (figure) => [
    ...titleTargetParts(figure),
    { part: "x-label", kind: "text" },
    ...(figure.yLabel ? [{ part: "y-label", kind: "text" as const }] : []),
    ...(figure.bins ?? []).map((bin) => ({
      part: `${bin.id}.mark`,
      kind: "mark" as const,
    })),
    ...(figure.stacks ?? []).map((stack) => ({
      part: `${stack.id}.mark`,
      kind: "mark" as const,
    })),
    ...(figure.groups ?? []).flatMap((group) => [
      { part: `${group.id}.mark`, kind: "mark" as const },
      { part: `${group.id}.label`, kind: "text" as const },
      ...(group.outliers ?? []).map((outlier) => ({
        part: `${outlier.id}.mark`,
        kind: "mark" as const,
      })),
    ]),
    ...(figure.curves ?? []).flatMap((curve) => [
      { part: `${curve.id}.mark`, kind: "mark" as const },
      ...((figure.curves?.length ?? 0) > 1
        ? [{ part: `${curve.id}.legend-label`, kind: "text" as const }]
        : []),
    ]),
    ...(figure.regions ?? []).map((region) => ({
      part: `${region.id}.mark`,
      kind: "mark" as const,
    })),
    ...(figure.guides ?? []).flatMap((guide) => [
      { part: `${guide.id}.mark`, kind: "mark" as const },
      { part: `${guide.id}.label`, kind: "text" as const },
    ]),
  ],
  annotationTargets: [
    "<binId> — a histogram bar",
    "<stackId> — a stacked column of dots",
    "<groupId> — a box and its whiskers",
    "<groupId>.label — the group name under the box",
    "<outlierId> — an outlier point",
    "<curveId> — a density curve",
    "<curveId>.legend-label — the curve name, only when there are two or more curves",
    "<regionId> — a shaded band under a curve",
    "<guideId> — a vertical guide line",
    "<guideId>.label — the guide's tick label",
    "x-label, y-label — the axis labels; y-label only when yLabel is not null",
    "title — only when title is not null",
  ],
  example: {
    instructions:
      "Help a learner see that most of a standard normal sits near the mean. Draw N(0, 1) with vertical guides at μ and ±1σ, ±2σ, ±3σ, and shade the band between −1σ and +1σ so they notice that region.",
    output: {
      type: "distribution",
      id: "standard-normal",
      title: "Standard normal",
      annotations: [
        {
          type: "callout",
          targetIds: ["within-one"],
          text: "About 68% of values",
        },
      ],
      chartStyle: "density",
      xLabel: "z",
      yLabel: null,
      curves: [{
        id: "z",
        name: "N(0, 1)",
        family: "normal",
        mean: 0,
        sd: 1,
      }],
      regions: [{
        id: "within-one",
        curveId: "z",
        from: -1,
        to: 1,
      }],
      guides: [
        { id: "m3", at: -3, label: "−3σ" },
        { id: "m2", at: -2, label: "−2σ" },
        { id: "m1", at: -1, label: "−1σ" },
        { id: "mu", at: 0, label: "μ" },
        { id: "p1", at: 1, label: "+1σ" },
        { id: "p2", at: 2, label: "+2σ" },
        { id: "p3", at: 3, label: "+3σ" },
      ],
    },
  },
} satisfies WhiteboardFigureDefinition<typeof distributionSchema>;

distributionSchema.parse(distribution.example.output);

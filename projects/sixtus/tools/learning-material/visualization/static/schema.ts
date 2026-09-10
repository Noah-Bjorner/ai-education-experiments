import { z } from "@zod";

/** Models often send "" for omitted optionals — coerce to undefined. */
const optionalText = z.string().optional().transform((value) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
});

export const DIAGRAM_TYPES = [
  "xy_chart",
  "flowchart",
  "pie_chart",
  "mind_map",
  "quadrant",
  "venn",
  "timeline",
  "radar",
  "sequence",
] as const;

export type DiagramType = typeof DIAGRAM_TYPES[number];

const titleField = z.string().min(1).describe(
  "Short learner-facing title shown above the diagram.",
);

const xyPointSchema = z.object({
  x: z.union([z.number(), z.string().min(1)]).describe(
    "X value: a number for continuous axes, or a category label for bar charts.",
  ),
  y: z.number().describe("Y value."),
  label: optionalText.describe(
    "Optional short callout on this point (e.g. Equilibrium, Peak). Omit unless pedagogically essential; use at most a few per chart.",
  ),
});

const xySeriesSchema = z.object({
  name: z.string().min(1).describe("Series legend label."),
  points: z.array(xyPointSchema).min(1).describe(
    "Data points for this series, in display order.",
  ),
});

export const xyChartSchema = z.object({
  type: z.literal("xy_chart"),
  title: titleField,
  chartStyle: z.enum(["line", "bar", "scatter"]).describe(
    "How to render the series: line for trends, bar for categories, scatter for individual points.",
  ),
  xLabel: z.string().min(1).describe("Label for the horizontal axis."),
  yLabel: z.string().min(1).describe("Label for the vertical axis."),
  series: z.array(xySeriesSchema).min(1).max(6).describe(
    "One or more data series. Prefer 1–3 unless comparison needs more.",
  ),
});

const flowchartNodeSchema = z.object({
  id: z.string().min(1).describe("Stable id referenced by edges."),
  label: z.string().min(1).describe("Text shown inside the node."),
  shape: z.enum(["start", "process", "decision", "end"]).describe(
    "start/end for terminals, process for steps, decision for yes/no branches.",
  ),
});

const flowchartEdgeSchema = z.object({
  from: z.string().min(1).describe("Source node id."),
  to: z.string().min(1).describe("Target node id."),
  label: optionalText.describe(
    "Optional edge label, e.g. Yes / No / condition. Omit when unlabeled.",
  ),
});

export const flowchartSchema = z.object({
  type: z.literal("flowchart"),
  title: titleField,
  nodes: z.array(flowchartNodeSchema).min(2).max(16).describe(
    "Process steps. Keep the graph readable (usually ≤12 nodes).",
  ),
  edges: z.array(flowchartEdgeSchema).min(1).describe(
    "Directed connections between nodes.",
  ),
});

const pieSliceSchema = z.object({
  label: z.string().min(1).describe("Slice name."),
  value: z.number().positive().describe(
    "Relative size. Absolute units are fine; rendering normalizes to percentages.",
  ),
  note: optionalText.describe(
    "Optional short clarification shown near the slice or legend.",
  ),
});

export const pieChartSchema = z.object({
  type: z.literal("pie_chart"),
  title: titleField,
  slices: z.array(pieSliceSchema).min(2).max(10).describe(
    "Parts of a whole. Prefer 3-7 slices.",
  ),
});

const mindMapNodeSchema = z.object({
  id: z.string().min(1).describe("Stable id for this node."),
  label: z.string().min(1).describe("Concept label."),
  parentId: z.string().min(1).nullable().describe(
    "Id of the parent node, or null for the root.",
  ),
});

export const mindMapSchema = z.object({
  type: z.literal("mind_map"),
  title: titleField,
  nodes: z.array(mindMapNodeSchema).min(2).max(24).describe(
    "Flat tree: exactly one root (parentId null); every other node points to a parent.",
  ),
});

const quadrantItemSchema = z.object({
  label: z.string().min(1).describe("Item name."),
  x: z.number().min(0).max(1).describe(
    "Horizontal position from 0 (left / low) to 1 (right / high).",
  ),
  y: z.number().min(0).max(1).describe(
    "Vertical position from 0 (bottom / low) to 1 (top / high).",
  ),
  note: optionalText.describe(
    "Optional short reason for placement.",
  ),
});

export const quadrantSchema = z.object({
  type: z.literal("quadrant"),
  title: titleField,
  xAxis: z.object({
    low: z.string().min(1).describe("Left-side axis meaning."),
    high: z.string().min(1).describe("Right-side axis meaning."),
  }),
  yAxis: z.object({
    low: z.string().min(1).describe("Bottom-side axis meaning."),
    high: z.string().min(1).describe("Top-side axis meaning."),
  }),
  quadrantLabels: z.object({
    topLeft: z.string().min(1),
    topRight: z.string().min(1),
    bottomLeft: z.string().min(1),
    bottomRight: z.string().min(1),
  }).optional().describe(
    "Optional names for the four regions (e.g. Stars, Dogs).",
  ),
  items: z.array(quadrantItemSchema).min(1).max(16).describe(
    "Items plotted into the 2×2 grid.",
  ),
});

const vennSetSchema = z.object({
  id: z.string().min(1).describe("Stable set id referenced by regions."),
  label: z.string().min(1).describe("Set name shown on the circle."),
});

const vennRegionSchema = z.object({
  sets: z.array(z.string().min(1)).min(1).max(3).describe(
    "Which set ids this region belongs to. One id = unique part; multiple = intersection.",
  ),
  label: z.string().min(1).describe(
    "Text for this region (concept, example, or property).",
  ),
});

export const vennSchema = z.object({
  type: z.literal("venn"),
  title: titleField,
  sets: z.array(vennSetSchema).min(2).max(3).describe(
    "Two or three overlapping sets.",
  ),
  regions: z.array(vennRegionSchema).min(1).max(7).describe(
    "Labels for unique parts and intersections that matter pedagogically.",
  ),
});

const timelineEventSchema = z.object({
  label: z.string().min(1).describe("Event name."),
  date: z.string().min(1).describe(
    "When it occurs: year, date, era, or relative marker (e.g. 'Day 1', 't=0').",
  ),
  description: optionalText.describe(
    "Optional one-line explanation.",
  ),
});

export const timelineSchema = z.object({
  type: z.literal("timeline"),
  title: titleField,
  events: z.array(timelineEventSchema).min(2).max(12).describe(
    "Events in chronological order.",
  ),
});

const radarSeriesSchema = z.object({
  name: z.string().min(1).describe("Series legend label."),
  values: z.array(z.number().min(0)).min(3).describe(
    "One value per axis, same order as axes. Use a shared scale (e.g. 0–100).",
  ),
});

export const radarSchema = z.object({
  type: z.literal("radar"),
  title: titleField,
  axes: z.array(z.string().min(1)).min(3).max(8).describe(
    "Spoke labels around the radar.",
  ),
  series: z.array(radarSeriesSchema).min(1).max(4).describe(
    "One or more profiles to compare. Each values array must match axes length.",
  ),
});

const sequenceMessageSchema = z.object({
  from: z.string().min(1).describe("Sender actor name (must match an actor)."),
  to: z.string().min(1).describe("Receiver actor name (must match an actor)."),
  label: z.string().min(1).describe("Message or step label."),
  kind: z.enum(["call", "return", "note"]).default("call").describe(
    "call = request/action, return = response, note = self/aside annotation.",
  ),
});

export const sequenceSchema = z.object({
  type: z.literal("sequence"),
  title: titleField,
  actors: z.array(z.string().min(1)).min(2).max(8).describe(
    "Participants shown as lifelines, left to right.",
  ),
  messages: z.array(sequenceMessageSchema).min(1).max(16).describe(
    "Ordered interactions between actors.",
  ),
});

export const diagramSchema = z.discriminatedUnion("type", [
  xyChartSchema,
  flowchartSchema,
  pieChartSchema,
  mindMapSchema,
  quadrantSchema,
  vennSchema,
  timelineSchema,
  radarSchema,
  sequenceSchema,
]);

export type Diagram = z.infer<typeof diagramSchema>;

/** Per-type schemas for the fill step (type already chosen by the router). */
export const diagramSchemas = {
  xy_chart: xyChartSchema,
  flowchart: flowchartSchema,
  pie_chart: pieChartSchema,
  mind_map: mindMapSchema,
  quadrant: quadrantSchema,
  venn: vennSchema,
  timeline: timelineSchema,
  radar: radarSchema,
  sequence: sequenceSchema,
} as const;

/** Router output: which diagram type to fill next. */
export const diagramRouteSchema = z.object({
  type: z.enum(DIAGRAM_TYPES).describe(
    "The single diagram type that best teaches the instruction.",
  ),
});

export type DiagramRoute = z.infer<typeof diagramRouteSchema>;

/** Rendered output from the programmatic static visualization path. */
export const svgStaticVisualizationSchema = z.object({
  category: z.literal("diagram").describe(
    "Visualization family. Currently only diagrams are supported.",
  ),
  diagram: diagramSchema.describe(
    "Typed diagram payload for the chosen diagram type.",
  ),
  svg: z.string().startsWith("<svg").describe(
    "Standalone SVG markup produced by the deterministic renderer.",
  ),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export type SvgStaticVisualization = z.infer<
  typeof svgStaticVisualizationSchema
>;

import { DIAGRAM_TYPES, type DiagramType } from "./schema.ts";

/** Fast classify step: instruction → one diagram type id. */
export const SVG_DIAGRAM_ROUTE_SYSTEM_PROMPT = [
  "## Role",
  "You choose which single diagram type best teaches a visualization instruction.",
  "Do not fill in data — only pick the type. A later step will create the structured payload.",
  "",
  "## Allowed types",
  `- ${DIAGRAM_TYPES.join(", ")}`,
  "",
  "## When to use each",
  "- xy_chart: trends, comparisons, functions, distributions on X/Y",
  "- flowchart: algorithms, decision trees, procedures with branches",
  "- pie_chart: composition / parts of a whole",
  "- mind_map: concept hierarchies / related ideas around a center",
  "- quadrant: 2×2 frameworks, prioritization, tradeoff matrices",
  "- venn: overlaps, shared vs unique properties (2–3 sets)",
  "- timeline: chronological sequences, stages over time",
  "- radar: multi-axis profiles and comparisons",
  "- sequence: interactions over time between participants",
  "",
  "## Rules",
  "- Pick exactly one type. Prefer the simplest type that still makes the teaching point clear.",
  "- Match geometry to the concept (process → flowchart/sequence; parts of a whole → pie_chart; etc.).",
].join("\n");

/** Fill step: instruction + known type → structured diagram data. */
export function svgStaticSpecSystemPrompt(type: DiagramType): string {
  return [
    "## Role",
    `You turn a visualization instruction into structured data for a ${type} diagram.`,
    "A later deterministic renderer will turn this into SVG — you only fill accurate, teachable content.",
    "The diagram type is already chosen; do not pick a different type.",
    "",
    "## Content rules",
    "- Stay faithful to the instruction. Do not invent facts, statistics, or dates you are not given or that are not common knowledge needed to illustrate the concept.",
    '- Prefer concrete labels a learner can read at a glance. Avoid meta commentary ("this diagram shows…").',
    "- Keep size modest so the diagram stays readable (few series, few nodes, short labels).",
    "- Use the instruction's numbers and names when provided; otherwise use clear illustrative placeholders that still teach the structure.",
    "- Always populate every required array with real items — never return empty series, nodes, slices, events, or messages.",
    "- Every diagram needs a short title.",
    "",
    "## Output",
    `Return a ${type} object that matches the schema (including type: \"${type}\").`,
  ].join("\n");
}

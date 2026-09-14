import {
  whiteboardFigureCategories,
  whiteboardFigures,
} from "./figures/index.ts";

// PLANNER PROMPT

export const WHITEBOARD_PLANNER_PROMPT = `
# Role
You plan educational whiteboard visualizations. You turn a learning goal into a small set of figure briefs that independent figure generators will draw; you decide what to show and in what order, not how to draw it.

# Task
Plan a whiteboard for the supplied educational goal. Return JSON with a concise board title (or null) and figurePlans in reading order. Each figure needs only type and instructions; code assigns IDs and placement, and figure generators choose local titles and drawing details.

## Figure types

${
  Object.entries(whiteboardFigureCategories).map(([category, figures]) =>
    [
      `### ${category.charAt(0).toUpperCase()}${category.slice(1)}`,
      ...figures.map((figure) => `- ${figure.type}: ${figure.useWhen}`),
    ].join("\n")
  ).join("\n\n")
}

## Planning rules

- Use the fewest figures that fully support the learning goal. Prefer a specialized type whenever it can express the intended content.
- Give each figure a clear teaching purpose. Keep related content together when it forms one coherent explanation; split it when a separate representation or teaching step improves understanding.
- In each brief, specify the essential content and the relationship, reasoning, or takeaway the learner should understand. Match the supplied learner level and preserve any requested teaching approach.
- Generators receive the original goal and their own brief, but not other figures or their outputs. Scope each brief to its assigned contribution.
- Resolve choices that must agree across figures and repeat the relevant values, names, units, variable meanings, and assumptions in each brief.
- Preserve supplied facts and constraints. Derive values when justified. Introduce illustrative values only when needed and compatible with the goal; choose them consistently and identify them as illustrative. Do not fabricate factual data.
- Add a text figure only when a question, note, or takeaway contributes something useful beyond the visualization itself. State its role.
- Put questions immediately before the relevant visualization and notes/takeaways immediately after it.
- Write a concise, self-contained brief for each figure. Include necessary labels, mathematical coordinates, relationships, and teaching emphasis. Leave rendering coordinates, styling, element IDs, and detailed drawing specifications to the generator.
- Use a concise board title when it adds useful context; otherwise use null.

## Example: one figure
Goal: Help a 7th grader solve 2x + 4 = 22.

\`\`\`json
{
  "title": null,
  "figurePlans": [
    {
      "type": "math_expressions",
      "instructions": "Show 2x + 4 = 22, subtract 4 from both sides, then divide by 2 to get x = 9."
    }
  ]
}
\`\`\`

## Example: related figures
Goal: Help a learner connect a triangle's perpendicular height to its area: base 10 cm, height 6 cm. Show a diagram followed by the calculation.

\`\`\`json
{
  "title": "Triangle area",
  "figurePlans": [
    {
      "type": "geometry",
      "instructions": "Draw a triangle with base 10 cm and perpendicular height 6 cm; label both and mark the right angle to distinguish height from a sloping side."
    },
    {
      "type": "math_expressions",
      "instructions": "Show A = bh/2 for a triangle with base 10 cm and height 6 cm, then substitute to obtain 30 cm²."
    }
  ]
}
\`\`\``;

export const GOAL_PROMPT = (goal: string): string => `
# Goal
${goal}
`;




// FIGURE PROMPT

export function whiteboardFigureSystemPrompt(
  figure: (typeof whiteboardFigures)[number],
): string {
  return `# Task
Create one educational whiteboard figure from its construction brief.
Return only the figure JSON matching the supplied schema.

# Shared rules
- Use the assigned figure ID exactly, including in annotation target IDs.
- Preserve the brief's facts, values, units, and teaching purpose.
- Use a null figure title when unnecessary or when it would repeat the board title.
- Give elements unique lowercase IDs containing only letters, digits, and hyphens.
- Include annotations when useful, otherwise use an empty array. Target only this figure's declared elements and supported visual parts.
- The board already controls placement. Do not output anchor, side, or other fields outside the schema.

# Figure type: ${figure.type}
${figure.instructions}

# Example
Goal: ${figure.example.goal}
${JSON.stringify(figure.example.output, null, 2)}
`;
}

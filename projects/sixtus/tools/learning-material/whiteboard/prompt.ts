import { whiteboardChildren } from "./children/index.ts";

function formatJsonExample(value: unknown): string {
  return ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
}

export const WHITEBOARD_SPEC_SYSTEM_PROMPT = `# Task

Create a whiteboard spec that accomplishes the user's educational or communication goal.
The goal describes what the audience should understand or take away.
Choose the visual content, child types, and arrangement that make that outcome easiest to achieve.
Use the audience context, facts, and constraints supplied with the goal to guide your choices.
A renderer will draw the result using the JSON you provide.

# Output structure

Return one JSON object:

{
  "layout": "<single | split | stack>",
  "children": [<ordered child objects>]
}

Allowed child types: ${
  whiteboardChildren.map((child) => child.type).join(", ")
}.
Each child follows one of the child type definitions below.
Different child types may appear together in the same whiteboard.

Example complete output for the goal:
"Help a learner compare quantities and see that there are 2 more oranges than apples: 4 apples and 6 oranges."

\`\`\`json
{
  "layout": "single",
  "children": [
    {
      "type": "xy_chart",
      "id": "fruit",
      "title": "Fruit counts",
      "annotations": [],
      "chartStyle": "bar",
      "xLabel": "Fruit",
      "yLabel": "Count",
      "series": [
        {
          "id": "quantity",
          "name": "Quantity",
          "points": [
            {
              "id": "apples",
              "x": "Apples",
              "y": 4
            },
            {
              "id": "oranges",
              "x": "Oranges",
              "y": 6
            }
          ]
        }
      ]
    }
  ]
}
\`\`\`

This example demonstrates the output structure.
Choose the layout, child types, and content for the actual goal.
Return only the JSON object, without Markdown fences or explanations.

# Choosing a layout

- \`single\`: exactly one child. Use by default.
- \`split\`: exactly two children, displayed left to right. Use when viewing them together supports a direct comparison.
- \`stack\`: two or more children, displayed top to bottom. Use when the children form a sequence or need more horizontal space.

Prefer combining related content into one child when that is clearer than using separate children.
Prefer the simplest type and layout that accomplishes the educational or communication goal.

# Shared content rules

- Preserve the numbers, names, and units supplied with the goal.
- Give every child a short title that identifies its subject.
- Prefer concrete labels a learner can read at a glance. Avoid meta commentary ("this visualization shows…").
- Use concise labels. Include units when they help a learner read the values.
- Use JSON numbers for numeric values: 1200, not "1,200".
- Populate content arrays with meaningful items; annotations may be empty. Coordinate plots may use an empty elements array for a blank grid exercise.
- Keep terminology and units consistent across related children.
- Do not add fields that are absent from the output or child definitions.

For conceptual examples, you may choose illustrative values. Make their illustrative nature clear in the child's title.
For claims about real populations, historical events, measurements, or statistics, do not invent missing values.

# Annotations

Generate annotations together with the base content in this spec when they help teach the goal or are explicitly requested.
Include an \`annotations\` array on each child; use \`[]\` when no annotations are needed.
Each annotation has exactly three fields: \`type\`, \`targetIds\`, and \`content\`.

- \`type\`: "circle", "box", "underline", "strikethrough", "number", "arrow", "line", or "bracket".
- \`targetIds\`: a nonempty array of visual target IDs belonging to this child. Use exactly one target except for brackets, which may group multiple targets. Use separate annotations for separate circles, numbers, or callouts.
- \`content\`: null for circle, box, underline, and strikethrough; a positive integer as a string (for example "1") for number; a nonempty explanatory message for arrow and line; a label string or null for bracket. Never use an empty string.

Arrow and line are message callouts: the renderer connects the message to the single target. They do not connect two existing targets. Number places the supplied number beside the target; it is not animation or reveal order.
Use underline and strikethrough on text targets. Use strikethrough only when the teaching goal explicitly calls for crossing out content, without changing the supplied facts.
Keep messages concise, factual, and useful to the intended takeaway. The renderer controls positions, sizes, colors, and connector placement; do not output pixel coordinates or presentation styling. Freeform children may supply local drawing coordinates and the limited style choices documented in their definition. Geometry and coordinate_plot children may supply mathematical coordinates and the semantic drawing options documented in their definition.

## Target IDs

Assign every child, coordinate plot element, expression, series, point, slice, geometry object, geometry label, and geometry marking an \`id\` in the generated spec. IDs start with a lowercase letter and contain only lowercase letters, digits, and hyphens.
Child IDs must be unique across the board. Series and point IDs must be unique together within their XY child; slice IDs must be unique within their pie child; expression IDs must be unique within their math child. Geometry element IDs must be unique together within their geometry child. Freeform element IDs must be unique within their child. Coordinate plot element IDs must be unique within their coordinate plot child. Preserve IDs when editing existing content.
Build visual target IDs using the exact naming rules in each child definition, such as \`books.fiction.legend-label\`. The suffix identifies the visual part of the element.
Reference only IDs declared in this spec and visual parts supported by that child. Annotations belong to their own child; do not reference another child's targets.

# Child types

${
  whiteboardChildren.map((child) =>
    [
      `## ${child.type}`,
      child.instructions,
      "### Example child object",
      `Goal: ${child.example.goal}`,
      formatJsonExample(child.example.output),
    ].join("\n\n")
  ).join("\n\n")
}

# Final checks

Before returning the JSON, check that:

- The number of children matches the layout.
- Every child follows its selected type's structure.
- Content arrays contain items, except annotations and coordinate plot elements for a blank grid exercise.
- IDs are unique in their scope, and annotation targets resolve to declared elements and supported parts in the same child.
- Every annotation follows its type's target count and content rules.
- The visual content makes the intended takeaway clear and serves the goal.
- Values and labels agree with the facts and constraints supplied with the goal.
- Illustrative values are clearly identified.`;

export const WHITEBOARD_GOAL_WRAPPER_PROMPT = (goal: string) =>
  `## Goal
${goal}
`;

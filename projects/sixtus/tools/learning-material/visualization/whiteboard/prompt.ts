import { whiteboardChildren } from "./children/index.ts";

function formatJsonExample(value: unknown): string {
  return ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
}

export const WHITEBOARD_SPEC_SYSTEM_PROMPT = `# Task

Turn the user's visualization instruction into a whiteboard spec.
Choose the children and arrangement that make the idea easiest to understand.
A renderer will draw the result using the JSON you provide.

# Output structure

Return one JSON object:

{
  "layout": "<single | split | stack>",
  "children": [<ordered child objects>]
}

Allowed child types: ${whiteboardChildren.map((child) => child.type).join(", ")}.
Each child follows one of the child type definitions below.
Different child types may appear together in the same whiteboard.

Example complete output for:
"Compare 4 apples with 6 oranges using a bar chart."

\`\`\`json
{
  "layout": "single",
  "children": [
    {
      "type": "xy_chart",
      "title": "Fruit counts",
      "chartStyle": "bar",
      "xLabel": "Fruit",
      "yLabel": "Count",
      "series": [
        {
          "name": "Quantity",
          "points": [
            {
              "x": "Apples",
              "y": 4
            },
            {
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
Choose the layout, child types, and content for the actual instruction.
Return only the JSON object, without Markdown fences or explanations.

# Choosing a layout

- \`single\`: exactly one child. Use by default.
- \`split\`: exactly two children, displayed left to right. Use when viewing them together supports a direct comparison.
- \`stack\`: two or more children, displayed top to bottom. Use when the children form a sequence or need more horizontal space.

Prefer combining related content into one child when that is clearer than using separate children.
Prefer the simplest type and layout that still makes the teaching point clear.

# Shared content rules

- Preserve the numbers, names, and units supplied in the instruction.
- Give every child a short title that identifies its subject.
- Prefer concrete labels a learner can read at a glance. Avoid meta commentary ("this visualization shows…").
- Use concise labels. Include units when they help a learner read the values.
- Use JSON numbers for numeric values: 1200, not "1,200".
- Populate every required array with meaningful items.
- Keep terminology and units consistent across related children.
- Do not add fields that are absent from the output or child definitions.

For conceptual examples, you may choose illustrative values. Make their illustrative nature clear in the child's title.
For claims about real populations, historical events, measurements, or statistics, do not invent missing values.

# Child types

${
  whiteboardChildren.map((child) =>
    [
      `## ${child.type}`,
      child.instructions,
      "### Example child object",
      `Instruction: ${child.example.instruction}`,
      formatJsonExample(child.example.output),
    ].join("\n\n")
  ).join("\n\n")
}

# Final checks

Before returning the JSON, check that:

- The number of children matches the layout.
- Every child follows its selected type's structure.
- All required arrays contain items.
- Values and labels agree with the instruction.
- Illustrative values are clearly identified.`;

export const WHITEBOARD_INSTRUCTION_WRAPPER_PROMPT = (instruction: string) =>
  `## Instruction
${instruction}
`;

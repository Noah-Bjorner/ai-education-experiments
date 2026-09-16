import {
  whiteboardFigures,
} from "./figures/index.ts";
import { formatFigureSchemaFields } from "./schema-fields.ts";


// SINGLE-SHOT SPEC PROMPT

export interface WhiteboardSpecSystemInput {
  availableFigures: Array<(typeof whiteboardFigures)[number]>;
}

export interface WhiteboardSpecUserInput {
  goal: string;
  showTitle: boolean;
}

export const WHITEBOARD_SPEC_USER_PROMPT = (
  { goal, showTitle }: WhiteboardSpecUserInput,
): string =>
  `# Goal
${goal}

# Board title
${
    showTitle
      ? "Include a board title: a short phrase naming the topic or relationship the figures share."
      : "Do not include a board title. Set `title` to null."
  }
`;

export const WHITEBOARD_SPEC_SYSTEM_PROMPT = (
  { availableFigures }: WhiteboardSpecSystemInput,
): string => {
  const types = new Set(availableFigures.map((figure) => figure.type));
  const typeNames = availableFigures.map((figure) => figure.type).join(", ");
  const textOrderingBullets = types.has("text")
    ? `
- A text figure's position is its meaning. A question comes immediately before the visualization it frames, or before the next question in the same group. Nothing else sits between a question and its visualization.
- A note or takeaway comes immediately after the visualization it refers to, or after another note or takeaway on that same visualization. It never follows a question directly.
- Do not routinely wrap a visualization in an opening question and a closing takeaway. Each text figure must do a job the visualization, its labels, or an annotation cannot.
- A board with only text figures is ordered for reading.`
    : "";
  const freeformBullet = types.has("freeform") && types.size > 1
    ? "\n- Prefer a specialized figure type whenever one can express the content. Use freeform only when none fits."
    : "";

  return `# Task

Create the complete spec for an educational whiteboard from the goal in the user message. You make every content decision: which of the available figures to include, what each shows, and which annotations direct the learner's attention. A renderer draws the result from your JSON.

These types were selected for this goal: ${typeNames}. Use any of them, once or several times, and leave out any the goal does not need.

# Plan the content

Read the goal to determine what the board should accomplish: depict supplied content, explain an idea, guide the learner through a process, or a combination. Match scope and depth to that purpose, the learner level, and any requested teaching approach. A request to visualize something may be complete with one figure; a request for thorough teaching may need explanation, intermediate steps, and examples.

- Fulfill the goal with only as much content and detail as needed to make it clear and complete. Stop when the goal is met.
- Add another figure only when leaving it out would create a specific gap in understanding or omit something explicitly requested. A different representation of the same content is not sufficient reason by itself.
- Before finalizing, remove anything whose absence would leave the board equally clear and complete. Keep necessary steps readable; do not achieve fewer figures by overcrowding them.
- Order figures in the sequence the learner should read them, top to bottom.${textOrderingBullets}
- Combine related content into one figure when that is clearer, such as several series in one chart or all algebra steps in one math figure.
- Preserve supplied facts, values, names, and units. Derive values when justified. Introduce illustrative values only when the goal needs them, keep them consistent across figures, and make their illustrative nature clear in that figure's title. Do not fabricate data about real populations, events, measurements, or statistics.${freeformBullet}

# Output

Return one JSON object:

{
  "title": <string or null>,
  "figures": [<figure objects in reading order>]
}

- \`title\` is the board heading drawn above all figures. The user message states whether to include one. When included, use a short phrase naming the shared topic or relationship; otherwise null.
- Each figure has \`type\`, a unique \`id\`, \`title\`, \`annotations\` (\`[]\` when none), and the fields of its type. Include \`id\` and \`annotations\` on every figure even where a field list marks them optional.
- Placement is handled separately: figures are stacked in the order you return them. Do not output anchor, side, layout, size, or board coordinates.
- Figure \`title\`: default null. Add one only to identify what the figure shows when its content does not already make that clear. Never repeat the board title, a label, or a framing question. math_expressions rarely needs one.

# Shared rules

- Use JSON numbers for numeric values: 1200, not "1,200".
- Use concise, concrete labels a learner can read at a glance. Include units when they help. Avoid meta commentary such as "this chart shows".
- Keep terminology, names, and units consistent across figures.
- Plain-text titles, labels, notes, and callouts cannot use combining accents such as ⃗. Write v or v →. Use LaTeX only in fields that accept it.
- Do not add fields that are absent from the figure definitions.
- IDs start with a lowercase letter and contain only lowercase letters, digits, and hyphens. Figure IDs are unique across the board. Element IDs (expressions, series, points, slices, geometry points, objects, labels, markings, plot elements, freeform elements) are unique within their figure. Give every element an \`id\`.
- Build annotation targets as \`<figureId>.<elementId>.<part>\`, or \`<figureId>.<part>\` for figure-level parts, using the targets listed under each figure type. Reference only IDs declared in this spec. Annotations belong to their own figure and never target another figure.

# Annotations

Annotations direct attention to what the learner should notice. Add one when the drawing does not make the point by itself; skip it when the drawing already does, such as algebra steps in order or a labelled right angle. Every annotation should earn its place.

Five moves are available, each mapped to a mark type:

- Highlight an element so the learner notices it: "circle", "box", or "underline".
- Call out an element with a short message: "arrow" or "line".
- Number the order of steps or elements: "number".
- Group elements that belong together: "bracket", with an optional label.
- Cross out something wrong or eliminated: "strikethrough".

Each annotation has exactly three fields: \`type\`, \`targetIds\`, and \`content\`.

- circle, box, underline, strikethrough: \`content\` is null; exactly one target.
- number: \`content\` is a positive integer as text ("1", "2", …); exactly one target. It marks order, not animation.
- arrow, line: \`content\` is a nonempty message; exactly one target. They connect the message to the target, never two targets.
- bracket: \`content\` is a label or null; one or more targets.

Use underline and strikethrough only on text targets, and strikethrough only when the goal explicitly calls for crossing something out. Keep messages concise and factual. Target only this figure's declared elements and the parts listed under its type. The renderer places marks and callouts; do not output coordinates or styling for them.

# Figure types

${
    availableFigures.map((figure) =>
      [
        `## ${figure.type}`,
        `${figure.summary} Use when ${figure.useWhen}.`,
        "### Fields",
        formatFigureSchemaFields(figure.schema),
        "### Rules",
        figure.rules,
        "### Annotation targets",
        figure.annotationTargets.map((target) => `- ${target}`).join("\n"),
        "### Example figure",
        `Goal: ${figure.example.instructions}`,
        "```json",
        JSON.stringify(
          {
            ...figure.example.output,
            annotations: figure.example.output.annotations ?? [],
          },
          null,
          2,
        ),
        "```",
      ].join("\n\n")
    ).join("\n\n")
  }

# Final checks

Before returning the JSON, check that:

- Every figure uses an available type and follows that type's fields and rules.
- \`title\` follows the user message's board-title instruction; no annotation targets \`<id>.title\` on a figure whose title is null.
- Figure IDs are unique across the board, element IDs are unique within their figure, and every annotation target resolves to a declared element and a supported part in the same figure.
- Every annotation follows its type's target-count and content rules.
- Values and labels agree with the goal's facts; illustrative values are identified.
- Nothing remains whose removal would leave the board equally clear and complete.

# Example

This example demonstrates the output shape. Its figure types may differ from the ones available for the actual goal; choose figures and content for the actual goal.

## User message

\`\`\`text
# Goal
Help a 6th grader connect a triangle's perpendicular height to its area: base 10 cm, height 6 cm. Show the diagram, then the calculation, and make clear that the height is perpendicular to the base rather than a sloping side.

# Board title
Include a board title: a short phrase naming the topic or relationship the figures share.
\`\`\`

## Output

\`\`\`json
{
  "title": "Area of a triangle",
  "figures": [
    {
      "type": "geometry",
      "id": "triangle",
      "title": null,
      "annotations": [
        {
          "type": "arrow",
          "targetIds": ["triangle.height.mark"],
          "content": "The height meets the base at a right angle"
        }
      ],
      "unit": "cm",
      "points": [
        { "id": "a", "kind": "position", "at": [3, 6] },
        { "id": "b", "kind": "position", "at": [0, 0] },
        { "id": "c", "kind": "position", "at": [10, 0] },
        { "id": "d", "kind": "projection", "point": "a", "onto": ["b", "c"] }
      ],
      "objects": [
        { "id": "abc", "kind": "polygon", "points": ["a", "b", "c"] },
        { "id": "height", "kind": "segment", "points": ["a", "d"], "dashed": true }
      ],
      "labels": [
        { "id": "base-length", "kind": "length", "points": ["b", "c"] },
        { "id": "height-length", "kind": "length", "points": ["a", "d"] }
      ],
      "markings": [
        { "id": "foot", "kind": "right-angle", "points": ["a", "d", "c"] }
      ]
    },
    {
      "type": "math_expressions",
      "id": "area",
      "title": null,
      "annotations": [],
      "expressions": [
        { "id": "formula", "latex": "A = \\\\frac{1}{2} b h" },
        { "id": "substitute", "latex": "A = \\\\frac{1}{2} (10)(6)" },
        { "id": "result", "latex": "A = 30\\\\ \\\\text{cm}^2" }
      ]
    }
  ]
}
\`\`\``;
};

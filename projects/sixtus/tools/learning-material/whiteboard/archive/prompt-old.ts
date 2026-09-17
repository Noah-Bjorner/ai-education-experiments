import { whiteboardFigures } from "../figures/index.ts";
import type { WhiteboardOrientation } from "../schema.ts";
import { formatFigureSchemaFields } from "../schema-fields.ts";
import { whiteboardFigureCategories } from "../figures/index.ts";

function formatJsonExample(value: unknown): string {
  return ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
}

function placingFiguresSection(orientation: WhiteboardOrientation): string {
  const packing = orientation === "portrait"
    ? `- The board is viewed in portrait. Stack every figure in a single column from top to bottom. Never use side "left" or "right", even for comparisons.
- Every later figure anchors to the previous figure with side "bottom".`
    : `- The board is viewed in landscape. Place at most three figures side by side in a row. A fourth figure starts a new row underneath the first figure of the previous row.
- Within a row, anchor each next figure to the previous with side "right".
- To start a new row, anchor to the first figure of the previous row with side "bottom", then continue that row with side "right".
- Never place a fourth figure in the same row.
- Text questions, notes, and takeaways still use side "bottom" and sit on their own row, not beside a visualization.`;

  return `# Placing figures

- Use one figure by default. Its \`anchor\` and \`side\` must both be null.
- Every figure must have a unique \`id\` and flat \`anchor\` and \`side\` fields.
- The first figure is the only root: \`anchor: null, side: null\`.
- Every later figure sets \`anchor\` to an earlier figure's ID and \`side\` to "top", "left", "right", or "bottom".
- Anchor to any earlier figure, not necessarily the previous one. Do not use forward references or self references.
${packing}
- The renderer packs figures for this orientation and adds space for all content, including annotations.
- Placement uses only anchor and side. Do not include layout, alignment, size, gap, or board coordinates.
- Text reading order: questions precede their answering visualization, which anchors below the question with side "bottom". Notes and takeaways follow their visualization, anchored below it or chained below its other notes/takeaways. See the text figure rules for text-only boards and question groups.

Prefer combining related content into one figure when that is clearer than using separate figures.
Prefer the simplest figure types and arrangement that accomplish the educational or communication goal.`;
}

export function whiteboardSpecSystemPrompt(
  orientation: WhiteboardOrientation = "portrait",
): string {
  return `# Task

Create a whiteboard spec that accomplishes the user's educational or communication goal.
The goal describes what the audience should understand or take away.
Choose the visual content, figure types, and arrangement that make that outcome easiest to achieve.
Use the audience context, facts, and constraints supplied with the goal to guide your choices.
A renderer will draw the result using the JSON you provide.

# Output structure

Return one JSON object:

{
  "title": "<board heading or null>",
  "figures": [<ordered figure objects>]
}

Allowed figure types: ${
  whiteboardFigures.map((figure) => figure.type).join(", ")
}.
Each figure follows one of the figure type definitions below.
Different figure types may appear together in the same whiteboard.

Example complete output for the goal:
"Help a learner compare quantities and see that there are 2 more oranges than apples: 4 apples and 6 oranges."

\`\`\`json
{
  "title": null,
  "figures": [
    {
      "type": "xy_chart",
      "id": "fruit",
      "anchor": null,
      "side": null,
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
Choose the placements, figure types, and content for the actual goal.
Return only the JSON object, without Markdown fences or explanations.

${placingFiguresSection(orientation)}

# Titles

- The root \`title\` is a board heading drawn centered above all figures. Use it for a heading over multiple figures or a question that frames the board. Use \`null\` when no board heading is needed or a single figure's title already serves as one.
- Each figure \`title\` identifies that figure's subject. Use \`null\` when the figure speaks for itself (especially math_expressions) or when the board title already names a single figure.
- Never duplicate the board title as a figure title.

# Shared content rules

- Preserve the numbers, names, and units supplied with the goal.
- Prefer concrete labels a learner can read at a glance. Avoid meta commentary ("this visualization shows…").
- Use concise labels. Include units when they help a learner read the values.
- Use JSON numbers for numeric values: 1200, not "1,200".
- Populate content arrays with meaningful items; annotations may be empty. Coordinate plots may use an empty elements array for a blank grid exercise.
- Keep terminology and units consistent across related figures.
- Do not add fields that are absent from the output or figure definitions.

For conceptual examples, you may choose illustrative values. Make their illustrative nature clear in the figure's title.
For claims about real populations, historical events, measurements, or statistics, do not invent missing values.

# Annotations

Generate annotations together with the base content in this spec when they help teach the goal or are explicitly requested.
Include an \`annotations\` array on each figure; use \`[]\` when no annotations are needed.
Each annotation has exactly three fields: \`type\`, \`targetIds\`, and \`content\`.

- \`type\`: "circle", "box", "underline", "strikethrough", "number", "arrow", "line", or "bracket".
- \`targetIds\`: a nonempty array of visual target IDs belonging to this figure. Use exactly one target except for brackets, which may group multiple targets. Use separate annotations for separate circles, numbers, or callouts.
- \`content\`: null for circle, box, underline, and strikethrough; a positive integer as a string (for example "1") for number; a nonempty explanatory message for arrow and line; a label string or null for bracket. Never use an empty string.

Arrow and line are message callouts: the renderer connects the message to the single target. They do not connect two existing targets. Number places the supplied number beside the target; it is not animation or reveal order.
Use underline and strikethrough on text targets. Use strikethrough only when the teaching goal explicitly calls for crossing out content, without changing the supplied facts.
Keep messages concise, factual, and useful to the intended takeaway. The renderer controls positions, sizes, colors, and connector placement; do not output pixel coordinates or presentation styling. Freeform figures may supply local drawing coordinates and the limited style choices documented in their definition. Geometry and coordinate_plot figures may supply mathematical coordinates and the semantic drawing options documented in their definition.

## Target IDs

Assign every figure, coordinate plot element, expression, series, point, slice, geometry object, geometry label, and geometry marking an \`id\` in the generated spec. IDs start with a lowercase letter and contain only lowercase letters, digits, and hyphens.
Figure IDs must be unique across the board. Series and point IDs must be unique together within their XY figure; slice IDs must be unique within their pie figure; expression IDs must be unique within their math figure. Geometry element IDs must be unique together within their geometry figure. Freeform element IDs must be unique within their figure. Coordinate plot element IDs must be unique within their coordinate plot figure. Preserve IDs when editing existing content.
Build visual target IDs using the exact naming rules in each figure definition, such as \`books.fiction.legend-label\`. The suffix identifies the visual part of the element.
Reference only IDs declared in this spec and visual parts supported by that figure. Annotations belong to their own figure; do not reference another figure's targets.

# Figure types

${
  whiteboardFigures.map((figure) =>
    [
      `## ${figure.type}`,
      figure.rules,
      "### Annotation targets",
      figure.annotationTargets.map((target) => `- ${target}`).join("\n"),
      "### Example figure object",
      `Goal: ${figure.example.instructions}`,
      formatJsonExample({ ...figure.example.output, anchor: null, side: null }),
    ].join("\n\n")
  ).join("\n\n")
}

# Final checks

Before returning the JSON, check that:

- Root \`title\` is a string or null; figure titles are strings or null; no annotation targets \`<id>.title\` on a figure whose title is null.
- The first figure has null anchor and side; every later figure has a side and anchors to an earlier figure ID.
- Every figure follows its selected type's structure.
- Content arrays contain items, except annotations and coordinate plot elements for a blank grid exercise.
- IDs are unique in their scope, and annotation targets resolve to declared elements and supported parts in the same figure.
- Every annotation follows its type's target count and content rules.
- The visual content makes the intended takeaway clear and serves the goal.
- Values and labels agree with the facts and constraints supplied with the goal.
- Illustrative values are clearly identified.`;
}

export const WHITEBOARD_SPEC_SYSTEM_PROMPT = whiteboardSpecSystemPrompt();

export const WHITEBOARD_GOAL_WRAPPER_PROMPT = (goal: string) =>
  `## Goal
${goal}
`;





// OLD NEW PROMPTS



// PLANNER PROMPT

export const WHITEBOARD_PLANNER_PROMPT = `
# Role and responsibility

Plan the content of an educational whiteboard for the supplied goal. You read the goal, determine what the whiteboard should accomplish, and write instructions for each figure. Separate figure generators then build the figures from your instructions.

You make every content decision: how to fulfill the goal, which figure types to use, what each figure shows, what the learner should notice, and which details must be consistent across figures, such as values, names, and units. Generators implement your decisions; they do not make their own.

Each figure is generated independently from its instructions alone. The figure generator never sees the learning goal, the other figures, or their output.

# Available figure types

${
  Object.entries(whiteboardFigureCategories).map(([category, figures]) =>
    [
      `## ${category.charAt(0).toUpperCase()}${category.slice(1)}`,
      ...figures.map((figure) =>
        `- ${figure.type}: ${figure.summary} Use when ${figure.useWhen}.`
      ),
    ].join("\n")
  ).join("\n\n")
}

# Plan the content

Read the goal to determine what the whiteboard should accomplish: depict supplied content, explain an idea, guide the learner through a process, or some combination. Match the scope and depth to that purpose, the learner level, and any requested teaching approach. A request to visualize something may be complete with one clear figure; a request for thorough teaching may need explanation, intermediate steps, and examples.

- Fulfill the goal with only as much content and detail as needed to make it clear and complete. Include only the figures, examples, steps, and annotations needed for the requested purpose. Stop when the goal is met.
- Add another figure only when leaving it out would create a specific gap in understanding or omit something explicitly requested. A different representation is not sufficient reason by itself.
- Before finalizing, remove anything whose absence would leave the result equally clear and complete. Keep necessary steps readable; do not achieve fewer figures by overcrowding them.
- Order figures in the sequence the learner should read them.
- Prefer a specialized figure type whenever one can express the content. Use freeform only when none fits.
- Preserve supplied facts and constraints. Derive values when justified. Introduce illustrative values only when the goal needs them, keep them consistent across figures, and state in the instructions that they are illustrative. Do not fabricate factual data.

# Write each figure's instructions

Instructions are read only by the generator building that figure. Write for that reader: clear, complete, and self-contained. The generator cannot fill gaps from the goal or from other figures.

- Include everything the figure needs: what it shows, the exact content (labels, values, coordinates, expressions, relationships, units), any assumptions, and what the learner should understand from it. For a chart, that means every data point.
- Carry over whatever from the goal matters for this figure: learner level, teaching approach, and constraints.
- Repeat shared details in every figure that uses them. Never refer to another figure, such as "as in the diagram above" or "the same values as before".
- Make every content decision yourself. Do not write "choose suitable values" or "add an example if helpful".
- Use a figure title only to identify what the figure shows when that is not already clear. If a title would repeat the board title, labels, or a framing question elsewhere, explicitly instruct that figure's generator to omit it.
- Leave implementation to the generator: layout, styling, element IDs, annotation mark types, and rendering details.

## Annotations

Annotations direct attention to what the learner should notice. Decide them as part of the teaching plan. Use one when the drawing does not make the point by itself. Skip it when the drawing already does, such as algebra steps in order or a labelled right angle.

Five moves are available on every figure type:

- Highlight: mark an element so the learner notices it, such as a term, a bar, or a point.
- Call out: attach a short message to an element, such as "this is the perpendicular height."
- Number: mark the order of steps or elements.
- Group: bracket elements that belong together, with an optional label.
- Cross out: mark something as wrong or eliminated.

For each annotation, name the move, the element it applies to, and the point it should make, in learner language: "call out the height and say it is perpendicular to the base, not a sloping side." Be specific about what to mark and what it should communicate; leave the visual form and target IDs to the generator. Add only what the figure needs to make its point; every annotation should earn its place.

# Output contract

Return only JSON with these fields:

- title: default to null. Add a board title only when it clarifies a shared topic or relationship across multiple figures that is not already clear from their content. Having multiple figures is not sufficient reason by itself. When needed, name that topic or relationship in a short, specific phrase. If unsure, omit it by returning null.
- figurePlans: an array of figures in reading order. Each figure has only type and instructions. Use a type from the available figure types and put everything the generator needs in instructions.

Do not add other fields, IDs, or placement information.

# Examples

## One figure

Goal: Help a 7th grader solve 2x + 4 = 22.

\`\`\`json
{
  "title": null,
  "figurePlans": [
    {
      "type": "math_expressions",
      "instructions": "For a 7th grader, show 2x + 4 = 22, subtract 4 from both sides to get 2x = 18, then divide both sides by 2 to get x = 9. Make clear that applying the same operation to both sides preserves equality as x is isolated."
    }
  ]
}
\`\`\`

## Related figures

Goal: Help a learner connect a triangle's perpendicular height to its area: base 10 cm, height 6 cm. Show a diagram followed by the calculation.

\`\`\`json
{
  "title": null,
  "figurePlans": [
    {
      "type": "geometry",
      "instructions": "Draw a triangle with base 10 cm and perpendicular height 6 cm; label both and mark the right angle to distinguish height from a sloping side."
    },
    {
      "type": "math_expressions",
      "instructions": "Show A = bh/2 for a triangle with base 10 cm and perpendicular height 6 cm, then substitute to obtain 30 cm². Call out that h is the perpendicular height, not a sloping side."
    }
  ]
}
\`\`\`
`;

export const GOAL_PROMPT = (goal: string): string => `
# Goal
${goal}
`;

// FIGURE PROMPT

export function whiteboardFigureSystemPrompt(
  figure: (typeof whiteboardFigures)[number],
): string {
  const figureId = figure.example.output.id ?? "figure-1";
  return `# Task
Create one "${figure.type}" figure from its instructions.
Return only the figure JSON matching the supplied schema.

# Shared rules
- Use the assigned figure ID exactly, including in annotation target IDs.
- Preserve the instructions' facts, values, units, and teaching purpose.
- Default to a null figure title. Add one only to identify what the figure shows when its content does not already make that clear. Follow any instruction to omit a title; do not repeat the board title or a framing question supplied in the instructions.
- Give elements unique lowercase IDs containing only letters, digits, and hyphens.
- The board already controls placement. Do not output anchor, side, or other fields outside the schema.
- Plain-text titles, labels, notes, and callouts cannot use combining accents such as ⃗. Write v or v → instead.

# Annotations
Implement the brief's teaching moves. Use an empty array when none are requested or useful.
Map planner language to mark types:

- Highlight: "circle", "box", or "underline"
- Call out: "arrow" or "line", with a short message
- Number: "number", with a positive integer as text ("1", "2", …)
- Group: "bracket", with an optional label or null
- Cross out: "strikethrough"

Each annotation has \`type\`, \`targetIds\`, and \`content\`.

- circle, box, underline, strikethrough: \`content\` is null; exactly one target
- number: \`content\` is a positive integer as text; exactly one target
- arrow, line: \`content\` is nonempty message text; exactly one target
- bracket: \`content\` is a label or null; one or more targets

Target only this figure's declared elements and the parts listed below. The renderer places marks and callouts.

# Fields
${formatFigureSchemaFields(figure.schema)}

# Rules
${figure.rules}

# Annotation targets
${figure.annotationTargets.map((target) => `- ${target}`).join("\n")}

# Example
## Input
${
    JSON.stringify(
      {
        figureId,
        boardTitle: null,
        instructions: figure.example.instructions,
      },
      null,
      2,
    )
  }

## Output
${JSON.stringify(figure.example.output, null, 2)}
`;
}

export const INSTRUCTIONS_PROMPT = (instructions: string): string => `
# Instructions
${instructions}
`;








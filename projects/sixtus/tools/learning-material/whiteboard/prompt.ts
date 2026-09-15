import {
  whiteboardFigureCategories,
  whiteboardFigures,
} from "./figures/index.ts";
import { formatFigureSchemaFields } from "./schema-fields.ts";

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
    JSON.stringify({
      figureId,
      boardTitle: null,
      instructions: figure.example.instructions,
    }, null, 2)
  }

## Output
${JSON.stringify(figure.example.output, null, 2)}
`;
}



export const INSTRUCTIONS_PROMPT = (instructions: string): string => `
# Instructions
${instructions}
`;

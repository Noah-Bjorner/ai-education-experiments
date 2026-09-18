import { type FigureDefinition, generatedFigureSchema } from "./schema.ts";
import { formatFigureSchemaFields } from "../schema-fields.ts";

// SINGLE-SHOT SPEC PROMPT

export interface WhiteboardSpecSystemInput {
  availableFigures: readonly FigureDefinition[];
  showTitle?: boolean;
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
  { availableFigures, showTitle = false }: WhiteboardSpecSystemInput,
): string => {
  const typeNames = availableFigures.map((figure) => figure.type).join(", ");
  const boardRules = availableFigures.flatMap((figure) =>
    figure.boardRules ? [figure.boardRules] : []
  ).join("\n");
  return `# Task

Create the complete spec for an educational whiteboard from the goal in the user message. You make every content decision: which of the available figures to include, what each shows, and which annotations direct the learner's attention. A renderer draws the result from your JSON.

These types were selected for this goal: ${typeNames}. Use any of them, once or several times, and leave out any the goal does not need.

# Plan the content

Read the goal to determine what the board should accomplish: depict supplied content, explain an idea, guide the learner through a process, or a combination. Match scope and depth to that purpose, the learner level, and any requested teaching approach. A request to visualize something may be complete with one figure; a request for thorough teaching may need explanation, intermediate steps, and examples.

- Fulfill the goal with only as much content and detail as needed to make it clear and complete. Stop when the goal is met.
- Add another figure only when leaving it out would create a specific gap in understanding or omit something explicitly requested. A different representation of the same content is not sufficient reason by itself.
- Before finalizing, remove anything whose absence would leave the board equally clear and complete. Keep necessary steps readable; do not achieve fewer figures by overcrowding them.
- Order figures in the sequence the learner should read them, top to bottom.${
    boardRules ? `\n${boardRules}` : ""
  }
- Combine related content into one figure when that is clearer, such as several series in one chart or all algebra steps in one math figure.
- Preserve supplied facts, values, names, and units. Derive values when justified. Introduce illustrative values only when the goal needs them, keep them consistent across figures, and make their illustrative nature clear in that figure's title. Do not fabricate data about real populations, events, measurements, or statistics.

# Output

Return one JSON object:

{
  "title": <string or null>,
  "figures": [<figure objects in reading order>]
}

- \`title\` is the board heading drawn above all figures. The user message states whether to include one. When included, use a short phrase naming the shared topic or relationship; otherwise null.
- Each figure has \`type\`, a unique \`id\`, \`title\`, \`annotations\` (\`[]\` when none), and the fields of its type. Every figure and element ID and every annotations array is required.
- Placement is handled separately: figures are stacked in the order you return them. Do not output board-level anchor, side, layout, size, or coordinates. Figure-internal coordinates and attachment fields remain available where the figure definition requires them.
- Figure \`title\`: default null. Add one only to identify what the figure shows when its content does not already make that clear. Never repeat the board title, a label, or a framing question. math_expressions rarely needs one.

# Shared rules

- Use JSON numbers for numeric values: 1200, not "1,200".
- Use concise, concrete labels a learner can read at a glance. Include units when they help. Avoid meta commentary such as "this chart shows".
- Keep terminology, names, and units consistent across figures.
- Plain-text titles, labels, notes, and callouts cannot use combining accents such as ⃗. Write v or v →. Use LaTeX only in fields that accept it.
- Do not add fields that are absent from the figure definitions.
- IDs start with a lowercase letter and contain only lowercase letters, digits, and hyphens. Figure IDs are unique across the board. Element IDs (expressions, series, points, slices, geometry points, objects, labels, markings, plot elements) are unique within their figure. Give every element an \`id\`.
- Annotations target only elements of their own figure, using the target forms listed under its figure type.

# Annotations

Annotations direct attention to what the learner should notice. Add one when the drawing does not make the point by itself; skip it when the drawing already does, such as algebra steps in order or a labelled right angle. Every annotation should earn its place.

Each annotation is \`{ "type", "targetIds", "text" }\`. Name the intent; the renderer chooses the mark and places it. Do not output coordinates or styling.

- "highlight": draw attention to one target. \`text\` is null.
- "callout": attach a short, factual message to one target. \`text\` is the message.
- "group": bracket several targets that belong together. \`text\` is an optional label, or null.
- "number": number several targets in the order listed, starting at 1. \`text\` is null.
- "strikeout": cross out one target, only when the goal asks for something to be crossed out. \`text\` is null.

A target is an element ID, \`<elementId>.<part>\` for elements with several parts, or a figure-level part such as \`title\`. Each figure type lists its targets.

# Figure types

${
    availableFigures.map((figure) =>
      [
        `## ${figure.type}`,
        `${figure.summary} Use when ${figure.useWhen}.`,
        "### Fields",
        formatFigureSchemaFields(generatedFigureSchema(figure)),
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
- Every annotation follows its type's target-count and text rules.
- Values and labels agree with the goal's facts; illustrative values are identified.
- Nothing remains whose removal would leave the board equally clear and complete.

# Example board

This example uses an available type and demonstrates the content-only output shape. Choose content and the number of figures for the actual goal.

\`\`\`json
${
    JSON.stringify(
      {
        title: showTitle ? "Example topic" : null,
        figures: [{
          ...availableFigures[0].example.output,
          annotations: availableFigures[0].example.output.annotations ?? [],
        }],
      },
      null,
      2,
    )
  }
\`\`\``;
};








// _TEST: exploration prompts. Not wired into provider.ts.

function _TEST_figureExample(figure: FigureDefinition) {
  return {
    ...figure.example.output,
    annotations: figure.example.output.annotations ?? [],
  };
}

function _TEST_figureType(figure: FigureDefinition): string {
  const fields = formatFigureSchemaFields(generatedFigureSchema(figure))
    .split("\n")
    .map((line) => line.replace(/ — .*$/, ""))
    .join("\n");
  return [
    `## ${figure.type}`,
    `${figure.summary} Use when ${figure.useWhen}.`,
    figure.boardRules && `### Board order\n\n${figure.boardRules}`,
    `### Fields\n\n${fields}`,
    `### Rules\n\n${figure.rules}`,
    `### Annotation targets\n\n${
      figure.annotationTargets.map((target) => `- ${target}`).join("\n")
    }`,
    `### Example figure\n\n\`\`\`json\n${
      JSON.stringify(_TEST_figureExample(figure), null, 2)
    }\n\`\`\``,
  ].filter(Boolean).join("\n\n");
}

export const _TEST_WHITEBOARD_SPEC_USER_PROMPT = (
  { goal, showTitle, availableFigures }: WhiteboardSpecUserInput & {
    availableFigures: readonly FigureDefinition[];
  },
): string =>
  `# Available figure types
${availableFigures.map((figure) => `- ${figure.type}`).join("\n")}

Use any of these figure types, once or several times. Leave out any the goal does not need.

# Goal
${goal}

# Board title
${
    showTitle
      ? "Include a board title: a short phrase naming the topic or relationship the figures share."
      : "Do not include a board title. Set `title` to null."
  }
`;

export const _TEST_WHITEBOARD_SPEC_SYSTEM_PROMPT = (
  { availableFigures }: WhiteboardSpecSystemInput,
): string =>
  `# Task

Create one educational whiteboard from the goal in the user message. A renderer draws your JSON.

A board is a title plus figures in reading order. Each figure is one drawing of an available figure type. Elements are the named pieces inside a figure. Annotations mark targets in that same figure.

You choose which available figure types to use, what each figure shows, and which annotations to add.

# Plan

Read the goal to determine what the board should accomplish: depict supplied content, explain an idea, guide the learner through a process, or a combination. Match scope and depth to that purpose, the learner level, and any requested teaching approach. A request to visualize something may be complete with one figure; a request for thorough teaching may need explanation, intermediate steps, and examples.

- Fulfill the goal with only as much content and detail as needed to make it clear and complete. Stop when the goal is met.
- Add another figure only when leaving it out would create a specific gap in understanding or omit something explicitly requested. A different representation of the same content is not enough by itself.
- Remove anything whose absence would leave the board equally clear and complete. Keep necessary steps readable; do not overcrowd a figure to fake a smaller board.
- Order figures in the sequence the learner should read them.
- Combine related content into one figure when that is clearer, such as several series in one chart or all algebra steps in one math figure.
- Preserve supplied facts, values, names, and units. Derive values when justified. Introduce illustrative values only when the goal needs them, keep them consistent across figures, and mark them as illustrative in that figure's title. Do not fabricate data about real populations, events, measurements, or statistics.

# Output

Return one JSON object:

{
  "title": <string or null>,
  "figures": [<figure objects in reading order>]
}

- \`title\` is the heading drawn above all figures. Follow the user message: a short phrase naming the shared topic or relationship, or null.
- Each figure has \`type\`, a unique \`id\`, \`title\`, \`annotations\` (\`[]\` when none), and the fields of its figure type. Every figure and element ID and every annotations array is required.
- Figures are stacked in the order you return them. Do not output \`anchor\`, \`side\`, layout, size, or board-level coordinates. Figure-internal coordinates and attachments remain where that figure type requires them.
- Figure \`title\` defaults to null. Add one only when the figure's content does not already identify what it shows. Never repeat the board title, a label, or a framing question.

# Shared rules

- Use JSON numbers for numeric values: 1200, not "1,200".
- Use concise, concrete labels a learner can read at a glance. Include units when they help. Avoid meta commentary such as "this chart shows".
- Keep terminology, names, and units consistent across figures.
- Plain-text titles, labels, notes, and callouts cannot use combining accents.
- Do not add fields that are absent from a figure type.
- IDs start with a lowercase letter and contain only lowercase letters, digits, and hyphens. Figure IDs are unique across the board. Element IDs are unique within their figure. Give every element an \`id\`.
- Annotations target only elements of their own figure, using the target forms listed under its figure type.

# Annotations

Add an annotation when the figure does not make the full point by itself. Skip it when the figure already does, such as algebra steps in order or a labelled right angle.

Each annotation is \`{ "type", "targetIds", "text" }\`. Name the intent; the renderer chooses the mark and places it.

- "highlight": draw attention to one target. \`text\` is null.
- "callout": attach a short, factual message to one target. \`text\` is the message.
- "group": bracket several targets that belong together. \`text\` is an optional label, or null.
- "number": number several targets in the order listed, starting at 1. \`text\` is null.
- "strikeout": cross out one target, only when the goal asks for it. \`text\` is null.

A target is an element ID, \`<elementId>.<part>\` for elements with several parts, or a figure-level part such as \`title\`. Each figure type lists its targets.


# Figure types

Use only the figure types listed in the user message. Each section is one figure type: when to use it, its fields, its rules, and its annotation targets.

${availableFigures.map(_TEST_figureType).join("\n\n")}`;


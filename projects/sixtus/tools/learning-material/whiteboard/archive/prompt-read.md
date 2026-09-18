# Task

Create the complete spec for an educational whiteboard from the goal in the user message. You makeevery content decision: which of the available figures to include, what each shows, and which annotations direct the learner's attention. A renderer draws the result from your JSON.

These types were selected for this goal: math_expressions. Use any of them, once or several times,and leave out any the goal does not need.

# Plan the content

Read the goal to determine what the board should accomplish: depict supplied content, explain an idea, guide the learner through a process, or a combination. Match scope and depth to that purpose, the learner level, and any requested teaching approach. A request to visualize something may be complete with one figure; a request for thorough teaching may need explanation, intermediate steps, and examples.

- Fulfill the goal with only as much content and detail as needed to make it clear and complete. Stop when the goal is met.
- Add another figure only when leaving it out would create a specific gap in understanding or omitsomething explicitly requested. A different representation of the same content is not sufficient reason by itself.
- Before finalizing, remove anything whose absence would leave the board equally clear and complete. Keep necessary steps readable; do not achieve fewer figures by overcrowding them.
- Order figures in the sequence the learner should read them, top to bottom.
- Combine related content into one figure when that is clearer, such as several series in one chart or all algebra steps in one math figure.
- Preserve supplied facts, values, names, and units. Derive values when justified. Introduce illustrative values only when the goal needs them, keep them consistent across figures, and make their illustrative nature clear in that figure's title. Do not fabricate data about real populations, events, measurements, or statistics.

# Output

Return one JSON object:

{
  "title": <string or null>,
  "figures": [<figure objects in reading order>]
}

- `title` is the board heading drawn above all figures. The user message states whether to includeone. When included, use a short phrase naming the shared topic or relationship; otherwise null.
- Each figure has `type`, a unique `id`, `title`, `annotations` (`[]` when none), and the fields of its type. Every figure and element ID and every annotations array is required.
- Placement is handled separately: figures are stacked in the order you return them. Do not outputboard-level anchor, side, layout, size, or coordinates. Figure-internal coordinates and attachmentfields remain available where the figure definition requires them.
- Figure `title`: default null. Add one only to identify what the figure shows when its content does not already make that clear. Never repeat the board title, a label, or a framing question. math_expressions rarely needs one.

# Shared rules

- Use JSON numbers for numeric values: 1200, not "1,200".
- Use concise, concrete labels a learner can read at a glance. Include units when they help. Avoidmeta commentary such as "this chart shows".
- Keep terminology, names, and units consistent across figures.
- Plain-text titles, labels, notes, and callouts cannot use combining accents such as ⃗. Write v orv →. Use LaTeX only in fields that accept it.
- Do not add fields that are absent from the figure definitions.
- IDs start with a lowercase letter and contain only lowercase letters, digits, and hyphens. Figure IDs are unique across the board. Element IDs (expressions, series, points, slices, geometry points, objects, labels, markings, plot elements) are unique within their figure. Give every element an `id`.
- Build annotation targets as `<figureId>.<elementId>.<part>`, or `<figureId>.<part>` for figure-level parts, using the targets listed under each figure type. Reference only IDs declared in this spec. Annotations belong to their own figure and never target another figure.

# Annotations

Annotations direct attention to what the learner should notice. Add one when the drawing does not make the point by itself; skip it when the drawing already does, such as algebra steps in order or a labelled right angle. Every annotation should earn its place.

Five moves are available, each mapped to a mark type:

- Highlight an element so the learner notices it: "circle", "box", or "underline".
- Call out an element with a short message: "arrow" or "line".
- Number the order of steps or elements: "number".
- Group elements that belong together: "bracket", with an optional label.
- Cross out something wrong or eliminated: "strikethrough".

Each annotation has exactly three fields: `type`, `targetIds`, and `content`.

- circle, box, underline, strikethrough: `content` is null; exactly one target.
- number: `content` is a positive integer as text ("1", "2", …); exactly one target. It marks order, not animation.
- arrow, line: `content` is a nonempty message; exactly one target. They connect the message to the target, never two targets.
- bracket: `content` is a label or null; one or more targets.

Use underline and strikethrough only on text targets, and strikethrough only when the goal explicitly calls for crossing something out. Keep messages concise and factual. Target only this figure's declared elements and the parts listed under its type. The renderer places marks and callouts; do not output coordinates or styling for them.

# Figure types

## math_expressions

Mathematical expressions, formulas, or equations displayed in rows. Use when the learner needs to read mathematical notation or follow a calculation or algebra sequence, such as substituting valuesinto a formula, simplifying an expression, or solving an equation.

### Fields

- `type`: "math_expressions"
- `id`: string — Stable lowercase ID using letters, digits, and hyphens. Figure IDs are unique across the board; series, point, and slice IDs are unique within their figure. Preserve IDs when editing content.
- `annotations`: array
- `title`: string | null — Short learner-facing title identifying what this figure shows only whenits content does not already make that clear. Default to null; do not repeat the board title, labels, or a framing question supplied in the instructions.
- `expressions`: array (1–8)
  - `id`: string
  - `latex`: string — One LaTeX math expression (MathJax base and AMS commands). Prefer no dollar signs or display delimiters. Escape backslashes in JSON.

### Rules

- Each expression is a separate centered row, in supplied order.
- Supports MathJax base and AMS math: Greek letters, operators and relations, fractions, roots, scripts, sums/products/integrals with limits, \sin and other functions, \text{...}, \mathbb{R}, \left...\right delimiters, matrices, cases, and aligned equations.
- Use braces around multi-character script arguments. Prefer math source without dollar signs or display wrappers (one surrounding pair is accepted).
- The board uses Shantell Sans Math Medium everywhere. Equations use paths extracted from that same font; structural bars are drawn by the layout engine. Ordinary bold/italic styles use Medium. Calligraphic/Fraktur alphabets and unbundled symbols are unavailable; do not replace them with a different mathematical meaning. Double-struck letters supported: C, N, P, Q, R, Z.
- This is math-mode LaTeX, not a full document compiler. No document preambles, package loading, user-defined macros, HTML, or external content. Unsupported commands or missing glyphs produce explicit errors.
- No styling or coordinates are supplied by the agent. Expressions retain the shared display size;keep rows short enough to fit. More rows grow the figure vertically rather than shrinking the text.
- JSON must escape each LaTeX backslash: "\\frac{1}{2}".

### Annotation targets

- <figureId>.title — only when title is not null
- <figureId>.<expressionId>.expression — the whole row; text emphasis and callouts allowed. Individual terms are not targets yet.

### Example figure

Goal: Show the steps for solving x/2 + 3 = 7.

```json

{
  "type": "math_expressions",
  "id": "solve",
  "title": "Solve for x",
  "annotations": [],
  "expressions": [
    {
      "id": "start",
      "latex": "\\frac{x}{2} + 3 = 7"
    },
    {
      "id": "subtract",
      "latex": "\\frac{x}{2} = 4"
    },
    {
      "id": "answer",
      "latex": "x = 8"
    }
  ]
}

```

# Final checks

Before returning the JSON, check that:

- Every figure uses an available type and follows that type's fields and rules.
- `title` follows the user message's board-title instruction; no annotation targets `<id>.title` on a figure whose title is null.
- Figure IDs are unique across the board, element IDs are unique within their figure, and every annotation target resolves to a declared element and a supported part in the same figure.
- Every annotation follows its type's target-count and content rules.
- Values and labels agree with the goal's facts; illustrative values are identified.
- Nothing remains whose removal would leave the board equally clear and complete.

# Example board

This example uses an available type and demonstrates the content-only output shape. Choose contentand the number of figures for the actual goal.

```json
{
  "title": null,
  "figures": [
    {
      "type": "math_expressions",
      "id": "solve",
      "title": "Solve for x",
      "annotations": [],
      "expressions": [
        {
          "id": "start",
          "latex": "\\frac{x}{2} + 3 = 7"
        },
        {
          "id": "subtract",
          "latex": "\\frac{x}{2} = 4"
        },
        {
          "id": "answer",
          "latex": "x = 8"
        }
      ]
    }
  ]
}
```





----------------------------------------------

 # Task

Create one complete spec for an educational whiteboard from the goal in the user message. You choose which of the listed types to use, what each figure shows, and which annotations to add. A renderer draws your JSON. Do not choose colors, fonts, board layout, or coordinates except where a type's own fields require them.

# Plan

Read the goal to determine what the board should accomplish: depict supplied content, explain an idea, guide the learner through a process, or a combination. Match scope and depth to that purpose, the learner level, and any requested teaching approach. A request to visualize something may be complete with one figure; a request for thorough teaching may need explanation, intermediate steps, and examples.

- Fulfill the goal with only as much content and detail as needed to make it clear and complete. Stop when the goal is met.
- Add another figure only when leaving it out would create a specific gap in understanding or omit something explicitly requested. A different representation of the same content is not enough by itself.
- Remove anything whose absence would leave the board equally clear and complete. Keep necessary steps readable; do not overcrowd a figure to fake a smaller board.
- Order figures in the sequence the learner should read them, top to bottom.
- Combine related content into one figure when that is clearer, such as several series in one chart or all algebra steps in one math figure.
- Preserve supplied facts, values, names, and units. Derive values when justified. Introduce illustrative values only when the goal needs them, keep them consistent across figures, and mark them as illustrative in that figure's title. Do not fabricate data about real populations, events, measurements, or statistics.

# Output

Return one JSON object:

{
  "title": <string or null>,
  "figures": [<figure objects in reading order>]
}

- `title` is the heading drawn above all figures. Follow the user message: a short phrase naming the shared topic or relationship, or null.
- Each figure has `type`, a unique `id`, `title`, `annotations` (`[]` when none), and the fields of its type. Every figure and element ID and every annotations array is required.
- Figures are stacked in the order you return them. Do not output `anchor`, `side`, layout, size, or board-level coordinates. Figure-internal coordinates and attachments remain where that type requires them.
- Figure `title` defaults to null. Add one only when the figure's content does not already identify what it shows. Never repeat the board title, a label, or a framing question.

# Shared rules

- Use JSON numbers for numeric values: 1200, not "1,200".
- Use concise, concrete labels a learner can read at a glance. Include units when they help. Avoid meta commentary such as "this chart shows".
- Keep terminology, names, and units consistent across figures.
- Plain-text titles, labels, notes, and callouts cannot use combining accents such as ⃗. Write v or v →. Use LaTeX only in fields that accept it.
- Do not add fields that are absent from the type cards.
- IDs start with a lowercase letter and contain only lowercase letters, digits, and hyphens. Figure IDs are unique across the board. Element IDs are unique within their figure. Give every element an `id`.
- Annotation targets use the patterns on each type card. Reference only IDs declared in this spec. Annotations belong to their own figure and never target another figure.

# Annotations

Add an annotation when the drawing does not make the point by itself. Skip it when the drawing already does, such as algebra steps in order or a labelled right angle.

Five moves, each a `type` on the annotation object:

- Highlight so the learner notices it: "circle", "box", or "underline".
- Call out with a short message: "arrow" or "line".
- Number a sequence: "number".
- Group related elements: "bracket".
- Cross out something wrong or eliminated: "strikethrough".

Each annotation has exactly `type`, `targetIds`, and `content`.

- circle, box, underline, strikethrough: `content` is null; exactly one target.
- number: `content` is a positive integer as text ("1", "2", …); exactly one target. It marks order, not animation.
- arrow, line: `content` is a nonempty message; exactly one target. They attach the message to that target, never two targets.
- bracket: `content` is a label or null; one or more targets.

Use underline and strikethrough only on text targets. Use strikethrough only when the goal asks to cross something out. Keep messages short and factual. The renderer places marks; do not output coordinates or styling for them.

# Stop

Before returning, remove anything whose absence would leave the board equally clear and complete.

# Type cards

Grammar for the types listed in the user message. Use only those types.

## math_expressions

Mathematical expressions, formulas, or equations displayed in rows. Use when the learner needs to read mathematical notation or follow a calculation or algebra sequence, such as substituting values into a formula, simplifying an expression, or solving an equation.

### Fields

- `type`: "math_expressions"
- `id`: string
- `title`: string | null
- `annotations`: array
- `expressions`: array (1–8)
  - `id`: string
  - `latex`: string

### Fill

- Each expression is a separate centered row, in supplied order.
- Supports MathJax base and AMS math: Greek letters, operators and relations, fractions, roots, scripts, sums/products/integrals with limits, \sin and other functions, \text{...}, \mathbb{R}, \left...\right delimiters, matrices, cases, and aligned equations.
- Use braces around multi-character script arguments. Prefer math source without dollar signs or display wrappers (one surrounding pair is accepted).
- The board uses Shantell Sans Math Medium everywhere. Equations use paths extracted from that same font; structural bars are drawn by the layout engine. Ordinary bold/italic styles use Medium. Calligraphic/Fraktur alphabets and unbundled symbols are unavailable; do not replace them with a different mathematical meaning. Double-struck letters supported: C, N, P, Q, R, Z.
- This is math-mode LaTeX, not a full document compiler. No document preambles, package loading, user-defined macros, HTML, or external content. Unsupported commands or missing glyphs produce explicit errors.
- No styling or coordinates are supplied by the agent. Expressions retain the shared display size; keep rows short enough to fit. More rows grow the figure vertically rather than shrinking the text.
- JSON must escape each LaTeX backslash: "\\frac{1}{2}".

### Targets

- <figureId>.title — only when title is not null
- <figureId>.<expressionId>.expression — the whole row; text emphasis and callouts allowed. Individual terms are not targets yet.

### Example

```json
{
  "type": "math_expressions",
  "id": "solve",
  "title": "Solve for x",
  "annotations": [],
  "expressions": [
    {
      "id": "start",
      "latex": "\\frac{x}{2} + 3 = 7"
    },
    {
      "id": "subtract",
      "latex": "\\frac{x}{2} = 4"
    },
    {
      "id": "answer",
      "latex": "x = 8"
    }
  ]
}
```


---------------

 # Available types
- math_expressions

Use any of these types, once or several times. Leave out any the goal does not need.

# Goal
draw the math expression 3(x+2)=3x+9

# Board title
Do not include a board title. Set `title` to null.
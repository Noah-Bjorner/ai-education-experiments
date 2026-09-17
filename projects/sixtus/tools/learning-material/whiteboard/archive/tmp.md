# Task

Create the complete spec for an educational whiteboard from the goal in the user message. You make every content decision: which of the available figures to include, what each shows, and which annotations direct the learner's attention. A renderer draws the result from your JSON.

These types were selected for this goal: math_expressions. Use any of them, once or several times, and leave out any the goal does not need.

# Plan the content

Read the goal to determine what the board should accomplish: depict supplied content, explain an idea, guide the learner through a process, or a combination. Match scope and depth to that purpose, the learner level, and any requested teaching approach. A request to visualize something may be complete with one figure; a request for thorough teaching may need explanation, intermediate steps, and examples.

- Fulfill the goal with only as much content and detail as needed to make it clear and complete. Stop when the goal is met.
- Add another figure only when leaving it out would create a specific gap in understanding or omit something explicitly requested. A different representation of the same content is not sufficient reason by itself.
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

- `title` is the board heading drawn above all figures. The user message states whether to include one. When included, use a short phrase naming the shared topic or relationship; otherwise null.
- Each figure has `type`, a unique `id`, `title`, `annotations` (`[]` when none), and the fields of its type. Include `id` and `annotations` on every figure even where a field list marks them optional.
- Placement is handled separately: figures are stacked in the order you return them. Do not output anchor, side, layout, size, or board coordinates.
- Figure `title`: default null. Add one only to identify what the figure shows when its content does not already make that clear. Never repeat the board title, a label, or a framing question. math_expressions rarely needs one.

# Shared rules

- Use JSON numbers for numeric values: 1200, not "1,200".
- Use concise, concrete labels a learner can read at a glance. Include units when they help. Avoid meta commentary such as "this chart shows".
- Keep terminology, names, and units consistent across figures.
- Plain-text titles, labels, notes, and callouts cannot use combining accents such as ⃗. Write v or v →. Use LaTeX only in fields that accept it.
- Do not add fields that are absent from the figure definitions.
- IDs start with a lowercase letter and contain only lowercase letters, digits, and hyphens. Figure IDs are unique across the board. Element IDs (expressions, series, points, slices, geometry points, objects, labels, markings, plot elements, freeform elements) are unique within their figure. Give every element an `id`.
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

Mathematical expressions, formulas, or equations displayed in rows. Use when the learner needs to read mathematical notation or follow a calculation or algebra sequence, such as substituting values into a formula, simplifying an expression, or solving an equation.

### Fields

- `type`: "math_expressions"
- `id?`: string — Stable lowercase ID using letters, digits, and hyphens. Figure IDs are unique across the board; series, point, and slice IDs are unique within their figure. Preserve IDs when editing content.
- `title`: string | null — Short learner-facing title identifying what this figure shows only when its content does not already make that clear. Default to null; do not repeat the board title, labels, or a framing question supplied in the instructions.
- `annotations?`: array — Teaching annotations for this figure. Use an empty array when annotations do not help the goal. Every target must reference a defined element and supported visual part in this figure.
- `expressions`: array (1–8)
  - `id`: string
  - `latex`: string — One LaTeX math expression (MathJax base and AMS commands). Prefer no dollar signs or display delimiters. Escape backslashes in JSON.

### Rules

- Each expression is a separate centered row, in supplied order.
- Supports MathJax base and AMS math: Greek letters, operators and relations, fractions, roots, scripts, sums/products/integrals with limits, \sin and other functions, \text{...}, \mathbb{R}, \left...\right delimiters, matrices, cases, and aligned equations.
- Use braces around multi-character script arguments. Prefer math source without dollar signs or display wrappers (one surrounding pair is accepted).
- The board uses Shantell Sans Math Medium everywhere. Equations use paths extracted from that same font; structural bars are drawn by the layout engine. Ordinary bold/italic styles use Medium. Calligraphic/Fraktur alphabets and unbundled symbols are unavailable; do not replace them with a different mathematical meaning. Double-struck letters supported: C, N, P, Q, R, Z.
- This is math-mode LaTeX, not a full document compiler. No document preambles, package loading, user-defined macros, HTML, or external content. Unsupported commands or missing glyphs produce explicit errors.
- No styling or coordinates are supplied by the agent. Expressions retain the shared display size; keep rows short enough to fit. More rows grow the figure vertically rather than shrinking the text.
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

# Example

This example demonstrates the output shape. Its figure types may differ from the ones available for the actual goal; choose figures and content for the actual goal.

## User message

```text
# Goal
Help a 6th grader connect a triangle's perpendicular height to its area: base 10 cm, height 6 cm. Show the diagram, then the calculation, and make clear that the height is perpendicular to the base rather than a sloping side.

# Board title
Include a board title: a short phrase naming the topic or relationship the figures share.
```

## Output

```json
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
        { "id": "formula", "latex": "A = \\frac{1}{2} b h" },
        { "id": "substitute", "latex": "A = \\frac{1}{2} (10)(6)" },
        { "id": "result", "latex": "A = 30\\ \\text{cm}^2" }
      ]
    }
  ]
}
```
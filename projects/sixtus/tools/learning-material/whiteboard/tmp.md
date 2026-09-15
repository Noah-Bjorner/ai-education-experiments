# Task
Create one pie_chart figure from its construction brief.
Return only the figure JSON matching the supplied schema.

# Shared rules
- Use the assigned figure ID exactly, including in annotation target IDs.
- Preserve the brief's facts, values, units, and teaching purpose.
- Use a null figure title when unnecessary or when it would repeat the board title.
- Give elements unique lowercase IDs containing only letters, digits, and hyphens.
- The board already controls placement. Do not output anchor, side, or other fields outside the schema.

# Annotations
Implement the brief's teaching moves. Use an empty array when none are requested or useful.
Map planner language to mark types:

- Highlight: "circle", "box", or "underline"
- Call out: "arrow" or "line", with a short message
- Number: "number", with a positive integer as text ("1", "2", …)
- Group: "bracket", with an optional label or null
- Cross out: "strikethrough"

Each annotation has `type`, `targetIds`, and `content`.

- circle, box, underline, strikethrough: `content` is null; exactly one target
- number: `content` is a positive integer as text; exactly one target
- arrow, line: `content` is nonempty message text; exactly one target
- bracket: `content` is a label or null; one or more targets

Target only this figure's declared elements and the parts listed below. The renderer places marks and callouts.

# Fields
- `type`: "pie_chart"
- `id?`: string — Stable lowercase ID using letters, digits, and hyphens. Figure IDs are unique across the board; series, point, and slice IDs are unique within their figure. Preserve IDs when editing content.
- `title`: string | null — Short learner-facing title shown above this figure. Null when the figure speaks for itself or the board title already names it.
- `annotations?`: array — Teaching annotations for this figure. Use an empty array when annotations do not help the goal. Every target must reference a defined element and supported visual part in this figure.
- `chartStyle?`: "pie" | "donut"
- `slices`: array (1+)
  - `id?`: string
  - `label`: string
  - `value`: number

# Rules
- All slices must refer to the same whole and use the same unit.
- Categories must not overlap.
- Use the supplied amounts directly; counts do not need conversion to percentages.
- If values describe a complete percentage breakdown, they should total approximately 100, allowing for rounding.
- Omit zero-value categories because slice values must be positive.
- Do not silently invent an "Other" slice to complete missing data.
- Only target an interior percentage when the slice is at least 8% of the total; smaller slices have no interior percentage.

# Annotation targets
- <figureId>.title — only when title is not null
- <figureId>.<sliceId>.mark — the wedge
- <figureId>.<sliceId>.legend-label
- <figureId>.<sliceId>.percentage — only when the slice is at least 8% of the total

# Example
## Input
{
  "figureId": "books",
  "boardTitle": null,
  "instructions": "Help a learner understand how each genre contributes to a whole collection of 20 books: 12 fiction, 6 nonfiction, and 2 poetry. Circle Fiction's percentage and use an arrow callout to explain that Fiction is more than half the collection."
}

## Output
{
  "type": "pie_chart",
  "id": "books",
  "title": "Book collection",
  "annotations": [
    {
      "type": "circle",
      "targetIds": [
        "books.fiction.percentage"
      ],
      "content": null
    },
    {
      "type": "arrow",
      "targetIds": [
        "books.fiction.mark"
      ],
      "content": "More than half the collection"
    }
  ],
  "slices": [
    {
      "id": "fiction",
      "label": "Fiction",
      "value": 12
    },
    {
      "id": "nonfiction",
      "label": "Nonfiction",
      "value": 6
    },
    {
      "id": "poetry",
      "label": "Poetry",
      "value": 2
    }
  ]
}
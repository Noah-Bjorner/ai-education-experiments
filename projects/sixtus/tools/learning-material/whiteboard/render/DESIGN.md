# Whiteboard visualization design

First draft. Read this before implementing a new visualization type in this
directory. The aim is a clear educational diagram drawn with a light pen: warm,
simple, and readable, with accurate geometry beneath the handwritten treatment.

This guide covers the whiteboard renderer. The older `../../static/` renderer
has a separate design guide and theme; do not copy its opaque background or
system-font defaults into new whiteboard types.

## Sources of truth

- `theme.ts`: shared color values and fill opacity constants. Import these
  instead of adding hex literals to renderers. Update this guide when changing a
  color's role or palette order.
- `font.ts`: Shantell Sans Math, embedded font definitions, and text measurement.
- `handwritten.ts`: reusable pen outlines and hatch fills.
- `hatching.ts`: stroke intersections, sector geometry, and fill variation.
- `bounds.ts`: shared painted bounds, curve extrema, and export sizing.
- `graphs.ts`: XY and circular chart renderers, not a universal layout engine.
- `index.ts`: shared staged board renderer with base, emphasis, and callout snapshots.
- `layout.ts`: single, split, and stack child allocations.
- `targets.ts`: semantic SVG IDs and measured child-local annotation targets.
- `annotations.ts`: emphasis rendering and a queue for message callouts.
- `callouts.ts`: measured messages, candidate placement, brackets, and connectors.
- `placement.ts`: geometric collision checks and connector routing.

Keep the code small and direct. Shared values belong in code; explanations,
visual priorities, and rules belong here. Do not create a large token framework
or duplicate font data in individual renderers. Extract shared spacing and size
constants when they acquire multiple real consumers; keep type-specific geometry
with its renderer.

## Background and transparency

- Export a transparent canvas. Do not add a white, cream, or other full-canvas
  rectangle, or a CSS background inside the SVG.
- Unfilled shapes remain transparent. Filled shapes have a 5% accent-color wash
  underneath their hatch strokes; this is local to the shape, not the canvas.
  Explicitly use `fill="none"` on outlines; SVG's default fill is black.
- Do not use white or cream strokes around text or markers to hide underlying
  geometry. Move labels, reduce the hatch density, or leave a real gap in the
  geometry when necessary.
- The host page owns the surface behind the SVG. A demo can show a light surface
  around an SVG without baking that surface into the exported asset.
- The current palette is intended for light surfaces. Transparency does not make
  colors adapt to dark mode. A dark theme needs an explicit renderer palette;
  frontend CSS cannot recolor the internals of an SVG displayed via `<img>`.

## Typography

Use **Shantell Sans Math Medium, weight 500**, for titles, axes, numbers, legends,
annotations, and text inside diagram nodes.

- Apply `GRAPH_FONT_STYLE` to the graph's enclosing group. Do not invent a
  separate font stack for each type or apply the pen jitter to letter shapes.
- Include `GRAPH_FONT_DEFS` exactly once per standalone SVG or composed board.
  Individual graph groups do not each embed the font.
- Keep labels as SVG `<text>`. Use the bundled WOFF2 font, with its license
  metadata, and no runtime external font URLs.
- Do not synthesize bold or italic. Establish hierarchy with size, position,
  spacing, and color. The shared style also disables optional kerning and
  ligatures to match the simple character-advance measurements.
- Use `measureGraphText()` and `fitGraphText()` before positioning labels.
  Preserve the complete text in `<title>` when truncating it visually.
- The bundled Shantell Sans Math Medium font preserves the original Swedish
  letters and adds Greek and mathematical symbols. Tight exports reject visible
  glyphs absent from the font; a system fallback cannot be measured reliably.
  Font metrics and math outlines must be regenerated together when extending it.

Starting sizes in SVG viewBox units, based on the current 800 × 520 chart:

| Role                           |  Size | Color              | Placement                     |
| ------------------------------ | ----: | ------------------ | ----------------------------- |
| Chart title                    |    25 | `COLORS.ink`       | Centered at the top           |
| Axis labels / prominent values |    16 | `COLORS.ink`       | Close to what they describe   |
| Node labels / body labels      | 14–16 | `COLORS.ink`       | Inside or beside their shape  |
| Legend labels                  | 13–15 | `COLORS.ink`       | Aligned with their indicators |
| Tick labels                    |    13 | `COLORS.textMuted` | Outside the plot area         |
| Supporting values              |    12 | `COLORS.textMuted` | Secondary line below a label  |

These are starting values, not instructions to force every type into the same
canvas. Avoid going below 12 units. Check the SVG at its intended display size:
scaling an 800-unit chart to 400 CSS pixels halves its visible text sizes. Wrap
or allocate more space before shrinking important text. Never truncate an axis
value into something ambiguous or drop a meaningful unit.

## Color

Use semantic roles for chart furniture and the ordered accent palette for data.

| Constant           | Value     | Purpose                                  |
| ------------------ | --------- | ---------------------------------------- |
| `COLORS.ink`       | `#111111` | Main text, axes, outlines, connectors    |
| `COLORS.textMuted` | `#909090` | Ticks, supporting values, secondary text |
| `COLORS.grid`      | `#dadad9` | Subtle reference lines                   |

`SERIES_COLORS`, in order:

| Index | Color     | Name   |
| ----: | --------- | ------ |
|     0 | `#3c82f6` | Blue   |
|     1 | `#f59e0c` | Orange |
|     2 | `#ef4444` | Red    |
|     3 | `#34c759` | Green  |
|     4 | `#ffd608` | Yellow |
|     5 | `#8e8e93` | Gray   |

- A single data series uses the first accent. Multiple series and pie slices use
  the palette in their input order; their marks and legend indicators match.
- The accents are categorical, not a gradient. Green does not automatically mean
  correct, and red does not automatically mean an error.
- Keep colors stable across related views. If categories can reorder, use a
  stable category-to-color mapping; the current graph prototype uses array
  order.
- Do not rely on color alone: include labels, legends, and where useful distinct
  marker shapes or line patterns. Avoid repeating indistinguishable colors when
  the number of categories exceeds the palette. The prototype currently cycles
  the palette; richer category handling is future work.
- Keep reference lines visually quieter than data. Do not use grid gray for
  essential labels or as the only indication of an important boundary.
- Add a shared named role when a new meaning needs a color. Do not scatter new
  hex values across rendering functions or return styling decisions from the AI.
- Resolve TypeScript constants to literal SVG attributes during generation. An
  exported image must not depend on CSS variables defined only in the host page.

Example:

```ts
import { COLORS, SERIES_COLORS } from "./theme.ts";

const outline = COLORS.ink;
const seriesColor = SERIES_COLORS[seriesIndex % SERIES_COLORS.length];
```

## Spacing and sizing

Design each visualization in its own local coordinate system, starting at
`(0, 0)`. A parent compositor places that group using a translation. Do not
hardcode a child's position on the board into its drawing logic.

- Prefer a 4-unit spacing rhythm: 4, 8, 12, 16, 24, 32, 48. Calculated
  positions, font baselines, and data coordinates need not be multiples of four.
- Export with **zero outer padding**. The client supplies padding around the
  finished SVG. Use a 24–32-unit gap between children when composing a board;
  this is internal spacing, not padding around the export.
- Give distinct sections 24–32 units of separation. Use 8–12 units between a
  small indicator and its label, and 4–8 between tightly related text lines.
- Derive spacing from measured text and content bounds when possible. Do not use
  repeated trial offsets as a substitute for a layout calculation.
- Reserve title and legend space before allocating the main drawing area.
  Increase the canvas or reject an allocation that cannot fit; avoid silent
  clipping and overlapping labels.
- Derive the final width, height, and `viewBox` from the rendered content
  bounds, including titles, labels, legends, and complete pen strokes. Scale the
  complete SVG consistently; avoid nonuniform stretching.

Current graph defaults are 800 × 520, with a minimum allocation of 600 × 400.
These are internal layout constraints, not the exported size. `renderGraphSvg()`
now wraps the measured content with zero outer padding. The XY plot starts 92
units from the left and 90 from the top, with 42 on the right and reserved
bottom space for axes and legend. Those larger insets serve chart labels; they
are not general-purpose padding tokens.

Board layouts:

- `single`: one child with its content bounds becoming the board bounds.
- `split`: two children side by side with a consistent gap.
- `stack`: two or more children vertically with consistent gaps.

Each renderer must receive its allocated size. Merely scaling a side-by-side SVG
down will not turn it into a mobile stack; a different arrangement requires a
different layout render. Final board placement increases inter-child spacing
when completed annotations extend beyond their original allocations. It moves
complete child groups without scaling or regenerating their base geometry.

### Tight export bounds

Every standalone SVG should tightly enclose all rendered content, regardless of
visualization type. Do not include unused outer canvas space or draw a
surrounding frame. The SVG remains transparent; presentation padding belongs to
the client.

Separate two steps:

1. **Layout:** arrange titles, shapes, labels, and legends into a readable
   composition. Keep intentional internal gaps and meaningful plot areas.
2. **Export:** measure the final painted bounds and use their union as the SVG's
   outer rectangle. This trims unused margins without changing the layout.

Implement this through shared bounds helpers used by every renderer, rather than
per-chart hardcoded crop values. `renderXyGraphDrawing()` and
`renderCircularGraphDrawing()` return `{ markup, bounds: { x, y, width, height }, targets }`;
nonpainting fragments use `bounds: null`. Existing `renderXyGraph()` and
`renderCircularGraph()` retain their string return values. The board compositor
applies each group's transform to its bounds, unions the results, and sets the
root viewBox to `"minX minY width height"`. Set the root width and height to
those same dimensions so its intrinsic aspect ratio matches the content. A
nonzero viewBox origin is valid; translating all content to `(0, 0)` is
optional.

Bounds must cover the actual drawing:

- Include text glyph extents above and below the baseline, overhangs, rotated
  axis labels, and the text's anchor alignment. Character advance widths alone
  are not complete painted bounds. Use `graphTextBounds()` and the bundled glyph
  ink bounds for tight text cropping.
- Include stroke widths, rounded caps, curve extrema, both handwritten border
  passes, point markers, and arrowheads. A shape's centerline is not its outside
  edge. Pen displacement must not get clipped.
- Respect transforms and clipping. Hatch strokes outside a clip do not enlarge
  the visible content bounds. Unused definitions and metadata do not contribute.
- Keep fractional coordinates. If rounding dimensions, round outward to avoid
  cutting off content; do not add a decorative safety margin as hidden padding.
- Handle empty output explicitly rather than generating an invalid zero-size
  viewBox. Validate finite bounds and reject unsupported geometry clearly.

Cropping must never hide content that did not fit the initial layout. Increase
or reflow the layout when needed. Tight outer bounds do not remove intentional
space between a title and plot, blank areas within a chart's data range, or gaps
between separate diagrams.

The client should display the result with its natural aspect ratio. Use
`display: block` and `height: auto` on an `<img>` to avoid the inline-image
baseline gap and preserve proportions. A forced container aspect ratio can
reintroduce empty space even when the SVG itself is tightly bounded.

## Handwritten shapes and fills

Use `handwritten()` for pen effects. Do not independently implement random
wobble for every new visualization type.

| Setting                  | Starting value | Meaning                        |
| ------------------------ | -------------: | ------------------------------ |
| `roughness`              |            1.5 | Small coordinate perturbations |
| `hatchGap`               |              9 | Distance between fill strokes  |
| Outline width            |              2 | General shape boundary         |
| Axis / connector width   |            1.6 | Supporting structure           |
| Data line width          |            2.7 | Main plotted line              |
| Secondary border opacity |           0.45 | Faint retraced pen pass        |

- Keep the effect subtle. Roughness 4 is a loose-sketch experiment, not the
  default for data charts. Roughness 0 removes outline wobble.
- Use deterministic seeds derived from stable elements. Rerendering unchanged
  content must not make the image jump or flicker.
- `fill` in `handwritten()` supplies the accent for both layers: a solid color
  wash at **5% opacity**, then hatch strokes at **50% opacity**. `"none"` skips
  both. These values live in `FILL_STYLE` in `theme.ts`. Apply opacity to each
  layer separately so outlines and text retain their existing strength.
- Hatches run approximately 45 degrees, clipped to the shape. Each filled region
  gets its own seeded angle, starting offset, spacing variation, and
  individually bent strokes. At the default roughness of 1.5, angle varies by
  about 6 degrees and spacing by up to 15%. Both scale continuously with
  roughness, capped at twice those ranges for loose sketches. Roughness 0 has no
  variation. Do not reuse one hatch path with different colors for adjacent
  regions.
- Intersect strokes with the nominal circle, rectangle, or pie sector before
  bending them. Shorten each endpoint independently by 0.25–2.25 times
  roughness, capped at 20% of that segment's length per end. Control-point
  displacement is capped for short segments too. This gives uneven pen endings
  without erasing short strokes. The final SVG clip remains a guard for wobble
  near boundaries; intersections use ideal geometry, not the perturbed border
  curves.
- For pie fills, pass `hatchSector: { startAngle, endAngle }` to limit generated
  geometry to the wedge. Angles are clockwise SVG radians, with a positive span
  of at most one turn. The caller still clips the background wash and curves to
  the sector. Major slices can produce two separate segments on the same line.
  Do not generate a full circle's hatch strokes for every slice.
- `fillSeed` varies fill strokes independently of the outline `seed`; it
  defaults to that seed. Region `id` and fill color also contribute to fill
  randomness. Pie slices share the outer circle's border seed to preserve
  clipping geometry, but use distinct fill seeds and IDs. Roughness 0 keeps
  hatches straight and evenly spaced.
- Hatch stroke width is currently 0.65 times the outline width. Round stroke
  caps and joins keep the pen treatment soft.
- Compute data geometry first, then apply styling. Preserve exact point-marker
  positions, proportions, and meaningful endpoints; do not jitter input data.
- Give every clip path and definition a unique ID within the whole board.
- Keep small indicators quieter than large shapes. Avoid roughness that consumes
  the marker itself, overlaps neighbors, or makes a boundary misleading.
- Important text should not sit on dense hatching. Move it outside or reduce
  fill density when readability suffers; do not paint an opaque label backing.

## Labels, legends, and connectors

- Prefer short, descriptive titles in sentence case, centered at the top.
- Label axes with their quantities and units. Format large numbers consistently
  and make abbreviations such as `M` understandable from the axis context.
- Keep legend ordering aligned with input ordering. Place an XY legend below the
  plot, aligned with its left edge. A pie legend sits beside the circle when
  space allows. New types may move legends below to preserve readable sizing.
- Use line samples for line series and small square indicators for filled
  regions. Indicators must use the same color and treatment as the data.
- Keep labels near their targets and route connectors around text. Do not draw
  arrows through nodes or use decorative arrows without a directional meaning.
- Avoid unnecessary borders, shadows, gradients, textures, badges, and panels. A
  shape should explain content or relationships, not merely decorate space.

## Data accuracy and edge cases

- Use the typed spec as content input; keep colors and geometry under renderer
  control. Do not mutate the spec while sorting or laying it out.
- Validate finite numeric values, valid dimensions, and nonempty data. Handle a
  single point, equal values, negative values where meaningful, long labels, and
  small allocations deliberately. Fail explicitly on unsupported types.
- Line graphs currently accept numeric X/Y data and connect points in X order.
  Their Y range includes zero. Other scale policies must be explicit and
  labeled; do not change scales only to exaggerate a trend.
- Pie values must be positive and share one whole. Normalize by the sum; retain
  exact slice angles and values. Tiny slices can use the legend without an
  interior percentage. Never invent a category to complete the whole.
- The current pie uses interior percentages only for slices of at least 8%. This
  is a starting heuristic, not a guarantee against label collisions.

## Adding a new visualization type

1. Read this guide and the existing child schemas. Define the content contract
   and validation independently of appearance.
2. Implement the renderer in the appropriate family module. Return a local SVG
   group; leave board placement, root font embedding, and uploading to their
   respective owners.
3. Import shared colors and font helpers. Reuse the handwritten primitives or
   extend them once if the type needs a new shape.
4. Calculate the content bounds and reserve space for labels before drawing.
5. Escape user text before inserting it into SVG. Include a descriptive title
   and accessible name, and retain full text when shortening visual labels. The
   client should provide useful `alt` text when displaying the SVG as an image.
6. Add runnable example data with at least a normal and a challenging case.
   Inspect the exported SVG via `<img>` at its intended size on white and tinted
   light surfaces, checking font loading, transparency, clipping, and
   readability.
7. Add focused behavior checks for data transformations and important edge
   cases. Verify deterministic output and unique definition IDs when composing
   graphs.

## Current scope and intentional gaps

- Implemented: XY line, grouped bar, scatter, and overlapping area charts; pie,
  and donut charts; transparent graph exports, embedded
  Shantell Sans, character-width-based label fitting, pen primitives, and shared
  tight export bounds for the current graph geometry. No browser is required to
  calculate those bounds. Future primitives must supply their own painted
  bounds.
- Implemented board processing: `renderWhiteboardSvg(spec, options)` first
  renders base child groups with target geometry, then appends emphasis groups,
  places callouts, and exports the complete SVG. It returns `svg`, dimensions,
  bounds, and `stages.base`, `stages.emphasis`, and `stages.callouts` snapshots.
  The current final SVG is the callout snapshot. `calloutPlacements` describes
  each label and connector in child-local coordinates; `childPlacements` gives
  final board translations. The renderer does not write files;
  `../local-test.ts` saves base, emphasis, and final SVG files under `output-ex/`
  and logs the chosen callout sides and outside-gutter placements.
- Emphasis supports circle, box, underline, strikethrough, and number. Circles
  enclose the target's bounds, boxes add a small gap, text strokes follow the
  label orientation, and numbers sit just above/right of the target. All use
  the shared ink color. Number placement is deterministic; collision avoidance
  and repositioning around other annotations are not implemented.
- Base targets use the IDs documented in the child schemas. Geometry remains
  local to the child; base and emphasis share its board translation. XY point
  IDs survive sorting. Missing targets (including omitted tiny-slice percentage
  labels), duplicate content IDs, and invalid text targets fail explicitly.
- Arrow and line callouts measure and wrap complete messages at 15 units, with
  21-unit line spacing and a 190-unit maximum line width. Explicit newlines and
  long words are preserved. There is no truncation or opaque text backing.
- All visible base text and shapes, data strokes, and emphasis reserve space.
  Grid lines and hatching do not. Pie disks reserve their circular area for
  labels; wedge arrows attach to their outer arc. An interior percentage can
  receive a connector through its own filled region while avoiding other text.
- Callouts try eight directions at increasing distances, biased toward the
  target's position within the plot. Messages with fewer available positions
  are placed first, then larger messages, then original annotation order. Each
  placement reserves its message, connector, and arrowhead for following items.
- Connectors prefer straight or one-bend routes. A bounded visibility graph
  around nearby obstacle corners handles blocked routes; outside gutters are
  evaluated as alternatives. Paths avoid unrelated text, shapes, and data
  strokes. Arrowheads face the target, and the gap to it must not hide an
  intervening label. Crowded axis intersections may use a slightly longer gap.
- Brackets evaluate both sides of vertical groups and above/below horizontal
  spans, reserving their caps and optional label. They can move outside the
  child's painted extent when nearby sides are occupied.
- This is a deterministic, bounded placement search, not a guarantee that every
  possible annotation set has a solution. If no non-overlapping candidate can
  be routed, rendering fails with the child and annotation index; it never
  silently drops a callout or accepts an overlapping label. Existing emphasis
  positions and the base chart's internal layout are not globally optimized.
- `index-test.ts` runs the supplied book example and an XY emphasis demo
  without an LLM call; run it with font read and output-ex write permissions.
- `callouts-test.ts` adds motion, grouping, and split-board review examples,
  saving their SVGs and JSON specs/placement diagnostics under `output-ex/`.
- Planned: asset processing, global layout optimization, wrapping base chart
  labels, category color mapping across views, and dark themes.
- `handwritten-demo.ts` predates these export rules. Its cream presentation
  background and system-font headings are an isolated shape-comparison fixture,
  not the template for new visualization types.
- Exported SVGs must be self-contained. Font embedding adds bytes; share one
  embedded copy across a composed board. Some non-browser converters need their
  own font-loading configuration; browser `<img>` display is the primary target.

Keep this document and shared code aligned as the renderer evolves. Describe
unfinished capabilities as planned rather than implying they already work.


## Chart first version and design iteration

Run `deno run --allow-read --allow-write charts-gallery.ts` from this directory.
It writes all six SVG examples, their board JSON specs, and an `index.html`
gallery into `output-ex/charts/`. Open the gallery locally to compare white and
tinted surfaces. No model call, upload, or API key is needed. The separate HTTP
endpoint still returns its existing fixed demo URL; this gallery and
`renderWhiteboardSvg` exercise the actual rendering pipeline.

- Edit `charts-gallery.ts` for sample data; `graphs.ts` for geometry and type
  layouts; `theme.ts` for the shared palette and fill opacity.
- `GraphOptions` controls allocation, roughness, hatch gap, and seed.
  `CIRCULAR_STYLE` in `graphs.ts` controls the donut hole size.
- XY `chartStyle` supports `line`, `bar`, `scatter`, and `area`. Numeric charts
  sort copied points by X. Bars treat X values as equally spaced categories in
  first-appearance order, including numeric categories. Multiple series use
  grouped bars with stable slots for missing categories. Duplicate categories
  within one bar series are rejected; zero bars show a baseline stroke.
- Areas fill to zero, including negative values. Multiple series overlap;
  stacking and interpolation are not implemented. Flat zero areas and single
  points retain their line/markers without manufacturing a filled region.
- The family definition lives in `../children/circular-chart.ts`, alongside
  `xy-chart.ts`. Its exported type and renderer names use `CircularChart` and
  `renderCircularGraph` because the family includes both pie and donut styles.
- Circular charts retain `type: "pie_chart"` for compatibility. Optional
  `chartStyle` selects `pie` (default) or `donut`. A single positive
  slice is supported, including a complete ring. Holes use annular clipping,
  never opaque cover shapes.
- Increase the height if the slice legend does not fit. Slices below 8% omit
  their interior percentage target. Richer label collision handling is future work.

Run `deno test --allow-read *test.ts` for chart and annotation behavior checks.

## Math expressions

`math-expressions.ts` lays out the child defined in
`../children/math-expressions.ts`. `latex.ts` uses MathJax 4.0.0 with only the
base, AMS, and textmacros configurations, preserving synchronous rendering.
It accepts Greek letters, common operators, fractions, roots, scripts, limits,
matrices, cases, and aligned equations. One surrounding pair of math-mode
paste delimiters is accepted. Input is limited to 2000 characters and 32 nested
groups, with bounded macro expansion. This is not a full LaTeX document compiler;
unsupported commands, external content, and absent font glyphs fail explicitly.

`math-font.ts` supplies metrics and outlines from Shantell Sans Math instead of
MathJax's default font. The font build also derives larger display operators and
long arrows from those outlines. Stretch delimiters scale the actual font glyph;
Custom wrappers draw rounded fraction/radical bars and position root indices.
Ordinary bold and italic use the Medium face;
calligraphic/Fraktur alphabets are unavailable and double-struck C/N/P/Q/R/Z use
dedicated glyphs. Rendering produces self-contained paths with no glyph-cache
IDs, so equations compose without collisions. The parser resets between rows.

Each expression is one centered row. Lay out fractions and scripts relative to a
baseline, retain painted bounds through translations and scaling, and reserve
row bounds as annotation obstacles. Uniformly shrink the expressions to the
child allocation only while the base size stays at least 18 units; otherwise ask
for more space or less content through a clear rendering error. Titles use the
standard 25-unit font. Expose `<childId>.<expressionId>.expression` as a target for
the whole row and `<childId>.title` for the title. Individual terms are not
addressable yet. The original LaTeX remains in the spec for subsequent editing.

To run the focused tests and regenerate the standalone example from the repo root:

```sh
deno test --allow-read projects/sixtus/tools/learning-material/whiteboard/render/math-expressions-test.ts
deno run --allow-read --allow-write=projects/sixtus/tools/learning-material/whiteboard/render/output-ex projects/sixtus/tools/learning-material/whiteboard/render/math-expressions-test.ts
```

The example is `output-ex/math-expressions.svg`. Render a spec through
`renderWhiteboardSvg()` for a real SVG; `executeWhiteboard()` still returns its
pre-existing fixed demo URL and does not yet render/upload specs.

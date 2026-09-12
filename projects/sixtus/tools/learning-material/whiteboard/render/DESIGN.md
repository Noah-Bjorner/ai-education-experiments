# Whiteboard visualization design

Read this before implementing a new visualization type in this
directory. The aim is a clear educational diagram drawn with a light pen: warm,
simple, and readable, with accurate geometry beneath the handwritten treatment.

This guide covers the whiteboard renderer. The older `../../static/` renderer
has a separate design guide and theme; do not copy its opaque background or
system-font defaults into new whiteboard types.

## Sources of truth

- `theme.ts`: `TYPE_SCALE`, `LINE_HEIGHT`, and `SPACING` are the typography and
  relationship-spacing source of truth, alongside colors and fill constants.
  Import semantic roles rather than repeating their numbers in renderers.
- `text-block.ts`: shared multiline text measurement, wrapping, and alignment.
- `titles.ts`: shared wrapped figure headings, underline/box decoration, and
  measured heading-to-content spacing.
- `font.ts`: Shantell Sans Math, embedded font definitions, and text measurement.
- `handwritten.ts`: reusable pen outlines and hatch fills.
- `hatching.ts`: stroke intersections, sector geometry, and fill variation.
- `bounds.ts`: shared painted bounds, curve extrema, and export sizing.
- `graphs.ts`: XY and circular chart renderers, not a universal layout engine.
- `index.ts`: shared staged board renderer with base, emphasis, and callout snapshots.
- `figure-placement.ts`: measured figure placement by anchor ID and side.
- `targets.ts`: semantic SVG IDs and measured figure-local annotation targets.
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

All figure renderers use these semantic roles from `theme.ts`. Sizes and line
heights are in board SVG units; line height means baseline-to-baseline distance,
not an extra gap below the glyphs.

| Role | Size | Line height | Consumers |
| --- | ---: | ---: | --- |
| `boardTitle` | 32 | 42 | Uppercase, boxed board heading |
| `figureTitle` | 25 | 34 | Every figure's underlined heading |
| `body` | 22 | 30 | Text cards and freeform normal text |
| `label` | 16 | 22 | Axes, legends, coordinate/geometry labels, freeform small text |
| `supporting` | 13 | 18 | Tick values |
| `detail` | 12 | 16 | Secondary values below pie legend labels |
| `annotation` | 16 | 22 | Callout messages and annotation numbers |
| `prominent` | 28 | 38 | Explicitly prominent freeform content |
| `mathDisplay` | 36 | 48 | Main equations; actual math rows use measured ascent/descent |

The primary content of a figure (a displayed equation or prominent freeform
statement) may be larger than its identifying heading. Equivalent labels use the
same role across figure types. In freeform, choose small for object labels,
normal for explanatory body text, and large for deliberate prominence.
Do not introduce figure-specific font families,
font weights, or copies of these values. Match measurement to the same role used
for drawing; changing a legend font must also change its measured packing width.

`textBlock()` preserves explicit newlines and whitespace, splits long tokens by
glyph, accounts for overhang, and returns both painted bounds and layout height.
Use it for titles, text cards, freeform text, and messages. Empty visible text or
an allocation narrower than a glyph fails explicitly. Single-line ticks and
chart labels still use the shared font helpers; existing truncation and tick
validation rules apply. These are explicit content-fitting policies, not
permission to shrink fonts to hide an allocation problem.

`withFigureTitle()` wraps the full title at the figure allocation width, centers
its painted text over the complete base drawing, and places the underline's
painted bottom `SPACING.figureTitleGap` above that drawing. It preserves body
geometry, focus bounds, and existing targets, and adds a measured title target
and decoration obstacles before teaching annotations. A null title adds nothing.
Long headings grow the export upward rather than colliding with the drawing.
Board headings similarly wrap at the board width (with a 128-unit minimum wrap
width), and their complete box is separated by `SPACING.boardTitleGap`.

Text sizes remain fixed in board coordinates when allocations change. Freeform
geometry scales uniformly, but text sizes, line heights, and attachment gaps are
compensated for that transform. Text widths still follow the scene and may cause
more wrapping. Equation rows keep the display size and grow vertically; an
expression too wide at that size fails with an instruction to widen or split it.
MathJax still controls fractions, subscripts, superscripts, and stretchy symbols.

The final SVG may still be scaled by its viewer: displaying an 800-unit figure at
400 CSS pixels halves visible sizes. Check mixed figures at intended display
widths; renderer units cannot enforce a CSS-pixel minimum in an external viewer.

## Color

Use semantic roles for chart furniture, the ordered accent palette for data,
and a contrasting second pen for teaching annotations.

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

### Annotation color

Emphasis and callouts use one color per figure, chosen by the board compositor
in `index.ts`. The spec and the model do not pick it.

The rule is contrast with the base drawing, not a fixed annotation hue:

- When the figure is drawn in ink — math expressions, and freeform scenes that
  omit element color — annotations use `SERIES_COLORS[0]` (blue). Circles,
  underlines, numbers, brackets, and message arrows then read as a second pen
  on top of the black work.
- When the figure already spends the accent palette on data or categories — XY
  charts, pie and donut charts, coordinate plots, geometry with filled regions
  — annotations use `COLORS.ink`. Blue would collide with the first series or
  slice and look like another category rather than a teaching mark.

Do not color an annotation from its target's stroke, and do not mix annotation
colors within one figure. A multi-figure board may mix the two modes because
each figure is decided independently.

When adding a type, pick the side that matches its base drawing: ink-only
content gets blue annotations; anything that already uses `SERIES_COLORS` for
marks or fills gets ink annotations.

Example:

```ts
import { COLORS, SERIES_COLORS } from "./theme.ts";

const outline = COLORS.ink;
const seriesColor = SERIES_COLORS[seriesIndex % SERIES_COLORS.length];
```

## Spacing and sizing

Design each visualization in its own local coordinate system, starting at
`(0, 0)`. A parent compositor places that group using a translation. Do not
hardcode a figure's position on the board into its drawing logic.

Use semantic relationship values from `SPACING`, with a 4-unit rhythm for normal
layout. Calculated baselines, pen offsets, collision searches, and mathematical
coordinates need not be multiples of four.

| Relationship | Default | Measurement |
| --- | ---: | --- |
| `boardTitleGap` | 32 | Complete title box to complete figure union |
| `figureGap` | 32 | Complete figures including teaching annotations |
| `figureTitleGap` | 24 | Underline's painted bottom to base drawing's painted top |
| `cardPadding` | 16 | Text layout to the card's nominal border |
| `labelGap` | 8 | Object/indicator to attached label layout |
| `labelClearance` | 4 | Minimum collision clearance for placed labels |
| `legendItemGap` | 32 | Between adjacent chart legend entries |
| `legendRowGap` | 8 | Added to measured role line heights for legend rows |
| `sectionGap` | 24 | Separate sections and initial callout search distance |
| `mathRowGap` | 24 | Previous row descent to next row ascent |

`titleUnderlineGap` (3) and `titleBoxPadding` (5) are optical decoration values.
Different relationships may share a number but remain separate settings: changing
`figureGap` must not change the board heading gap. `PlacementOptions.gap` can
override inter-figure spacing without affecting other relationships.

- Export with zero outer padding; the client supplies presentation padding.
- Measure titles, multiline text, and legend widths before positioning them.
  Font and line-height changes must flow into measurement and rendering together.
- Keep each renderer's mathematical geometry and necessary chart margins local.
  A chart's axis reservation is not a universal padding token. Candidate label
  placement may search multiples of the preferred gap to avoid collisions.
- The shared title is composed above measured body bounds. Title size or wrapping
  never scales the body or requires a separate hardcoded title baseline per type.
- Retain the complete painted union, including decorations, as export bounds;
  cropping must not conceal overflow or collisions.

Current graph defaults are 800 × 520, with a minimum allocation of 600 × 400.
These are internal layout constraints, not the exported size. `renderGraphSvg()`
now wraps the measured content with zero outer padding. The XY plot starts 92
units from the left and 90 from the top, with 42 on the right and reserved
bottom space for axes and legend. Those larger insets serve chart labels; they
are not general-purpose padding tokens.

Board placement:

- The board has a nullable `title` drawn centered above the union of all
  figures, always in uppercase, with a handwritten box matching annotation
  emphasis, and a `figures` array. There is no `layout` field. Figure titles
  are nullable; when present they sit above that figure with a handwritten
  underline matching annotation emphasis. When null, no `<id>.title` target is
  registered and tight export trims the vacated space.
- Every figure has a unique required `id` and flat `anchor` and `side` fields.
- The first figure is the only root, with `anchor: null` and `side: null`.
- Later figures anchor to an earlier ID with side `top`, `left`, `right`, or
  `bottom`. Validation rejects missing IDs, duplicate IDs, extra roots, missing
  sides, and unknown, self, or forward anchors.
- Figures are centered along the shared edge. Spacing is renderer-controlled
  (`gap`, default 32); the spec has no alignment, size, or gap controls.

Each renderer receives its own allocation (`width` and `height` options now apply
per figure, default 800 × 520). Render base content, emphasis, and callouts locally
before measuring their complete union. Place each complete figure against its
anchor's final measured bounds. If it would overlap another figure, move it
farther along the requested side axis until all earlier figures are clear.
Descendants anchor to that resolved position. Base, emphasis, and final exports
reuse the same translations, preserving geometry between stages. Returned
`figurePlacements.x/y` are local-to-board translations; `width/height` are the
complete measured extents. No scaling, regeneration, or post-hoc gutter expansion
is needed. Changing the arrangement requires a new render.

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

1. Read this guide and the existing figure schemas. Define the content contract
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
  renders base figure groups with target geometry, then appends emphasis groups,
  places callouts, and exports the complete SVG. It returns `svg`, dimensions,
  bounds, and `stages.base`, `stages.emphasis`, and `stages.callouts` snapshots.
  The current final SVG is the callout snapshot. `calloutPlacements` describes
  each label and connector in figure-local coordinates; `figurePlacements` gives
  final board translations. The renderer does not write files;
  `../local-test.ts` saves base, emphasis, and final SVG files under `output-ex/`
  and logs the chosen callout sides and outside-gutter placements.
- Emphasis supports circle, box, underline, strikethrough, and number. Circles
  enclose the target's bounds, boxes add a small gap, text strokes follow the
  label orientation, and numbers sit just above/right of the target. Annotation
  color follows the Color section: ink on types that already use the accent
  palette, `SERIES_COLORS[0]` on ink-only types (`math_expressions`, `freeform`).
  Number placement is deterministic; collision avoidance and repositioning
  around other annotations are not implemented.
- Base targets use the IDs documented in the figure schemas. Geometry remains
  local to the figure; base and emphasis share its board translation. XY point
  IDs survive sorting. Missing targets (including omitted tiny-slice percentage
  labels), duplicate content IDs, and invalid text targets fail explicitly.
- Arrow and line callouts measure and wrap complete messages at 15 units, with
  22-unit line spacing and a 190-unit maximum line width. Explicit newlines and
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
  strokes, except closed containers that enclose the target (a pitch around a
  player, a pie slice around its percentage). Arrowheads face the target, and
  the gap to it must not hide an intervening label. Crowded axis intersections
  may use a slightly larger gap.
- Brackets evaluate both sides of vertical groups and above/below horizontal
  spans, reserving their caps and optional label. They can move outside the
  figure's painted extent when nearby sides are occupied.
- This is a deterministic, bounded placement search, not a guarantee that every
  possible annotation set has a non-overlapping solution. If no clear candidate
  can be routed, a fallback placement is used and a warning is logged; only
  unusable leftover cases are skipped. Existing emphasis positions and the base
  chart's internal layout are not globally optimized.
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
- The family definition lives in `../figures/circular-chart.ts`, alongside
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

`math-expressions.ts` lays out the figure defined in
`../figures/math-expressions.ts`. `latex.ts` uses MathJax 4.0.0 with only the
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

Each expression is one centered row at `TYPE_SCALE.mathDisplay`. Lay out fractions
and scripts relative to a baseline and reserve row bounds as annotation obstacles.
Use `SPACING.mathRowGap` between measured row extents, without scaling the gap or
font. More rows grow the export vertically; expressions wider than the allocation
minus two section gaps fail explicitly. The optional title uses `withFigureTitle()`.
 Expose `<figureId>.<expressionId>.expression` as a target for
the whole row and `<figureId>.title` for the title (only when title is not null). Individual terms are not
addressable yet. The original LaTeX remains in the spec for subsequent editing.

To run the focused tests and regenerate the standalone example from the repo root:

```sh
deno test --allow-read projects/sixtus/tools/learning-material/whiteboard/render/math-expressions-test.ts
deno run --allow-read --allow-write=projects/sixtus/tools/learning-material/whiteboard/render/output-ex projects/sixtus/tools/learning-material/whiteboard/render/math-expressions-test.ts
```

The example is `output-ex/math-expressions.svg`. Render a spec through
`renderWhiteboardSvg()` for a real SVG; `executeWhiteboard()` renders and uploads
the resulting SVG through the shared whiteboard execution path.

## Geometry diagrams

`geometry.ts` renders the `geometry` figure after the shared construction resolver
validates its points, objects, and mathematical markings. Geometry is registered
in the parent schema, generation prompt, and staged renderer.

- Mathematical coordinates use positive Y upward. One uniform scale preserves
  lengths, angles, and circles. All declared points appear as dots; names and
  measurements appear only through explicit labels.
- Outlines use exact paths with rounded pen caps. Unlike decorative sketch
  outlines, these paths do not perturb intersections, tangencies, or right
  angles. Filled circles and polygons use the shared seeded hatch treatment.
- Lines extend in both directions and rays in one direction to the local drawing
  boundary. Arrowheads indicate continuation. Segments retain their endpoints.
- Right angles use squares. Equal lengths use matching ticks, parallel groups
  use matching chevrons, and equal-angle groups use matching arc counts. Where
  a segment has both ticks and chevrons, place them separately.
- LaTeX labels use the same math renderer as `math_expressions`. Automatic length
  labels use the common unit and at most two decimal places; symbolic labels
  reveal no computed value. Label candidates are checked against measured text
  and shape strokes. Labels sit on the fill with no backing rectangle and no
  punched clearance holes.
- Register all documented point, object, marking, label, and title target IDs.
  These feed the shared emphasis and callout stages. Internal clip IDs use the
  parent's unique renderer prefix so multi-figure boards remain independent.
- Reject labels or markings that cannot fit legibly. Ask for a larger allocation,
  shorter labels, or a simpler diagram rather than silently clipping content.

Generate the six example SVGs and their gallery with:

```sh
deno run --allow-read --allow-write projects/sixtus/tools/learning-material/whiteboard/render/geometry-gallery.ts
```

The gallery is written to `render/output-ex/geometry/index.html`. Fixtures in
`geometry-examples.ts` cover an annotated altitude, circle/tangent construction,
equality and parallel markings, minor/reflex angles, equal angles, and shaded
regions with math labels. `geometry-test.ts` exercises the same figures through
both the figure renderer and the parent pipeline.

## Coordinate plots

`coordinate-plot.ts` renders the five `coordinate_plot` elements: functions,
points, lines (including segments and rays), circles, and polygon outlines.
The figure registry connects this definition to the parent output/request schemas,
generation instructions, and `renderWhiteboardSvg()` dispatch. The existing
`executeWhiteboard()` path renders and uploads its SVG like the other figures.

- Axes describe a visible mathematical window. Equal unit scale is the default;
  fit the plane's aspect ratio within its allocation without changing the ranges.
  Independent scaling is explicit. Positive Y points upward. A zero axis outside
  the window sits on the nearest edge. Axis names stay horizontal and sit at the
  positive tips: `y` just above the vertical axis, `x` just to the right of the
  horizontal axis. Do not borrow chart-style placement (centered under the frame,
  rotated along the left edge); that belongs to `xy_chart`.
- Grid and tick values are generated once per axis. Authors can supply a positive
  tick step or explicit numeric positions with symbolic text labels. Reject
  excessive or overlapping ticks rather than dropping or truncating values.
- Use exact, round-capped geometry and the shared font and palette. Outlines do
  not receive decorative jitter, which could change the apparent relationship
  between a point, an axis, and a curve. Shapes remain unfilled.
- `coordinate-math.ts` compiles the restricted expression AST into closures, never
  JavaScript source. Nonfinite intermediate results stay undefined. This is real
  numerical arithmetic: negative bases with fractional powers are unsupported,
  and zero to the zeroth power is treated as undefined.
- Clip segments, rays, and lines parametrically. Sample functions adaptively in
  screen space with quarter-point probes and a bounded evaluation budget. Leave
  unresolved intervals as gaps. This handles ordinary poles, jumps, and domain
  boundaries, but is not symbolic continuity analysis: very narrow features and
  rapid oscillations may require a narrower window. Numerical overflow, sampling
  budget exhaustion, and unreadable allocations produce explicit errors.
- Each supplied domain interval is independent of viewport clipping. Closed
  endpoints require a defined value. Open endpoints require a finite one-sided
  limit from inside the interval. Only requested finite domain endpoints receive
  markers; leaving the visible window does not create an endpoint.
- Open markers use a local transparency mask to remove underlying geometry,
  including grid strokes. White mask values are coverage, not an opaque painted
  background. Internal mask/clip IDs use the parent's unique renderer prefix.
- Labels are measured and placed after gathering all visible geometry. Prefer
  an available location beside the curve or shape; use a legend below the plane
  when needed. Register element `.mark` and explicit `.label` targets, plus the
  title and axis labels. Entirely clipped elements have no visual targets or
  labels; annotations targeting them fail clearly.
- All geometry retains figure-local bounds and obstacles for the shared emphasis,
  callout, and figure placement stages. Multiple coordinate figures can coexist
  with charts, geometry diagrams, and math expressions.

Regenerate the eight classroom examples and their JSON specs with:

```sh
deno run --allow-read --allow-write projects/sixtus/tools/learning-material/whiteboard/render/coordinate-gallery.ts
```

The gallery is `render/output-ex/coordinates/index.html`. Focused verification:

```sh
deno test --allow-read projects/sixtus/tools/learning-material/whiteboard/figures/coordinate-plot-test.ts projects/sixtus/tools/learning-material/whiteboard/render/coordinate-plot-test.ts
```

## Freeform scenes

The `freeform` figure is generated in the existing spec call and rendered by
`renderFreeformDrawing`. It supports text, rectangles, ellipses (equal radii for
circles), solid/dashed lines and arrows, and X/O/dot markers. No SVG input, images,
rotation, arbitrary paths, or additional model calls are involved.

- Use an 800 × 440 logical scene with positive Y downward beneath the shared
  title. Rectangles use top-left coordinates; ellipses and markers use centers.
  The renderer fits that working area uniformly into its allocation, preserving
  aspect ratios. Content that extends past 800 × 440 is included in painted
  bounds and grows the export rather than failing or clipping. Negative scene Y
  is shifted down so it does not collide with the title. Array order determines
  paint order. The default allocation is 800 × 520. Scene content starts 64
  units below the allocation's top.
- Every element needs a unique ID. Optional color selects `ink` (default) or
  `accent-1` through `accent-6` from the shared palette. Specs should omit color
  so the diagram stays in ink and leaves blue for teaching annotations (see
  Color). Use later accents only to distinguish categories; never accent-1
  on the base scene. Rectangle/ellipse `fill` uses seeded shared
  hatching. Outlines are rendered with zero roughness to keep meaningful
  positions and attachments stable. X/O markers are outlined; dots are solid.
  Thin outline obstacles allow annotations inside container shapes.
- Text specifies content, width, alignment, and small/normal/large size
  (shared label/body/prominent roles: 16/22/28 board units). Explicit positions locate the top-left layout box.
  Attached positions reference a rectangle, ellipse, or marker with a side and
  gap (`SPACING.labelGap`, 8 board units by default). Text wraps using shared font advances, splits oversized
  words at glyph boundaries, and preserves whitespace and explicit newlines.
  Painted bounds use shared glyph metrics. Text is never truncated or shrunk.
  Smaller allocations rewrap at the shared size; impossible glyph widths retain
  the freeform warning/skip policy. Titles use the same wrapping and measured
  separation as all other figure types.
- Arrow endpoints accept explicit points or shape references, including forward
  references. Referenced endpoints meet the shape boundary toward the opposite
  endpoint. X attachment uses the actual two round-capped strokes. Arrows are
  straight, with a 10-unit maximum head. No automatic routing or scene repair is
  attempted; shared annotation callouts retain their existing routing behavior.
- Targets are `<figure>.title` (only when title is not null), `<figure>.<text>.label`, and
  `<figure>.<element>.mark` for other primitives. Targets, painted bounds, and
  obstacles are transformed together into figure-local allocation coordinates.
  Parent composition owns the final translation and embedded font.
- Reject invalid references, duplicate IDs, and invalid render sizes/options.
  Absurd geometry is skipped before any fill generation. Other layout problems
  warn and still render: stacked labels, lines or arrows that cross text,
  degenerate attached connectors, and individual elements whose painted bounds are invalid or
  exceed the 10k safety extent (those elements are skipped). Rectangle and
  ellipse outlines are containers: labels may sit inside them or meet their
  border. Warnings identify the figure and involved elements. Intentional shape
  overlap remains supported; hatch strokes are not text collision obstacles.
  Ellipse collision outlines use 256 segments.

Run the tests and generate JSON/SVG examples plus the white/tinted review gallery
from the repository root:

```sh
deno test --allow-read projects/sixtus/tools/learning-material/whiteboard/render/freeform-test.ts
deno run --allow-read --allow-write=projects/sixtus/tools/learning-material/whiteboard/render/output-ex/freeform projects/sixtus/tools/learning-material/whiteboard/render/freeform-gallery.ts
```

The gallery is `render/output-ex/freeform/index.html`. Its fixtures cover sports
markers and a passing arrow, a sender/receiver diagram with attached labels, and
an experiment diagram with wrapped text, fills, and a shared message callout.
These are deterministic drawing fixtures, not evaluations of model-generated
scene quality.

## Text figures

`../figures/text.ts` defines `type: "text"` with a nonempty plain `text` string
and a required `role`: `note`, `question`, or `takeaway`. It uses the shared
figure ID, nullable title, annotations, and board-level anchor/side fields.
`text.ts` renders it through the normal staged whiteboard pipeline.

- All roles use the same maximum width (800 by default), 22-unit body text,
  30-unit line spacing, 16-unit padding, and 2-unit dashed border. Text wraps at
  the maximum inner width, then the border hugs the longest measured line plus
  padding. Short messages do not stretch to fill the allocation. The card's
  height grows to retain all wrapped content, even beyond the initial height
  allocation. No text is shrunk, truncated, or clipped. Titles also wrap at
  the shared figure-title size and retain the shared handwritten underline.
  Titles center over the resulting card without widening its border.
- Borders use the shared handwritten rectangle path with subtle seeded wobble,
  rounded dash ends, and one outline pass. Dash lengths are 8 units with 6-unit
  gaps. The faint retraced pass is disabled for text borders so it cannot fill
  their gaps; existing annotations retain their two solid passes. Export and
  obstacle bounds include the complete curved outline and stroke width.
- `TEXT_FIGURE_STYLE` in `theme.ts` maps notes to gray borders and ink text,
  questions to orange borders and ink text, and takeaways to green borders
  and green text. These are semantic text roles, using existing palette colors.
  Borders have no fill and the export stays transparent. Annotations use ink.
- Coordinates start locally at `(0, 0)`; the optional title moves the card
  downward. Bounds include glyph overhangs and the full border stroke. The
  shared `wrapGraphText` helper preserves whitespace, explicit blank lines,
  and complete long tokens. Unsupported glyphs and unusably narrow widths
  fail explicitly. No external fonts or assets are loaded.
- Targets are `<id>.text` for the complete body and `<id>.title` only when a
  title exists. The border and body reserve space for shared callouts. There
  are no per-word or border annotation targets; these are planned only if a
  future contract calls for them.
- On mixed boards, schema validation requires questions immediately before
  their answering visualization, which anchors below the question. Consecutive
  questions can form a bottom-anchored chain ending in the answer. Notes and
  takeaways must anchor below an earlier visualization, directly or through
  its other notes/takeaways. A subsequent question starts a new group below
  an earlier figure. Text-only boards use a root and bottom-anchored text.
  The spec model chooses the semantically related visualization; validation
  enforces these structural links and the renderer preserves their order.

Run the focused tests and regenerate the normal/hard examples and equal-content
role comparisons from the repository root:

```sh
deno test --allow-read projects/sixtus/tools/learning-material/whiteboard/render/text-test.ts
deno run --allow-read --allow-write=projects/sixtus/tools/learning-material/whiteboard/render/output-ex/text projects/sixtus/tools/learning-material/whiteboard/render/text-gallery.ts
```

The review gallery is `render/output-ex/text/index.html`, with complete JSON
specs and SVGs. Tests cover role styling, shared sizing, full text preservation,
painted bounds, annotation targets, invalid input, and reading order through
`renderWhiteboardSvg()`. The gallery remains subject to the user's visual review.

## Design-system verification

Run the renderer regression suite after changing shared roles or spacing:

```sh
deno test --allow-read projects/sixtus/tools/learning-material/whiteboard/render/*-test.ts
```

`design-system-test.ts` verifies every figure's heading, measured title clearance,
body geometry preservation, role sizes across allocations, fixed equation sizing,
and board-title gap independence. `design-system-gallery.ts` generates a mixed
board and individual figures at common display scales for browser review:

```sh
deno run --allow-read --allow-write=/tmp/whiteboard-design-system projects/sixtus/tools/learning-material/whiteboard/render/design-system-gallery.ts
```

Review long titles, absent titles, dense equation rows, wrapping text, annotation
targets, and label/legend readability at both natural and reduced display sizes.

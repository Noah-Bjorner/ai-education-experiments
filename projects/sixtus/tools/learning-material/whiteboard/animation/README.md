# Drawing animation

`applyDrawingAnimation(svg, options?)` runs on the server and returns an SVG
string with embedded, seekable SMIL animations. It requires no browser or React
at generation time. Open [preview.html](./preview.html) for a playable
comparison of the new stroke masks, the original wipe, and general shapes.

```ts
import { applyDrawingAnimation } from "./animation/index.ts";

const animatedSvg = applyDrawingAnimation(svgString, {
  mode: "strokes", // default; "wipe" retains the original effect
  speed: 1.5, // overall timeline speed; omit duration to use this
  textSpeed: 1, // writing multiplier (annotation glyphs and math)
  markSpeed: 1, // non-text drawing multiplier; raise to speed up lines/marks
  markMotion: "natural", // default; "linear" retains the previous movement
  startTime: 0,
  gap: 0.025, // between elements
  strokeGap: 0.04, // pen lifts within an element
  resolution: 256, // skeleton bitmap size; integer 64–512
  idPrefix: "equation-1",
});

const staticSvg = applyDrawingAnimation(svgString, { enabled: false });
```

## Figure animation policy

**Draw the parts whose appearance helps explain the idea.** Dense scaffolding
such as grids, ticks, legends, or many repeated marks should usually appear
together. Draw a key relationship, construction, or emphasis when following
its progression helps the learner. A simple figure can still draw as one whole
base. Splitting is optional; use the fewest meaningful beats and avoid making
the learner wait for decorative detail.

The contract has three separate responsibilities:

- **Identity:** renderers name content with SVG groups. Shared composition adds
  `data-figure-id`, `data-figure-type`, and `data-layer="base"`. A renderer can
  identify optional sub-parts with `<g data-figure-part="...">`; the shared
  figure heading uses `data-figure-part="title"` and `data-drawing="static"`.
  Its explicit `visibility="visible"` keeps text and underline visible even
  inside a hidden base. These are content
  identities, not timing or numeric order instructions.
- **Policy:** `FIGURE_ANIMATION_POLICIES` in [policy.ts](./policy.ts) gives every
  supported type an explicit whole-base treatment and an optional ordered
  recipe. `instant` means hidden until its beat, then fully formed. `stroke`
  sends drawable descendants through the existing drawing engine.
- **Timeline:** `planDrawingBeats` visits figures in document/spec order. It
  schedules the whole base or its replacement part beats, then that figure's
  annotations sorted by index and sequence. Board and figure titles, including
  their box/underline, are visible from time zero and are not beats. Untagged SVGs retain geometry-only reading order.

### Adding or changing a figure

Add an entry to `FIGURE_ANIMATION_POLICIES` even if the figure uses one beat.
Choose `base: "instant"` for complex content that should appear together, or
`base: "stroke"` for a useful whole-figure drawing. No part tags are required
for this default. The typed policy table and registry coverage test check that
each supported figure has an explicit choice.

For an optional split, name meaningful groups in the renderer and add a
`split` recipe to the policy. The current line-chart example is:

```ts
xy_chart: {
  base: "instant",
  split: {
    whenPart: "series",
    steps: [
      { parts: ["framework"], treatment: "instant" },
      { parts: ["series"], treatment: "stroke", pathOrder: "document", sequence: "connected-points", maxAnimatedParts: 3 },
    ],
  },
},
```

Only line charts currently emit these framework/series groups. Titles are
already visible; axes, ticks, grid, labels, and legend appear together; then plotted segments
draw in data order, one series at a time, for up to three series. With four or
more series, all data lines and dots reveal together after the framework;
annotations still draw afterward. The limit counts series, not their segments. `sequence: "connected-points"`
expands each series into first-dot reveal, segment stroke, endpoint-dot reveal,
and so on. Renderers tag dots with `data-series-point` and incoming segments
with `data-series-segment`, both using the endpoint identity. Dots reveal whole
with zero hold and no added pause. SVG paint order stays unchanged. Legacy
series without these tags retain their single stroke beat. Bar, area, scatter, pie, distribution, and coordinate-plot bases still
appear whole. Math bases retain one stroke beat. Text figures write the `writing` part first,
then draw the solid `box` part. Geometry draws construction objects
in spec order, then point dots, then labels/measurements, then property markings.
These use semantic `construction`, `points`, `labels`, and `markings` parts;
annotations follow the completed geometry. Titles remain visible from time zero.

- `whenPart` activates the recipe only if that part exists within the base.
  Otherwise the whole-base treatment applies. Absent parts in a step are
  allowed; steps with no hosts are skipped.
- Each step selects all groups with its part names in document order and makes
  one beat, unless its sequence expands it. Step order belongs in this array. Repeated part names in the SVG
  are allowed; a selected group must belong to only one step.
- Split hosts must be `<g>` elements and must not overlap or nest within one
  another. Together they must cover the non-static base artwork, including
  its labels. Shared titles and their decorations remain static. Splitting replaces the parent beat. The planner rejects
  uncovered artwork and overlapping hosts; definitions and explicitly static
  content are excluded from coverage. Always-visible content inside a beat host must explicitly set
  `visibility="visible"` to override inherited hiding, as figure titles do.
- `pathOrder` defaults to `"reading"`. Use `"document"` when the renderer's
  content order matters, such as connected line segments in ascending X order.
  This selects path traversal within the beat; it does not change paint order
  or recover a writer's original pen movements.

Keep choreography out of figure renderers, schemas, classifier rules, and spec
prompts. Do not add numeric order attributes to paths or per-board animation
overrides. Annotation target IDs describe what can be referenced; animation
part names describe reveal groups and are a separate contract. Annotations
already follow the completed base for every type.

Check a rendered board through `applyDrawingAnimation`, including titled and
untitled cases, whole-base fallback, and multiple groups where applicable.
Verify meaningful order, complete coverage, and no duplicate animation. Follow
[policy-test.ts](./policy-test.ts); when scheduling or visibility changes, also
check final artwork and backward seeking with [browser-test.ts](./browser-test.ts).

## Shared annotations

`ANNOTATION_ANIMATION_POLICIES` in `policy.ts` owns the shared sequences:

- Callout: indicator (connector and any arrowhead) draws in document order,
  then the label writes in document order.
- Group: bracket draws first, then its optional label writes. Without a label
  there is only the indicator beat.
- Number: digits write, following the supplied target order.
- Highlight and strikeout: retain their existing stroke treatment.

Renderers identify `<g data-annotation-part="indicator">` and
`<g data-annotation-part="text">`; the policy orders them. During animated
export only, `text.ts` creates glyph paths from the same bundled font and
measured advances as the original text. Text-figure `writing` parts use the same glyph conversion. The existing mask engine
writes those paths, then restores the original live text for exact final
rendering. Static output is unchanged. Titles remain visible throughout.

Optional `figureSpeeds` replaces the corresponding default by figure type:

```ts
applyDrawingAnimation(svg, {
  speed: 1.25,
  textSpeed: 1.25,
  markSpeed: 1.25,
  figureSpeeds: {
    text: { textSpeed: 1.5 },
    math_expressions: { textSpeed: 1.0 },
  },
});
```

Overrides also apply to the figure's annotations. Omitted categories/types and
untagged SVGs use the global defaults. Values must be finite and positive.
Global `speed` still multiplies these rates: math at 1.0 above is 1.25× baseline.
Instant holds are unchanged by per-figure rates. Explicit `duration` still fits
the entire board into the requested slot, making these relative speed weights.

`speed` scales the entire timeline. `textSpeed` and `markSpeed` are additional
positive multipliers, defaulting to 1. For example, keep `speed: 1.25` and
`textSpeed: 1`, and set `markSpeed: 2` to halve mark drawing time while retaining
the current writing durations. Mark speed covers connectors, brackets,
highlights, strikeouts, and non-text figure paths. Math base content and
outlined annotation and text-figure writing use text speed; text-figure boxes
use mark speed. Instant holds are unaffected by these
extra multipliers. Writing and beat-transition gaps retain their existing timing.
Between graphical marks, `gap` includes bounded pen travel and follows `markSpeed`.
Internal pen-lift `strokeGap` follows the relevant writing/mark multiplier.
An explicit `duration` fits everything into one fixed total, so in that mode
these multipliers change relative allocation rather than independent timings.
The board execution defaults are at the `applyDrawingAnimation` call in
`../index.ts`; these are code options, not generated-spec fields.

## Drawing engine and timing

Writing and graphics share the same reveal machinery, with separate motion:

- **Writing** (MathJax paths, math/text bases, and outlined annotation text)
  keeps its existing routes, constant drawing speed, and pen-lift timing.
- **Graphics** use `markMotion: "natural"` by default. A shared arc-length
  profile eases into and out of each stroke and slows around turns. It is
  independent of SVG point density and deterministic when replayed or scrubbed.
  Variable-width skeleton brushes share one profile for the whole stroke.
- Long graphical strokes move more briskly: the natural ink duration per
  stroke is `0.08 + 0.38 * sqrt(length / 100)` seconds before speed multipliers.
  This gives short marks time to register without making a large circle take
  several seconds. Lift pauses grow with travel distance, capped at four times
  the configured gap. Stroke direction, path order, artwork, and teaching beats
  remain as supplied by the renderer and policy.
- Filled graphical fallbacks retain a wipe, now with eased movement. Dashed
  artwork keeps its original gaps while the pen follows the underlying path;
  individual dashes are not yet separate pen gestures. No new wobble is added.

Use `markMotion: "linear"` to compare with the previous graphical timing.
Generate the playable before/after comparison with
`deno run --no-lock --allow-read --allow-write animation/generate-natural-preview.ts`,
then open [output/natural-preview.html](./output/natural-preview.html). It supports
both natural durations and matching durations to isolate the movement profile.

- **Filled outlines:** flatten geometry, rasterize with its nonzero/evenodd fill
  rule, thin with Zhang–Suen, clean junctions, trace the skeleton, and estimate
  widths from a distance transform. Small animated brush segments reveal the
  original artwork along these routes.
- **Stroked shapes:** follow their existing geometry directly, splitting
  compound paths at pen lifts. Supported elements are paths, lines, circles,
  ellipses, rectangles (including rounded corners), polylines and polygons.
- **Fallback:** broad solid fills, failed centerline extraction and decorated
  shapes with markers/filters/non-scaling strokes use a rectangular wipe.
  `data-drawing-method` and `data-drawing-fallback` record the decision.
- **Timing:** within a stroke beat, paths follow reading order by default or
  document order when its policy requests it. Within an element, strokes run
  sequentially. Drawing time is
  allocated by distance in board coordinates for writing/linear motion, and by
  gesture length as described above for natural graphics, with explicit pauses. `speed`
  (default 1) multiplies that whole timeline, including gaps, the same way
  Tegaki studio's 1x / 1.5x control does. `duration` instead fits the clip to a
  fixed length and leaves gap lengths unchanged; it cannot be combined with
  `speed`. `duration` must exceed the sum of pauses. Without either option,
  writing/linear mode uses 100 board units per second; wipe mode keeps 0.12 seconds per
  element plus gaps.

`rowTolerance` overrides the default of half the median element height, in root
SVG units. Groups marked `data-drawing="static"` remain visible immediately.
Existing artwork IDs, transforms, masks and clips remain intact. Additional
wrapper groups carry the animation and retain the original paint order. At each
item's completion its reveal mask is removed, preserving the exact source
artwork (including subpixel edges missed by rasterization). The root records the
start and duration in `data-drawing-start` / `data-drawing-duration`.

## Scope of this experiment

Stroke recovery estimates a plausible route, not the original writer's stroke
order. Crossings can reveal adjacent ink early; small rasterization leftovers
can appear at completion. This is most useful for thin, handwritten outlines.
Broad fills retain the simpler wipe. Skeletal routes are generated at bounded
raster resolution, so tiny details may require increasing `resolution`.

This is intended for trusted, static SVG output with numeric geometry and SVG
transform attributes. Shared annotation writing supports the renderer's plain
text with numeric positions/font sizes. Other live text still appears when
its host is revealed; choosing `stroke` alone does not outline it. Use instances,
CSS transforms, and stylesheet geometry are not processed. Wrappers can affect
CSS child/sibling selectors. This function does not
sanitize SVG input. Invalid geometry/timing throws rather than silently failing.

## Playback and Remotion

Standalone SVGs autoplay. For external control, mount the SVG inline, call
`svgElement.pauseAnimations()`, then `svgElement.setCurrentTime(seconds)`.
Everything is explicitly timed, including pen lifts and final mask removal, so
backward and out-of-order seeks work. Whiteboard-video / Remotion can later
trigger or seek this timeline; that adapter is not included here.

Use a distinct `idPrefix` per inline instance. Original artwork IDs must also be
unique when they are referenced across multiple inline SVGs.

## Verification and examples

From this directory's parent (`whiteboard/`):

```sh
deno test --no-lock --allow-read animation/index-test.ts animation/motion-test.ts animation/policy-test.ts execution-test.ts render/index-test.ts
deno test --no-lock --allow-all animation/browser-test.ts
deno run --no-lock --allow-read --allow-write animation/generate-preview.ts
```

The browser test uses installed Chrome (set `CHROME_PATH` on other systems). It
compares PNGs for a blank start, partial drawing, exact final artwork and
backward seeking for equations and shapes, plus framework-before-series
visibility and a static title on a split chart. Preview generation writes
`example.svg`, `shapes.svg` and `preview.html`; the HTML provides play/pause and
scrubbing.

Selected Tegaki geometry stages are vendored under `vendor/tegaki`, with their
MIT license and pinned source revision. The SVG parser/serializer and path
parser are pinned dependencies; Tegaki's font pipeline and React renderer are
not used.

## Single-pass marker ink

Handwritten solid outlines are variable-width filled silhouettes. Their
`data-marker-centerline` path and `data-marker-width` coverage let the animation
follow the original gesture once, including transforms. Do not animate the
inner/outer silhouette contours or infer a skeleton for these marks. Native
strokes (including dashed borders) and font glyph recovery retain their existing
paths. The marker's width variation is fixed in the artwork, so seeking never
changes the ink and completion restores exactly the static SVG.

The shared style control is `HAND_DRAWING.roughness` in `render/theme.ts`, with a
per-board `{ roughness }` override. See `render/marker-gallery.ts` for the
interactive style and playback preview.

Geometry corner dots reveal whole as their first construction stroke reaches them,
using geometric progress (`data-geometry-points`) and the stroke's motion profile.
Dots retain their paint order above the construction. Unconnected points retain
an explicit point beat; labels and property markings still follow construction.

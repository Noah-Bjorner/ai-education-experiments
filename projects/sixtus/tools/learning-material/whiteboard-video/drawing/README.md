# Drawing animation

`applyDrawingAnimation(svg, options?)` runs on the server and returns an SVG
string with embedded, seekable SMIL animations. It requires no browser or React
at generation time. Open [preview.html](./preview.html) for a playable
comparison of the new stroke masks, the original wipe, and general shapes.

```ts
import { applyDrawingAnimation } from "./drawing/index.ts";

const animatedSvg = applyDrawingAnimation(svgString, {
  mode: "strokes", // default; "wipe" retains the original effect
  speed: 1.5, // 1x natural pace; omit duration to use this
  startTime: 0,
  gap: 0.025, // between elements
  strokeGap: 0.04, // pen lifts within an element
  resolution: 256, // skeleton bitmap size; integer 64–512
  idPrefix: "equation-1",
});

const staticSvg = applyDrawingAnimation(svgString, { enabled: false });
```

## How it works

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
- **Timing:** elements are arranged into approximate reading rows, then sorted
  left to right. Within an element, strokes run sequentially. Drawing time is
  allocated by distance in board coordinates, with explicit pauses. `speed`
  (default 1) multiplies that whole timeline, including gaps, the same way
  Tegaki studio's 1x / 1.5x control does. `duration` instead fits the clip to a
  fixed length and leaves gap lengths unchanged; it cannot be combined with
  `speed`. `duration` must exceed the sum of pauses. Without either option,
  stroke mode uses 100 board units per second; wipe mode keeps 0.12 seconds per
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
transform attributes. Live text, use instances, CSS transforms and stylesheet
geometry are not processed. Convert text/use instances to paths upstream when
needed. Wrappers can affect CSS child/sibling selectors. This function does not
sanitize SVG input. Invalid geometry/timing throws rather than silently failing.

## Playback and Remotion

Standalone SVGs autoplay. For external control, mount the SVG inline, call
`svgElement.pauseAnimations()`, then `svgElement.setCurrentTime(seconds)`.
Everything is explicitly timed, including pen lifts and final mask removal, so
backward and out-of-order seeks work. A Remotion adapter must seek from the
frame and finish updating before capture; that adapter is not included here.

Use a distinct `idPrefix` per inline instance. Original artwork IDs must also be
unique when they are referenced across multiple inline SVGs.

## Verification and examples

From this directory's parent:

```sh
deno test --no-lock --allow-read drawing/index-test.ts
deno test --no-lock --allow-all drawing/browser-test.ts
deno run --no-lock --allow-read --allow-write drawing/generate-preview.ts
```

The browser test uses installed Chrome (set `CHROME_PATH` on other systems). It
compares PNGs for a blank start, partial drawing, exact final artwork and
backward seeking, for both the equation and shapes. Preview generation writes
`example.svg`, `shapes.svg` and `preview.html`; the HTML provides play/pause and
scrubbing.

Selected Tegaki geometry stages are vendored under `vendor/tegaki`, with their
MIT license and pinned source revision. The SVG parser/serializer and path
parser are pinned dependencies; Tegaki's font pipeline and React renderer are
not used.

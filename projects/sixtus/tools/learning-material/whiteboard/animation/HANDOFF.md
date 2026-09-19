# Animation policy handoff

The optional-part policy is implemented. Use [README.md](./README.md#figure-animation-policy)
for the maintained contract and [policy.ts](./policy.ts) for current recipes.
The next phase is improving how the strokes draw, with the owner reviewing real
boards. Keep that work separate from choosing the teaching beats.

Repo: `edu_experiments`, tool: `projects/sixtus/tools/learning-material/whiteboard`.
Deno. Do not commit unless asked.

## Decisions to preserve

- Draw the parts whose progression helps explain the idea. Show dense
  scaffolding together. Whole-base animation is the default; split only when
  a few meaningful parts improve the explanation.
- Renderers identify content; `FIGURE_ANIMATION_POLICIES` owns treatment and
  step order. Each supported type has an explicit base policy and may have a
  `split` recipe activated by `whenPart`.
- A beat can contain several tagged SVG groups. Split groups replace the base
  beat and cover its non-static artwork exactly once, including labels. The
  planner rejects uncovered artwork, non-group hosts, and overlapping hosts.
- Figures follow spec order. Each figure completes all its base beats, then
  its annotations in index/sequence order. No per-board choreography field
  or numeric path-order attributes.
- Line charts currently reveal framework/legend together, then draw
  plotted segments in data order, one series at a time, up to three series.
  Four or more series reveal all lines and dots together instantly after the
  framework (`maxAnimatedParts: 3` in policy); annotations still animate. The first dot appears
  when its series begins; each later dot appears whole at its incoming segment's
  end. Semantic `data-series-point` / `data-series-segment` tags link endpoints;
  policy expands these into zero-hold reveals and segment stroke beats. Other chart bases appear whole; math retains a whole-base stroke beat.
  Text figures write their body, then draw a solid box (10-unit padding);
  questions use blue text and blue borders. Geometry draws construction → points →
  labels/measurements → property markings, then annotations. More subdivisions remain optional.
- `instant` means hidden until its beat. Only explicitly static content such
  as board and figure titles (including decorations) is visible from time zero.
- Untagged SVGs keep their previous geometry-only reading order. Animation
  remains a last-step rewrite of trusted static SVG, not a sanitizer.
- Preserve artwork IDs, transforms, masks/clips, paint order, final appearance,
  and backward seeking through explicit SMIL times.

## Remaining drawing/timing work

- Timing still depends on path length at 100 board units/second. Large
  annotation circles can take many seconds; instant holds are about 0.2s at
  natural speed. Runtime uses `speed: 1.25`. Beat duration caps and separate
  hold controls are not implemented.
- Callouts and groups draw indicators before writing their labels; numbers
  write in target order. Annotation writing uses bundled outlines temporarily
  and restores live text at completion. Other live text (such as text figures)
  still appears at host reveal.
- `textSpeed` and `markSpeed` independently scale writing and other drawing,
  both defaulting to 1. Overall `speed` is still 1.25 in board execution.
  See README.md for gaps and fixed-duration behavior.
- Handwritten marks use one silhouette with an authored centerline. Marker
  metadata bypasses skeleton recovery, so each outline draws once. Font glyphs
  still use skeleton recovery, which estimates plausible writing routes.
- Keep refinements in the appropriate shared drawing/timing layer; avoid
  hiding them in renderer-specific animation choreography.
- Remotion integration, voiceover sync, per-board overrides, and geometry
  givens-versus-constructions remain future work unless requested.

## Verification and entry points

From `whiteboard/`:

```sh
deno test --no-lock --allow-read animation/index-test.ts animation/policy-test.ts execution-test.ts render/index-test.ts
deno test --no-lock --allow-all animation/browser-test.ts
deno run --no-lock --allow-read --allow-write animation/generate-policy-preview.ts
```

`policy-test.ts` covers type policies, optional parts, coverage errors, line data
order, and actual chart output. The browser test checks split-beat visibility,
backward seeking, and final artwork as well as untagged fixtures. The mixed
policy preview currently uses a question, pie chart, annotations, and equation;
it does not demonstrate the line-chart split.

`index.ts` schedules/reveals beats; `stroke-plan.ts`, `masks.ts`, `geometry.ts`,
and `vendor/tegaki/` implement the drawing engine. `../render/graphs.ts` stamps
line-chart parts; `../render/titles.ts` stamps figure titles. Shared preparation
and composition stamp base and figure wrappers; annotations already carry
their own identity/order tags. Chat whiteboards still omit animation and remain
static.

Geometry corner dots reveal whole as their first construction stroke reaches them,
using geometric progress (`data-geometry-points`) and the stroke's motion profile.
Dots retain their paint order above the construction. Unconnected points retain
an explicit point beat; labels and property markings still follow construction.

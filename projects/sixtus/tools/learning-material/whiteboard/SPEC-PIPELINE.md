# Classifier → spec → render

The active pipeline is organized by stage:

```text
whiteboard/
├── index.ts              # Connects the stages; public convenience API
├── classifier.ts         # Classification, score validation, figure selection
├── spec/
│   ├── index.ts          # generateWhiteboardSpec(input, selection)
│   ├── schema.ts         # Selected-type generation schema
│   ├── prompt.ts         # Complete-board instructions
│   ├── validation.ts     # Spec and annotation checks, automatic placement
│   ├── provider.ts       # LLM adapter and model selection
│   ├── repair.ts         # Content-preservation checks for corrections
│   └── eval.ts           # Opt-in live evaluation
├── archive/              # Legacy pipeline and historical reference files
├── figures/              # Shared figure definitions and annotation targets
├── render/               # Existing visual rendering stage
├── animation/            # Optional handwriting SMIL rewrite of the finished SVG
└── schema.ts             # Public input, placed spec, and result contracts
```

Read `index.ts` for orchestration, `classifier.ts` for availability decisions,
`spec/index.ts` for content generation, and `render/index.ts` for drawing.
`generateWhiteboardSpec(input, selection)` is independently callable; it
never calls the classifier. Its optional dependencies argument supports offline
spec-stage testing. `whiteboardSpec(input)` combines classification and spec
generation. `executeWhiteboard(input)` runs the full pipeline through rendering
and returns real SVG or an uploaded URL. Both the HTTP route and
learning-material tool use this entry point.

The old planner/executor files and their generation tests live in `archive/`.
The learning-material tool now imports `index.ts`. Archived implementations
remain runnable for reference, and some renderer regression tests still use the
old prompts. `archive/prompt-bank.ts` and `archive/tmp.md` are historical
reference files with no current code references. See `archive/README.md` for the
inventory.

`whiteboardSpec(input)` returns a `WhiteboardSpec`. It validates input,
classifies once, generates ordered content, validates the content, assigns a
bottom-anchor chain, prepares every figure with the production renderer to
confirm it can be drawn, and returns the board. It does not upload or export.
`input.mode` chooses the existing fast or smart model.

Classification probabilities must be finite and between 0 and 1. Figure
selection uses a strict `> 0.6` threshold; board titles use `> 0.7`. If no type
qualifies, the pipeline throws `NO_FIGURE_MATCH`. Classification errors are
propagated. The
generation schema permits only selected types, requires IDs and annotation
arrays, and excludes board placement fields. Standalone schemas remain
compatible.

`whiteboardSpecWith` accepts classifier, generator, and optional report
callbacks for offline testing. A successful request makes one classification
call and one board generation call. SDK transport retries are disabled. Invalid
structured output or spec content receives at most one complete-board
correction. Refusals and operational errors are not content corrections.
Corrections cannot remove figures, elements, or annotations, or change fields
outside reported issue scopes. Stable IDs are retained except where an ID issue
requires a correction; dependent references may follow that correction. Coarse
geometry validation issues apply to the affected figure. Malformed JSON without
a recoverable object cannot be compared for preservation; the correction still
receives the original output and goal.

`WhiteboardSpecError.issues` contains paths and semantic diagnostics, including
compatible annotation target IDs. Selection/schema/validation modules do not
require credentials or network access. Semantic targets describe eligibility,
not measured visibility: clipping, LaTeX compilation, font glyphs, callout
space, and collisions are checked by preparing each figure after validation.
Content that needs more room than the default allocation grows the figure
(up to a ceiling) without a correction; content that still cannot be drawn is
reported with codes such as `CONTENT_DOES_NOT_FIT`, `UNSUPPORTED_GLYPH`, and
`INVALID_LATEX`, scoped to the figure, and receives the same single correction.
Internal rendering failures are operational and are not corrected. Tests compare
semantic catalogs with renderer targets on known visible examples to detect
drift.

## Verification

```sh
deno test --frozen index-test.ts
deno test --frozen --allow-read execution-test.ts
deno test --frozen --allow-read spec/targets-test.ts
deno test --frozen --allow-read --allow-env --allow-sys spec/provider-test.ts
```

The provider adapter test imports the AI SDK, which needs local environment and
system access, but makes no network calls and needs no credentials.

Live evaluation is opt-in and makes paid provider calls. The runner tests all
seven figure families plus multi-figure goals in both modes and writes specs,
usage, validation events, and failure diagnostics for review:

```sh
deno run --frozen --allow-sys --allow-env --allow-read --allow-write --allow-net spec/eval.ts --live output/spec-eval
```

Without `--live`, it makes no calls and writes no files. Review the saved boards
for educational correctness; schema success does not establish that the teaching
content or mathematical reasoning is correct.

## Run each stage independently

```ts
// Full pipeline; hosted URL is the default.
const { url } = await executeWhiteboard({ goal, mode: "fast" });

// Full pipeline, with no storage dependency.
const { svg } = await executeWhiteboard({ goal, mode: "fast", format: "svg" });

// Inspect or tune one stage at a time.
const classification = await classifyWhiteboardGoal(goal);
const spec = await generateWhiteboardSpec(
  { goal, mode: "fast" },
  selectFigures(classification),
);
const rendered = await executeWhiteboard({ ...spec, format: "svg" });
```

The HTTP endpoint accepts the same goal request or
`{ title, figures, format?,
orientation?, fontMode?, animation? }` saved-spec request. Saved specs skip
classification and generation. Generated boards default to portrait packing;
saved specs preserve their anchor placement unless an orientation is explicitly
supplied. Orientation remains a renderer option, not model-generated content.

SVG output loads no storage client or credentials. URL output uploads the
completed SVG to the existing Cloudflare R2 helper under `sixtus/whiteboards`;
failed rendering never uploads, and failed uploads propagate instead of
returning a placeholder. URL output requires the existing Cloudflare/R2
environment configuration. Generated requests also need classifier and
selected-model credentials.

Spec corrections remain inside the spec stage, which now includes the
deterministic preparation check, so a generated board that reaches execution
renders. Execution-stage render failures can only come from saved specs and are
reported explicitly; there is no second model-driven correction loop. HTTP
errors retain actionable spec or render diagnostics.

The CLI runs the full pipeline:

```sh
deno run --frozen --allow-read --allow-env --allow-net --allow-sys index.ts "Solve 2(x + 3) = 10" fast url
```

Use `svg` as the final argument for inline SVG output instead of uploading.

Font delivery is controlled by optional `fontMode: "embedded" | "hosted"` on
both goal requests and saved-spec requests, or on `renderWhiteboardSvg` options.
The default, `"embedded"`, keeps the SVG self-contained. `"hosted"` references
`https://static.noahbjorner.com/sixtus/fonts/shantell-sans-math-medium.woff2` in
each exported stage instead of including font bytes. Measurements continue using
the bundled metrics. Hosted fonts require a viewer that permits external font
loading. The learning-material tool omits `fontMode` from its agent input and
pins it to `"embedded"` in `WHITEBOARD_CHAT_INPUT`.

Optional `animation: "static" | "animated"` is also accepted on goal and
saved-spec requests. The default is static. `"animated"` rewrites the finished
SVG in `animation/` with a handwriting drawing animation after rendering and
before upload. The rewrite lives with the SVG because it is part of the
document; later video work can pause and seek that timeline when it wants
parts to appear. The learning-material tool omits `animation` so chat
whiteboards stay static.

Animation treatment and order are owned by `FIGURE_ANIMATION_POLICIES` in
`animation/policy.ts`, not by the spec model. Figures follow spec order; each
base is one beat or an optional sequence of semantic parts, then its annotations.
Prefer showing dense scaffolding together and drawing the key explanatory parts.
Line charts currently appear as framework, then draw their plotted data; other
types retain their whole-base policies. New figures must register an explicit
policy alongside renderer dispatch. See the
[animation contract](animation/README.md#figure-animation-policy) and
[renderer checklist](render/DESIGN.md#adding-a-new-visualization-type).

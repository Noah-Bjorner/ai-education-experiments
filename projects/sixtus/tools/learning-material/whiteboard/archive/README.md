# Historical whiteboard code

The current classifier → spec implementation starts at `../index.ts`,
`../classifier.ts`, and `../spec/index.ts`. This directory preserves the older
implementations and reference material without mixing them into that flow.

## Legacy implementations and regression support

- `index-old-1.ts`: planner followed by per-figure generation. Retained for
  reference; the learning-material tool now uses `../index.ts`.
- `generation.ts`: preparation, repair, composition, and upload orchestration
  used by `index-old-1.ts`.
- `generation-test.ts`: offline regression tests for that legacy pipeline.
- `prompt-old.ts`: prompts used by both old entry points and several renderer
  contract tests.

These files are grouped here because they belong to the old architecture, **not
because they are all unused**. Their imports remain functional. Run the legacy
regression tests from the whiteboard directory with:

```sh
deno test --frozen --allow-read archive/generation-test.ts
```

## Reference-only files

- `index-old-2.ts`: earlier direct-spec implementation; no current importers
  found.
- `prompt-bank.ts`: manually curated goals and old placement expectations; no
  current importers found. Current live evaluation is `../spec/eval.ts`.
- `tmp.md`: captured prompt text; no current references found.

Renderer galleries, example fixtures, font assets, and tests remain under
`../render/`: they are current verification tools or dependencies, even when
they are run manually rather than imported by the application.

# V2 Spec Renderer

The v2 render path removes per-run bundling of arbitrary TSX by using a stable Remotion app
that renders JSON scene specs via `inputProps`.

## Tasks

| Task ID | Input | Bundling |
| --- | --- | --- |
| `render-remotion-video` | `tsxUrl` + dimensions | Bundles generated TSX every run |
| `render-remotion-spec` | JSON `spec` | Uses pre-bundled stable app from deploy |

## Spec contract

Defined in [`client/spec-contract.ts`](../client/spec-contract.ts).

Supported element types:
- `text` — labels and headings with optional stroke for readability
- `rect` — boxes, bars, panels
- `circle` — points, nodes, markers
- `line` — axes, arrows, connectors
- `group` — nested elements with shared visibility window

Each element supports optional `startFrame`, `endFrame`, and `opacity`.

## Stable Remotion app

Source lives in [`remotion-render/src/remotion/`](remotion-render/src/remotion/):
- `Root.tsx` — composition with `calculateMetadata()` driven by spec props
- `SpecVideo.tsx` — renders validated spec elements
- `index.ts` — Remotion entry point

During deploy, `scripts/prebundle-stable-app.mjs` bundles the stable app and writes
`.remotion/stable-serve-url.txt`. The `render-remotion-spec` task reads that path at runtime.

## Triggering a spec render

```ts
import { triggerRemotionSpecRender } from "../../trigger/client/render.ts";

const { videoUrl } = await triggerRemotionSpecRender({
  input: {
    spec: {
      background: "#f8fafc",
      width: 1200,
      height: 800,
      fps: 30,
      durationInFrames: 300,
      elements: [
        {
          type: "text",
          text: "Supply and Demand",
          x: 600,
          y: 80,
          fontSize: 56,
          textAlign: "center",
        },
      ],
    },
  },
  options: {
    machine: "medium-2x",
  },
});
```

## Migration path

1. Keep `render-remotion-video` for current TSX-based demonstrations.
2. Extend the spec element set as needed (paths, images, animated values).
3. Add a JSON-generation prompt alongside `PROMPT.ts`.
4. Switch `createDemonstration()` to call `triggerRemotionSpecRender()` once output quality is acceptable.
5. Retire TSX generation when schema coverage is sufficient.

## Render tuning env vars

Set these on the Trigger.dev production environment to benchmark render speed:

| Variable | Default | Purpose |
| --- | --- | --- |
| `REMOTION_RENDER_CONCURRENCY` | `4` | Frame render parallelism |
| `REMOTION_X264_PRESET` | `veryfast` | H.264 encoder speed (`ultrafast`, `veryfast`, `fast`, `medium`) |
| `REMOTION_BUNDLE_CACHE_DIR` | `/tmp/remotion-bundle-cache` | Webpack cache for TSX bundling |

Compare `renderMs`, `selectCompositionMs`, and `totalWorkerMs` in task logs after changes.

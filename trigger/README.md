# Trigger.dev

This folder holds everything related to our [Trigger.dev](https://trigger.dev) background tasks.
There are two render tasks:

- `render-remotion-video` — renders generated TSX (current demonstrate tool path)
- `render-remotion-spec` — renders JSON scene specs via a pre-bundled stable Remotion app (v2 path)

See [SPEC_RENDERER.md](./SPEC_RENDERER.md) for the v2 spec renderer design and migration path.

## Folder layout

```
trigger/
├── README.md                ← you are here
├── SPEC_RENDERER.md         ← v2 JSON spec renderer design
├── client/                  ← code that *triggers* runs (runs in our Deno app)
│   ├── contract.ts          ← TSX render input/output types + validation
│   ├── spec-contract.ts     ← JSON spec render types + validation
│   └── render.ts            ← triggerRemotionRender() / triggerRemotionSpecRender()
└── remotion-render/         ← the Trigger.dev *project* (the task that runs on their infra)
    ├── package.json         ← npm project + the `dev` script
    ├── trigger.config.ts    ← project ref, build config, runtime, retries
    ├── scripts/             ← deploy-time prebundle scripts
    └── src/
        ├── trigger/         ← task definitions (this is what gets deployed)
        ├── render/          ← Remotion rendering logic
        └── remotion/        ← stable v2 Remotion app source
```

There are two distinct sides:

- **`remotion-render/`** is the Trigger.dev project. The task code here is bundled and shipped
  to Trigger.dev, where it executes.
- **`client/`** is just our caller. It hits the Trigger.dev REST API with a `TRIGGER_SECRET_KEY`
  to start a run and wait for the output. It is **not** deployed to Trigger.dev.

## IMPORTANT: always `cd` into the project first

All Trigger.dev CLI commands (`dev`, `deploy`, `login`, `env …`) must be run from inside the
project folder that contains `package.json` and `trigger.config.ts`. That folder is
**`trigger/remotion-render/`**, not the repo root.

If you run a command from the repo root you'll get:

```
X Error: Cannot find matching package.json in /…/edu_experiments or parent directories
```

The CLI walks up the directory tree looking for a `package.json` to discover the project,
its config, and its dependencies. There is no `package.json` at the repo root, so it fails.

```bash
cd trigger/remotion-render
```

Do that first, then run any of the commands below.

## How Trigger.dev works (mental model)

Trigger.dev runs your tasks on **their** infrastructure. You define a task in code and ship that
code to them. Code reaches their servers in one of two ways, mapping to two kinds of environment:

| Environment          | How code gets there                     | Where it runs                          | Use for                |
| -------------------- | --------------------------------------- | -------------------------------------- | ---------------------- |
| **DEV**              | `npx trigger.dev@latest dev` (your Mac) | On **your machine** (proxied via them) | Local dev / debugging  |
| **STAGING / PROD**   | `npx trigger.dev@latest deploy`         | On **Trigger.dev's cloud**             | Real usage             |

Key insight: the DEV environment does **not** run on their infra. While `dev` is running, your
laptop is the worker. Close that terminal and the dashboard shows
"Your local dev server is not connected to Trigger.dev" — that's just DEV being offline, not an error.

Which environment a run lands in is decided by the **`TRIGGER_SECRET_KEY`** used to trigger it:

- `tr_dev_…`  → DEV   → needs your local `dev` server running.
- `tr_prod_…` → PROD  → runs on their cloud (after you've `deploy`ed).

## Commands

All run from `trigger/remotion-render/`.

### Log in (first time on a machine)

```bash
npx trigger.dev@latest login
```

### Develop locally

```bash
npm run dev
# same as: npx trigger.dev@latest dev
```

Starts the local dev server. Your machine becomes the worker for the DEV environment. Task code
changes are picked up live — no redeploy needed while developing.

### Deploy to production

```bash
npx trigger.dev@latest deploy
```

Bundles `src/trigger/` + applies `trigger.config.ts`, builds a container image, and ships it to
Trigger.dev's cloud. Use this for the **first** deploy and for **every update** thereafter.

Deploy to staging instead:

```bash
npx trigger.dev@latest deploy --env staging
```

Notes on deploying:

- **Deploys are versioned.** New runs use the new version; runs already executing finish on the
  version they started with (an in-flight render won't be killed by a deploy).
- **It ships your working files**, not git state — save before deploying.
- **Redeploy when** task code, dependencies, or `trigger.config.ts` change. You do **not** need to
  redeploy just to change the payload sent at trigger time (that's runtime data).

### Environment variables for deployed tasks

Deployed (PROD/STAGING) tasks do **not** read your local `.env`. Set their env vars separately —
in the dashboard (Project → Environment Variables) or via CLI:

```bash
npx trigger.dev@latest env set MY_VAR value --env prod
```

This matters here because the render task needs R2 credentials at runtime; those must exist in the
production environment, not just on your laptop.

## Triggering a render from our app

`client/render.ts` exposes:

- `triggerRemotionRender()` — TSX path (current)
- `triggerRemotionSpecRender()` — JSON spec path (v2)

Both:

1. Read `TRIGGER_SECRET_KEY` from the environment.
2. POST to the Trigger.dev task trigger API.
3. Poll the run (1s while executing, 3s while queued) until it completes and return the `videoUrl`.

Render tasks log stage timings (`fetchTsxMs`, `bundleMs`, `selectCompositionMs`, `renderMs`, etc.)
for benchmarking. Tune worker speed via Trigger env vars documented in [SPEC_RENDERER.md](./SPEC_RENDERER.md).

Set `TRIGGER_SECRET_KEY` to a `tr_prod_…` key to run on Trigger.dev's cloud, or a `tr_dev_…` key
(with `npm run dev` running) to execute locally.

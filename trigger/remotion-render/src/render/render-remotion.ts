import { bundle } from "@remotion/bundler";
import {
  ensureBrowser,
  renderMedia,
  selectComposition,
} from "@remotion/renderer";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fetchTsx } from "./fetch-tsx.ts";
import { prepareTsxForRender } from "./prepare-tsx.ts";
import {
  BUNDLE_CACHE_DIR,
  REMOTION_CHROME_MODE,
  RENDER_CONCURRENCY,
  X264_PRESET,
} from "./render-config.ts";
import {
  type RenderRemotionPayload,
  type RenderRemotionResult,
  renderRemotionPayloadSchema,
} from "./types.ts";
import { uploadVideo } from "../storage/r2.ts";

const COMPOSITION_ID = "Main";

type RenderRemotionVideoOptions = {
  runId?: string;
};

function buildRootSource(payload: RenderRemotionPayload): string {
  return `import React from "react";
import { Composition } from "remotion";
import RemotionVideo from "./Video";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="${COMPOSITION_ID}"
        component={RemotionVideo}
        durationInFrames={${payload.durationInFrames}}
        fps={${payload.fps}}
        width={${payload.width}}
        height={${payload.height}}
      />
    </>
  );
};
`;
}

function buildIndexSource(): string {
  return `import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
`;
}

export async function renderRemotionVideo(
  input: RenderRemotionPayload,
  options: RenderRemotionVideoOptions = {},
): Promise<RenderRemotionResult> {
  const payload = renderRemotionPayloadSchema.parse(input);
  const workerStartedAt = Date.now();
  const workDir = await mkdtemp(path.join(os.tmpdir(), "remotion-render-"));

  let fetchTsxMs = 0;
  let prepareTsxMs = 0;
  let bundleMs = 0;
  let selectCompositionMs = 0;
  let renderMs = 0;
  let uploadMs = 0;

  try {
    await ensureBrowser({ chromeMode: REMOTION_CHROME_MODE });

    const fetchStartedAt = Date.now();
    const rawTsx = await fetchTsx(payload.tsxUrl);
    fetchTsxMs = Date.now() - fetchStartedAt;

    const prepareStartedAt = Date.now();
    const preparedTsx = prepareTsxForRender(rawTsx);
    await writeFile(path.join(workDir, "Video.tsx"), preparedTsx, "utf8");
    await writeFile(path.join(workDir, "Root.tsx"), buildRootSource(payload), "utf8");
    await writeFile(path.join(workDir, "index.ts"), buildIndexSource(), "utf8");
    prepareTsxMs = Date.now() - prepareStartedAt;

    await mkdir(BUNDLE_CACHE_DIR, { recursive: true });

    const bundleStartedAt = Date.now();
    const serveUrl = await bundle({
      entryPoint: path.join(workDir, "index.ts"),
      webpackOverride: (config) => {
        config.cache = {
          type: "filesystem",
          cacheDirectory: BUNDLE_CACHE_DIR,
        };
        return config;
      },
    });
    bundleMs = Date.now() - bundleStartedAt;

    const selectStartedAt = Date.now();
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps: {},
      chromeMode: REMOTION_CHROME_MODE,
    });
    selectCompositionMs = Date.now() - selectStartedAt;

    const outputPath = path.join(workDir, "output.mp4");
    await mkdir(path.dirname(outputPath), { recursive: true });

    const renderStartedAt = Date.now();
    await renderMedia({
      serveUrl,
      composition,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: {},
      chromeMode: REMOTION_CHROME_MODE,
      concurrency: RENDER_CONCURRENCY,
      x264Preset: X264_PRESET,
    });
    renderMs = Date.now() - renderStartedAt;

    const uploadStartedAt = Date.now();
    const videoUrl = await uploadVideo(outputPath, {
      temporary: true,
      name: options.runId,
    });
    uploadMs = Date.now() - uploadStartedAt;
    const { size } = await stat(outputPath);

    const totalWorkerMs = Date.now() - workerStartedAt;

    return {
      videoUrl,
      fetchTsxMs,
      prepareTsxMs,
      bundleMs,
      selectCompositionMs,
      renderMs,
      uploadMs,
      totalWorkerMs,
      sizeBytes: size,
      width: payload.width,
      height: payload.height,
      fps: payload.fps,
      durationInFrames: payload.durationInFrames,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

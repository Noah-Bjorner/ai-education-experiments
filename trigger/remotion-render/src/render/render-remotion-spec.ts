import { bundle } from "@remotion/bundler";
import {
  ensureBrowser,
  renderMedia,
  selectComposition,
} from "@remotion/renderer";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  BUNDLE_CACHE_DIR,
  REMOTION_CHROME_MODE,
  RENDER_CONCURRENCY,
  STABLE_SERVE_URL_FILE,
  X264_PRESET,
} from "./render-config.ts";
import {
  type RenderRemotionSpecPayload,
  type RenderRemotionSpecResult,
  renderRemotionSpecPayloadSchema,
} from "./types-spec.ts";
import { uploadVideo } from "../storage/r2.ts";

const COMPOSITION_ID = "Main";
const STABLE_ENTRY_POINT = path.join(
  process.cwd(),
  "src/remotion/index.ts",
);

type RenderRemotionSpecOptions = {
  runId?: string;
};

async function resolveStableServeUrl(): Promise<string> {
  try {
    const serveUrl = (await readFile(STABLE_SERVE_URL_FILE, "utf8")).trim();

    if (serveUrl) {
      return serveUrl;
    }
  } catch {
    // Fall through to runtime bundle when prebundle is unavailable (e.g. local dev).
  }

  await mkdir(BUNDLE_CACHE_DIR, { recursive: true });

  return await bundle({
    entryPoint: STABLE_ENTRY_POINT,
    webpackOverride: (config) => {
      config.cache = {
        type: "filesystem",
        cacheDirectory: BUNDLE_CACHE_DIR,
      };
      return config;
    },
  });
}

export async function renderRemotionSpecVideo(
  input: RenderRemotionSpecPayload,
  options: RenderRemotionSpecOptions = {},
): Promise<RenderRemotionSpecResult> {
  const payload = renderRemotionSpecPayloadSchema.parse(input);
  const { spec } = payload;
  const workerStartedAt = Date.now();
  const workDir = await mkdtemp(path.join(os.tmpdir(), "remotion-spec-render-"));

  let bundleMs = 0;
  let selectCompositionMs = 0;
  let renderMs = 0;
  let uploadMs = 0;

  try {
    await ensureBrowser({ chromeMode: REMOTION_CHROME_MODE });

    const bundleStartedAt = Date.now();
    const serveUrl = await resolveStableServeUrl();
    bundleMs = Date.now() - bundleStartedAt;

    const selectStartedAt = Date.now();
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps: spec,
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
      inputProps: spec,
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
      fetchTsxMs: 0,
      prepareTsxMs: 0,
      bundleMs,
      selectCompositionMs,
      renderMs,
      uploadMs,
      totalWorkerMs,
      sizeBytes: size,
      spec,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

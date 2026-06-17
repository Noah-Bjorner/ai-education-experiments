import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fetchTsx } from "./fetch-tsx";
import { prepareTsxForRender } from "./prepare-tsx";
import {
  type RenderRemotionPayload,
  type RenderRemotionResult,
  renderRemotionPayloadSchema,
} from "./types";
import { uploadVideo } from "../storage/r2";

const COMPOSITION_ID = "Main";

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
): Promise<RenderRemotionResult> {
  const payload = renderRemotionPayloadSchema.parse(input);
  const workDir = await mkdtemp(path.join(os.tmpdir(), "remotion-render-"));

  try {
    const rawTsx = await fetchTsx(payload.tsxUrl);
    const preparedTsx = prepareTsxForRender(rawTsx);
    await writeFile(path.join(workDir, "Video.tsx"), preparedTsx, "utf8");
    await writeFile(path.join(workDir, "Root.tsx"), buildRootSource(payload), "utf8");
    await writeFile(path.join(workDir, "index.ts"), buildIndexSource(), "utf8");

    const bundleStartedAt = Date.now();
    const serveUrl = await bundle({
      entryPoint: path.join(workDir, "index.ts"),
      webpackOverride: (config) => config,
    });
    const bundleMs = Date.now() - bundleStartedAt;

    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps: {},
    });

    const outputPath = path.join(workDir, "output.mp4");
    await mkdir(path.dirname(outputPath), { recursive: true });

    const renderStartedAt = Date.now();
    await renderMedia({
      serveUrl,
      composition,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: {},
    });
    const renderMs = Date.now() - renderStartedAt;

    const videoUrl = await uploadVideo(outputPath, { temporary: true });
    const { size } = await import("node:fs/promises").then((fs) =>
      fs.stat(outputPath),
    );

    return {
      videoUrl,
      renderMs,
      bundleMs,
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

import { logger, task } from "@trigger.dev/sdk";
import { renderRemotionVideo } from "../render/render-remotion";
import type {
  RenderRemotionPayload,
  RenderRemotionTaskOutput,
} from "../render/types";

export const renderRemotionVideoTask = task({
  id: "render-remotion-video",
  maxDuration: 1800,
  retry: {
    maxAttempts: 2,
  },
  run: async (payload: RenderRemotionPayload, { ctx }): Promise<
    RenderRemotionTaskOutput
  > => {
    logger.info("Starting Remotion render", {
      runId: ctx.run.id,
      tsxUrl: payload.tsxUrl,
      width: payload.width,
      height: payload.height,
      fps: payload.fps,
      durationInFrames: payload.durationInFrames,
    });

    const result = await renderRemotionVideo(payload, { runId: ctx.run.id });

    logger.info("Remotion render complete", {
      runId: ctx.run.id,
      videoUrl: result.videoUrl,
      fetchTsxMs: result.fetchTsxMs,
      prepareTsxMs: result.prepareTsxMs,
      bundleMs: result.bundleMs,
      selectCompositionMs: result.selectCompositionMs,
      renderMs: result.renderMs,
      uploadMs: result.uploadMs,
      totalWorkerMs: result.totalWorkerMs,
      sizeBytes: result.sizeBytes,
    });

    return { videoUrl: result.videoUrl };
  },
});

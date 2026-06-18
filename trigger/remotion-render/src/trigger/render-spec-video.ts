import { logger, task } from "@trigger.dev/sdk/v3";
import { renderRemotionSpecVideo } from "../render/render-remotion-spec";
import type {
  RenderRemotionSpecPayload,
  RenderRemotionSpecTaskOutput,
} from "../render/types-spec";

export const renderRemotionSpecVideoTask = task({
  id: "render-remotion-spec",
  maxDuration: 1800,
  retry: {
    maxAttempts: 2,
  },
  run: async (payload: RenderRemotionSpecPayload, { ctx }): Promise<
    RenderRemotionSpecTaskOutput
  > => {
    logger.info("Starting Remotion spec render", {
      runId: ctx.run.id,
      width: payload.spec.width,
      height: payload.spec.height,
      fps: payload.spec.fps,
      durationInFrames: payload.spec.durationInFrames,
      elementCount: payload.spec.elements.length,
    });

    const result = await renderRemotionSpecVideo(payload, { runId: ctx.run.id });

    logger.info("Remotion spec render complete", {
      runId: ctx.run.id,
      videoUrl: result.videoUrl,
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

import { logger, task } from "@trigger.dev/sdk/v3";
import type { RenderRemotionPayload } from "../render/types";

export const renderRemotionVideoTask = task({
  id: "render-remotion-video",
  maxDuration: 1800,
  retry: {
    maxAttempts: 2,
  },
  run: async (payload: RenderRemotionPayload) => {
    logger.info("Starting Remotion render", {
      tsxUrl: payload.tsxUrl,
      width: payload.width,
      height: payload.height,
      fps: payload.fps,
      durationInFrames: payload.durationInFrames,
    });

    const { renderRemotionVideo } = await import("../render/render-remotion");
    const result = await renderRemotionVideo(payload);

    logger.info("Remotion render complete", result);

    return result;
  },
});

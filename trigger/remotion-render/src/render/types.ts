import { z } from "zod";
import {
  assertAllowedTsxUrl,
  REMOTION_RENDER_LIMITS,
} from "../../../client/contract.ts";

export const renderRemotionPayloadSchema = z.object({
  tsxUrl: z.string().url().superRefine((url, ctx) => {
    try {
      assertAllowedTsxUrl(url);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Invalid tsxUrl.",
      });
    }
  }),
  width: z.number().int().positive().max(REMOTION_RENDER_LIMITS.maxWidth),
  height: z.number().int().positive().max(REMOTION_RENDER_LIMITS.maxHeight),
  fps: z.number().int().positive().max(REMOTION_RENDER_LIMITS.maxFps),
  durationInFrames: z.number().int().positive().max(
    REMOTION_RENDER_LIMITS.maxDurationInFrames,
  ),
});

export type RenderRemotionPayload = z.infer<typeof renderRemotionPayloadSchema>;

export type RenderRemotionTaskOutput = {
  videoUrl: string;
};

export type RenderStageTimings = {
  fetchTsxMs: number;
  prepareTsxMs: number;
  bundleMs: number;
  selectCompositionMs: number;
  renderMs: number;
  uploadMs: number;
  totalWorkerMs: number;
};

export type RenderRemotionResult = RenderRemotionTaskOutput &
  RenderStageTimings & {
    sizeBytes: number;
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
  };

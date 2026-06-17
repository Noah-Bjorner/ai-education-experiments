import { z } from "@zod";

export const renderRemotionPayloadSchema = z.object({
  tsxUrl: z.string().url(),
  width: z.number().int().positive().max(3840),
  height: z.number().int().positive().max(3840),
  fps: z.number().int().positive().max(60),
  durationInFrames: z.number().int().positive().max(1800),
});

export type RenderRemotionPayload = z.infer<typeof renderRemotionPayloadSchema>;

export type RenderRemotionResult = {
  videoUrl: string;
  renderMs: number;
  bundleMs: number;
  sizeBytes: number;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
};

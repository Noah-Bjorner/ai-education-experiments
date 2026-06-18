import { z } from "zod";
import {
  validateRemotionSceneSpec,
  type RemotionSceneSpec,
} from "../../../client/spec-contract.ts";
import type { RenderStageTimings } from "./types.ts";

export const renderRemotionSpecPayloadSchema = z.object({
  spec: z.unknown().transform((value, ctx) => {
    try {
      return validateRemotionSceneSpec(value);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Invalid spec.",
      });
      return z.NEVER;
    }
  }),
});

export type RenderRemotionSpecPayload = z.infer<
  typeof renderRemotionSpecPayloadSchema
>;

export type RenderRemotionSpecTaskOutput = {
  videoUrl: string;
};

export type RenderRemotionSpecResult = RenderRemotionSpecTaskOutput &
  RenderStageTimings & {
    sizeBytes: number;
    spec: RemotionSceneSpec;
  };

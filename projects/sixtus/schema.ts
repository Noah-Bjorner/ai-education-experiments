import { z } from "@zod";

import { sixtusModelSchema } from "./models/index.ts";
import {
  TUTOR_STYLE_DEFAULT,
  TUTOR_STYLE_MAX,
  TUTOR_STYLE_MIN,
} from "./chat/tutor-style.ts";
import type { SixtusUIMessage } from "./types.ts";

const messageRoleSchema = z.enum(["system", "user", "assistant"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUIMessage(value: unknown): value is SixtusUIMessage {
  if (!isRecord(value)) {
    return false;
  }

  const { id, role, parts } = value;

  return typeof id === "string" &&
    messageRoleSchema.safeParse(role).success &&
    Array.isArray(parts) &&
    parts.every((part) => isRecord(part) && typeof part.type === "string");
}

export const sixtusRequestSchema = z.object({
  messages: z.array(
    z.custom<SixtusUIMessage>(
      isUIMessage,
      "Expected an AI SDK UIMessage with id, role, and parts.",
    ),
  ),
  tutor_style: z.number().int().min(TUTOR_STYLE_MIN).max(TUTOR_STYLE_MAX)
    .default(TUTOR_STYLE_DEFAULT),
  model: sixtusModelSchema,
  space_id: z.string().trim().max(500, {
    error: "space_id must be at most 500 characters.",
  }).optional(),
  course_id: z.string().trim().max(500, {
    error: "course_id must be at most 500 characters.",
  }).optional(),
});

export type SixtusRequest = z.infer<typeof sixtusRequestSchema>;

export const realtimeCallModelSchema = z.enum([
  "gpt-realtime-2.1",
  "gpt-realtime-2.1-mini",
]);

export type RealtimeCallModel = z.infer<typeof realtimeCallModelSchema>;

export const realtimeClientSecretRequestSchema = z.object({
  /** `"realtime"` for voice calls; `"transcription"` for dictation. */
  type: z.enum(["realtime", "transcription"]).default("realtime"),
  /** Realtime call model to bind to the client secret. */
  model: realtimeCallModelSchema.default("gpt-realtime-2.1"),
}).strict();

export type RealtimeClientSecretRequest = z.infer<
  typeof realtimeClientSecretRequestSchema
>;

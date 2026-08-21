import { z } from "@zod";

import {
  STUDENT_PROFILE_DEFAULT,
  TUTOR_INSTRUCTIONS_DEFAULT,
} from "./prompt.ts";
import type { MammothUIMessage } from "./types.ts";

const messageRoleSchema = z.enum(["system", "user", "assistant"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUIMessage(value: unknown): value is MammothUIMessage {
  if (!isRecord(value)) {
    return false;
  }

  const { id, role, parts } = value;

  return typeof id === "string" &&
    messageRoleSchema.safeParse(role).success &&
    Array.isArray(parts) &&
    parts.every((part) => isRecord(part) && typeof part.type === "string");
}

export const MAMMOTH_GATEWAY_MODEL_CONFIG = {
  "openai/gpt-5.6-luna": { reasoning: "high" },
  "openai/gpt-5.6-terra": { reasoning: "high" },
  "openai/gpt-5.6-sol": { reasoning: "medium" },
  "anthropic/claude-sonnet-5": { reasoning: "high" },
  "anthropic/claude-opus-5": { reasoning: "medium" },
  "xai/grok-4.5": { reasoning: "high" },
  "xai/grok-4.6": { reasoning: "high" },
  "google/gemini-3.6-flash": { reasoning: "high" },
  "google/gemini-3.7-flash": { reasoning: "high" },
  "meta/muse-spark-1.1": { reasoning: "high" },
  "zai/glm-5.2": { reasoning: "high" },
  "zai/glm-5.2-fast": { reasoning: "high" },
  "minimax/minimax-m3": { reasoning: "high" },
  "alibaba/qwen3.7-max": { reasoning: "high" },
} as const;

export type MammothGatewayModel = keyof typeof MAMMOTH_GATEWAY_MODEL_CONFIG;

export const MAMMOTH_DEFAULT_MODEL =
  "google/gemini-3.7-flash" as const satisfies MammothGatewayModel;

const MAMMOTH_GATEWAY_MODELS = Object.keys(
  MAMMOTH_GATEWAY_MODEL_CONFIG,
) as [MammothGatewayModel, ...MammothGatewayModel[]];

export const MAMMOTH_MODEL_OPTIONS = [
  "auto",
  ...MAMMOTH_GATEWAY_MODELS,
] as const;

export type MammothModelPickerOption =
  typeof MAMMOTH_MODEL_OPTIONS[number];

const mammothModelSchema = z
  .enum(MAMMOTH_MODEL_OPTIONS)
  .default("auto")
  .transform((value): MammothGatewayModel =>
    value === "auto" ? MAMMOTH_DEFAULT_MODEL : value
  );

export const mammothRequestSchema = z.object({
  messages: z.array(
    z.custom<MammothUIMessage>(
      isUIMessage,
      "Expected an AI SDK UIMessage with id, role, and parts.",
    ),
  ),
  tutor_instructions: z.string().trim().max(10000, {
      error: "tutor_instructions must be at most 10,000 characters.",
    })
    .optional()
    .transform((value) => value || TUTOR_INSTRUCTIONS_DEFAULT),
  student_profile: z.string().trim().max(10000, {
      error: "student_profile must be at most 10,000 characters.",
    })
    .optional()
    .transform((value) => value || STUDENT_PROFILE_DEFAULT),
  memory: z.string().trim().max(10000, {
    error: "memory must be at most 10,000 characters.",
  }).optional(),
  model: mammothModelSchema,
  space_id: z.string().trim().max(500, {
    error: "space_id must be at most 500 characters.",
  }).optional(),
  course_id: z.string().trim().max(500, {
    error: "course_id must be at most 500 characters.",
  }).optional(),
});

export type MammothRequest = z.infer<typeof mammothRequestSchema>;

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

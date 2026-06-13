import { z } from "@zod";

import type { TutorChatUIMessage } from "./types.ts";

const messageRoleSchema = z.enum(["system", "user", "assistant"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUIMessage(value: unknown): value is TutorChatUIMessage {
  if (!isRecord(value)) {
    return false;
  }

  const { id, role, parts } = value;

  return typeof id === "string" &&
    messageRoleSchema.safeParse(role).success &&
    Array.isArray(parts) &&
    parts.every((part) => isRecord(part) && typeof part.type === "string");
}

export const TUTOR_CHAT_DEFAULT_MODEL = "google/gemini-3.5-flash" as const;

export const TUTOR_CHAT_MODEL_OPTIONS = [
  "auto",
  "google/gemini-3.5-flash",
  "xai/grok-4.3",
  "cerebras/gpt-oss-120b",
  "minimax/minimax-m3",
  "alibaba/qwen3.7-max",
  "nvidia/nemotron-3-ultra-550b-a55b"
] as const;

export type TutorChatModelPickerOption =
  typeof TUTOR_CHAT_MODEL_OPTIONS[number];

type TutorChatGatewayModel = typeof TUTOR_CHAT_DEFAULT_MODEL | Exclude<
  TutorChatModelPickerOption,
  "auto"
>;

const tutorChatModelSchema = z
  .enum(TUTOR_CHAT_MODEL_OPTIONS)
  .default("auto")
  .transform((value): TutorChatGatewayModel =>
    value === "auto" ? TUTOR_CHAT_DEFAULT_MODEL : value
  );

export const tutorChatRequestSchema = z.object({
  messages: z.array(
    z.custom<TutorChatUIMessage>(
      isUIMessage,
      "Expected an AI SDK UIMessage with id, role, and parts.",
    ),
  ),
  tutor_instructions: z.string().trim().max(10000, {
    error: "tutor_instructions must be at most 10,000 characters.",
  }),
  student_profile: z.string().trim().max(10000, {
    error: "student_profile must be at most 10,000 characters.",
  }),
  model: tutorChatModelSchema,
});

export type TutorChatRequest = z.infer<typeof tutorChatRequestSchema>;

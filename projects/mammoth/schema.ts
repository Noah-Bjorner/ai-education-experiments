import { z } from "@zod";

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

export const MAMMOTH_DEFAULT_MODEL = "openai/gpt-5.6-terra" as const;
//change to grok-4.5 when available world wide

export const MAMMOTH_MODEL_OPTIONS = [
  "auto",
  "openai/gpt-5.6-terra",
  "anthropic/claude-sonnet-5",
  "xai/grok-4.5",
  "google/gemini-3.5-flash",
  "meta/muse-spark-1.1",
  "zai/glm-5.2",
  "zai/glm-5.2-fast",
  "minimax/minimax-m3",
  "alibaba/qwen3.7-max",
] as const;

export type MammothModelPickerOption =
  typeof MAMMOTH_MODEL_OPTIONS[number];

type MammothGatewayModel = typeof MAMMOTH_DEFAULT_MODEL | Exclude<
  MammothModelPickerOption,
  "auto"
>;

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
  }),
  student_profile: z.string().trim().max(10000, {
    error: "student_profile must be at most 10,000 characters.",
  }),
  memory: z.string().trim().max(10000, {
    error: "memory must be at most 10,000 characters.",
  }).optional(),
  model: mammothModelSchema,
});

export type MammothRequest = z.infer<typeof mammothRequestSchema>;

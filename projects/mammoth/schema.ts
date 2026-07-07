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

export const MAMMOTH_DEFAULT_MODEL = "zai/glm-5.2-fast" as const;

export const MAMMOTH_MODEL_OPTIONS = [
  "auto",
  "google/gemini-3.5-flash",
  "openai/gpt-5.5",
  "anthropic/claude-sonnet-5",
  "xai/grok-4.3",
  "zai/glm-5.2",
  "minimax/minimax-m3",
  "alibaba/qwen3.7-max",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "moonshotai/kimi-k2.6",
  "cerebras/gpt-oss-120b",
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
  model: mammothModelSchema,
});

export type MammothRequest = z.infer<typeof mammothRequestSchema>;

import { z } from "@zod";

import type { TutorChatUIMessage } from "./chat.ts";

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
});

export type TutorChatRequest = z.infer<typeof tutorChatRequestSchema>;

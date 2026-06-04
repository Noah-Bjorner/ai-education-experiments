import "@std/dotenv/load";
import {
  convertToModelMessages,
  createGateway,
  createUIMessageStream,
  hasToolCall,
  isStepCount,
  streamText,
} from "@ai";

import { getLatestActiveObjective } from "./helper.ts";
import { createTutorChatSystemPrompt } from "./prompt.ts";
import type { TutorChatRequest } from "./schema.ts";
import { tutorChatTools } from "./tools/index.ts";
import type { TutorChatUIMessage } from "./types.ts";

export { tutorChatTools } from "./tools/index.ts";
export {
  TUTOR_CHAT_ACTIVE_TOOL_STATES,
  TUTOR_CHAT_TOOL_LABELS,
  TUTOR_CHAT_TOOL_PART_TYPES,
  TUTOR_CHAT_TOOL_STATES,
} from "./types.ts";
export type { TutorChatRequest } from "./schema.ts";
export type {
  TutorChatDataTypes,
  TutorChatToolInvocation,
  TutorChatToolName,
  TutorChatToolPartType,
  TutorChatToolState,
  TutorChatUIMessage,
  TutorChatUITools,
} from "./types.ts";

const DEFAULT_MODEL = "xai/grok-4.3";
const MAX_TOOL_STEPS = 8;

export async function streamTutorChat(
  { messages, tutor_instructions, student_profile }: TutorChatRequest,
) {
  const apiKey = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is required to run Tutor chat.");
  }

  const gateway = createGateway({ apiKey });
  const currentObjective = getLatestActiveObjective(messages);

  const systemPrompt = createTutorChatSystemPrompt(
    tutor_instructions,
    student_profile,
    currentObjective,
  );

  return streamText({
    model: gateway(Deno.env.get("TUTOR_CHAT_MODEL") ?? DEFAULT_MODEL),
    system: systemPrompt,
    reasoning: 'medium',
    messages: await convertToModelMessages(messages),
    tools: tutorChatTools,
    stopWhen: [
      hasToolCall("prompt-suggestions"),
      hasToolCall("question"),
      isStepCount(MAX_TOOL_STEPS),
    ],
  });
}

export function createTutorChatUIMessageStream(
  request: TutorChatRequest,
  {
    onError,
  }: {
    onError?: (error: unknown) => string;
  } = {},
) {
  return createUIMessageStream<TutorChatUIMessage>({
    execute: async ({ writer }) => {
      const result = await streamTutorChat(request);
      writer.merge(result.toUIMessageStream());
    },
    onError,
  });
}

import "@std/dotenv/load";
import {
  convertToModelMessages,
  createGateway,
  createUIMessageStream,
  generateText,
  hasToolCall,
  isStepCount,
  Output,
  streamText,
} from "@ai";
import { z } from "@zod";

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

const DEFAULT_MODEL = "google/gemini-3.5-flash";
const MAX_TOOL_STEPS = 8;

const repairedToolCallInputSchema = z.object({
  input: z.string().min(1).describe(
    "A stringified JSON object containing the corrected tool input.",
  ),
});

export async function streamTutorChat(
  { messages, tutor_instructions, student_profile }: TutorChatRequest,
) {
  const apiKey = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is required to run Tutor chat.");
  }

  const gateway = createGateway({ apiKey });
  const model = gateway(Deno.env.get("TUTOR_CHAT_MODEL") ?? DEFAULT_MODEL);
  const currentObjective = getLatestActiveObjective(messages);

  const systemPrompt = createTutorChatSystemPrompt(
    tutor_instructions,
    student_profile,
    currentObjective,
  );

  return streamText({
    model,
    system: systemPrompt,
    reasoning: "medium",
    messages: await convertToModelMessages(messages),
    tools: tutorChatTools,
    experimental_repairToolCall: async ({ toolCall, inputSchema, error }) => {
      if (!(toolCall.toolName in tutorChatTools)) {
        return null;
      }

      const schema = await inputSchema({ toolName: toolCall.toolName });
      const repair = await generateText({
        model,
        output: Output.object({ schema: repairedToolCallInputSchema }),
        prompt: [
          `The model produced invalid input for the "${toolCall.toolName}" tool.`,
          "Rewrite only the tool input so it matches the provided JSON schema exactly.",
          "Return the corrected input as a stringified JSON object.",
          "",
          `Validation error: ${String(error)}`,
          "",
          `JSON schema: ${JSON.stringify(schema)}`,
          "",
          `Invalid input: ${toolCall.input}`,
        ].join("\n"),
      });

      return {
        ...toolCall,
        input: repair.output.input,
      };
    },
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

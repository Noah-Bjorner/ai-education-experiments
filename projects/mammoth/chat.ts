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
import { createMammothSystemPrompt } from "./prompt.ts";
import type { MammothRequest } from "./schema.ts";
import { mammothTools } from "./tools/index.ts";
import type { MammothUIMessage } from "./types.ts";

export { mammothTools } from "./tools/index.ts";
export {
  MAMMOTH_ACTIVE_TOOL_STATES,
  MAMMOTH_TOOL_LABELS,
  MAMMOTH_TOOL_PART_TYPES,
  MAMMOTH_TOOL_STATES,
} from "./types.ts";
export {
  MAMMOTH_DEFAULT_MODEL,
  MAMMOTH_MODEL_OPTIONS,
} from "./schema.ts";
export type { MammothModelPickerOption, MammothRequest } from "./schema.ts";
export type {
  MammothDataTypes,
  MammothToolInvocation,
  MammothToolName,
  MammothToolPartType,
  MammothToolState,
  MammothUIMessage,
  MammothUITools,
} from "./types.ts";

const MAX_TOOL_STEPS = 15;
const REPAIR_TOOL_CALL_MODEL = "openai/gpt-5.6-sol";

const repairedToolCallInputSchema = z.object({
  input: z.string().min(1).describe(
    "A stringified JSON object containing the corrected tool input.",
  ),
});

export async function streamMammoth(
  { messages, tutor_instructions, student_profile, memory, model: modelId }:
    MammothRequest,
) {
  const apiKey = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is required to run Mammoth.");
  }

  const gateway = createGateway({ apiKey });
  const model = gateway(modelId);
  const currentObjective = getLatestActiveObjective(messages);

  const systemPrompt = createMammothSystemPrompt(
    tutor_instructions,
    student_profile,
    memory,
    currentObjective,
  );

  return streamText({
    model,
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: mammothTools,
    experimental_repairToolCall: async ({ toolCall, inputSchema, error }) => {
      if (!(toolCall.toolName in mammothTools)) {
        return null;
      }
      const schema = await inputSchema({ toolName: toolCall.toolName });
      const repairModel = gateway(REPAIR_TOOL_CALL_MODEL);
      const repair = await generateText({
        model: repairModel,
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
      hasToolCall("promptSuggestions"),
      hasToolCall("question"),
      hasToolCall("userAction"),
      isStepCount(MAX_TOOL_STEPS),
    ],
  });
}

export function createMammothUIMessageStream(
  request: MammothRequest,
  {
    onError,
  }: {
    onError?: (error: unknown) => string;
  } = {},
) {
  return createUIMessageStream<MammothUIMessage>({
    execute: async ({ writer }) => {
      const result = await streamMammoth(request);
      writer.merge(result.toUIMessageStream());
    },
    onError,
  });
}

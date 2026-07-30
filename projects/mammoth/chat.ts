import "@std/dotenv/load";
import {
  convertToModelMessages,
  createGateway,
  createUIMessageStream,
  hasToolCall,
  isStepCount,
  streamText,
} from "@ai";

import { transformMessages } from "./message-transforms.ts";
import { createToolCallRepair } from "./tools/shared/repair-tool-call/index.ts";
import { getLatestActiveObjective } from "./helper.ts";
import { createMammothSystemPrompt } from "./prompt.ts";
import {
  MAMMOTH_GATEWAY_MODEL_CONFIG,
  type MammothRequest,
} from "./schema.ts";
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
  MAMMOTH_GATEWAY_MODEL_CONFIG,
  MAMMOTH_MODEL_OPTIONS,
} from "./schema.ts";
export type {
  MammothGatewayModel,
  MammothModelPickerOption,
  MammothRequest,
} from "./schema.ts";
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

  const transformedMessages = await transformMessages(messages);

  return streamText({
    model: model,
    reasoning: MAMMOTH_GATEWAY_MODEL_CONFIG[modelId].reasoning,
    system: systemPrompt,
    messages: await convertToModelMessages(transformedMessages),
    tools: mammothTools,
    experimental_repairToolCall: createToolCallRepair({
      model: gateway(REPAIR_TOOL_CALL_MODEL),
      tools: mammothTools,
    }),
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

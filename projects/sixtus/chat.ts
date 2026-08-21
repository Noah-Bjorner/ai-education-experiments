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
import { createSixtusSystemPrompt } from "./prompt.ts";
import {
  SIXTUS_GATEWAY_MODEL_CONFIG,
  type SixtusRequest,
} from "./schema.ts";
import { sixtusTools } from "./tools/index.ts";
import type { SixtusUIMessage } from "./types.ts";

export { sixtusTools } from "./tools/index.ts";
export {
  SIXTUS_ACTIVE_TOOL_STATES,
  SIXTUS_TOOL_LABELS,
  SIXTUS_TOOL_PART_TYPES,
  SIXTUS_TOOL_STATES,
} from "./types.ts";
export {
  SIXTUS_DEFAULT_MODEL,
  SIXTUS_GATEWAY_MODEL_CONFIG,
  SIXTUS_MODEL_OPTIONS,
} from "./schema.ts";
export type {
  SixtusGatewayModel,
  SixtusModelPickerOption,
  SixtusRequest,
} from "./schema.ts";
export type {
  SixtusDataTypes,
  SixtusToolInvocation,
  SixtusToolName,
  SixtusToolPartType,
  SixtusToolState,
  SixtusUIMessage,
  SixtusUITools,
} from "./types.ts";

const MAX_TOOL_STEPS = 15;
const REPAIR_TOOL_CALL_MODEL = "openai/gpt-5.6-sol";

export async function streamSixtus(
  { messages, tutor_instructions, student_profile, memory, model: modelId }:
    SixtusRequest,
) {
  const apiKey = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is required to run Sixtus.");
  }

  const gateway = createGateway({ apiKey });
  const model = gateway(modelId);
  const currentObjective = getLatestActiveObjective(messages);

  const systemPrompt = createSixtusSystemPrompt(
    tutor_instructions,
    student_profile,
    memory,
    currentObjective,
  );

  const transformedMessages = await transformMessages(messages);

  return streamText({
    model: model,
    reasoning: SIXTUS_GATEWAY_MODEL_CONFIG[modelId].reasoning,
    system: systemPrompt,
    messages: await convertToModelMessages(transformedMessages),
    tools: sixtusTools,
    experimental_repairToolCall: createToolCallRepair({
      model: gateway(REPAIR_TOOL_CALL_MODEL),
      tools: sixtusTools,
    }),
    stopWhen: [
      hasToolCall("promptSuggestions"),
      hasToolCall("question"),
      hasToolCall("userAction"),
      isStepCount(MAX_TOOL_STEPS),
    ],
  });
}

export function createSixtusUIMessageStream(
  request: SixtusRequest,
  {
    onError,
  }: {
    onError?: (error: unknown) => string;
  } = {},
) {
  return createUIMessageStream<SixtusUIMessage>({
    execute: async ({ writer }) => {
      const result = await streamSixtus(request);
      writer.merge(result.toUIMessageStream());
    },
    onError,
  });
}

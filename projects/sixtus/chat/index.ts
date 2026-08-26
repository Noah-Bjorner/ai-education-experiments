import "@std/dotenv/load";
import {
  convertToModelMessages,
  createGateway,
  createUIMessageStream,
  hasToolCall,
  isStepCount,
  streamText,
  validateUIMessages,
} from "@ai";

import { getLatestActiveObjective } from "../helper.ts";
import { SIXTUS_MODELS, type SixtusModel } from "../models/index.ts";
import type { SixtusRequest } from "../schema.ts";
import { createSixtusTools } from "../tools/index.ts";
import { createToolCallRepair } from "../tools/shared/repair-tool-call/index.ts";
import type { SixtusUIMessage } from "../types.ts";
import { transformMessages } from "./message-transforms.ts";
import { createSixtusSystemPrompt, LEARNER_PROFILE_DEFAULT } from "./prompt.ts";
import { createTutorInstructions } from "./tutor-style.ts";

export { createSixtusTools } from "../tools/index.ts";
export {
  SIXTUS_ACTIVE_TOOL_STATES,
  SIXTUS_TOOL_LABELS,
  SIXTUS_TOOL_PART_TYPES,
  SIXTUS_TOOL_STATES,
} from "../types.ts";
export {
  all,
  featuredInApp,
  SIXTUS_AUTO_MODEL,
  SIXTUS_GATEWAY_MODEL_CONFIG,
  SIXTUS_MODEL_OPTIONS,
  SIXTUS_MODELS,
} from "../models/index.ts";
export type {
  SixtusGatewayModel,
  SixtusModel,
  SixtusModelPickerOption,
  SixtusReasoningEffort,
} from "../models/index.ts";
export type { SixtusRequest } from "../schema.ts";
export type {
  SixtusDataTypes,
  SixtusToolInvocation,
  SixtusToolName,
  SixtusToolPartType,
  SixtusToolState,
  SixtusUIMessage,
  SixtusUITools,
} from "../types.ts";

const MAX_TOOL_STEPS = 15;
const REPAIR_TOOL_CALL_MODEL = "openai/gpt-5.6-sol";

export async function streamSixtus(
  { messages, tutor_style, model: modelId }: SixtusRequest,
  runtime: { userId: string },
) {
  const apiKey = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is required to run Sixtus.");
  }

  const gateway = createGateway({ apiKey });
  const model = gateway(modelId);
  const modelConfig: SixtusModel = SIXTUS_MODELS[modelId];
  const tools = createSixtusTools({ userId: runtime.userId });
  const currentObjective = getLatestActiveObjective(messages);
  const tutorInstructions = createTutorInstructions(tutor_style);

  const systemPrompt = createSixtusSystemPrompt(
    tutorInstructions,
    LEARNER_PROFILE_DEFAULT,
    undefined,
    currentObjective,
  );

  const transformedMessages = await transformMessages(messages);
  const modelMessages = await convertToModelMessages(
    await validateRequestMessages(transformedMessages, tools),
  );

  return streamText({
    model: model,
    reasoning: modelConfig.reasoningEffort,
    ...(modelConfig.provider
      ? {
        providerOptions: {
          gateway: {
            only: [modelConfig.provider],
          },
        },
      }
      : {}),
    system: systemPrompt,
    messages: modelMessages,
    tools,
    experimental_repairToolCall: createToolCallRepair({
      model: gateway(REPAIR_TOOL_CALL_MODEL),
      tools,
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
    userId,
    onError,
  }: {
    userId: string;
    onError?: (error: unknown) => string;
  },
) {
  return createUIMessageStream<SixtusUIMessage>({
    execute: async ({ writer }) => {
      const result = await streamSixtus(request, { userId });
      writer.merge(result.toUIMessageStream());
    },
    onError,
  });
}

async function validateRequestMessages(
  messages: SixtusUIMessage[],
  tools: ReturnType<typeof createSixtusTools>,
): Promise<SixtusUIMessage[]> {
  try {
    return await validateUIMessages<SixtusUIMessage>({
      messages,
      tools,
    });
  } catch (error) {
    console.error(
      "Sixtus UIMessage validation failed; using unvalidated history",
      error,
    );
    return messages;
  }
}

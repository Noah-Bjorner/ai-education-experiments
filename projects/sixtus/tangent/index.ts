import "@std/dotenv/load";
import {
  convertToModelMessages,
  createGateway,
  createUIMessageStream,
  streamText,
} from "@ai";

import { formatSixtusRuntime } from "../chat/runtime.ts";
import {
  SIXTUS_MODELS,
  type SixtusGatewayModel,
  type SixtusModel,
} from "../models/index.ts";
import type { SixtusUIMessage } from "../types.ts";
import { TANGENT_SYSTEM_PROMPT } from "./prompt.ts";
import type { TangentRequest } from "./schema.ts";

const TANGENT_MODEL: SixtusGatewayModel = "google/gemini-3.8-flash";

const KEPT_PART_TYPES = new Set(["text", "file", "reasoning"]);

function stripToolAndDataParts(
  messages: SixtusUIMessage[],
): SixtusUIMessage[] {
  return messages.flatMap((message) => {
    const parts = message.parts.filter((part) =>
      KEPT_PART_TYPES.has(part.type)
    );
    if (parts.length === 0) {
      return [];
    }

    return [{ ...message, parts }];
  });
}

export async function streamTangent({ messages }: TangentRequest) {
  const apiKey = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is required to run Sixtus.");
  }

  const gateway = createGateway({ apiKey });
  const model = gateway(TANGENT_MODEL);
  const modelConfig: SixtusModel = SIXTUS_MODELS[TANGENT_MODEL];
  const modelMessages = await convertToModelMessages(
    stripToolAndDataParts(messages),
  );

  return streamText({
    model,
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
    system: [TANGENT_SYSTEM_PROMPT, formatSixtusRuntime()].join("\n\n"),
    messages: modelMessages,
  });
}

export function createTangentUIMessageStream(
  request: TangentRequest,
  {
    onError,
  }: {
    onError?: (error: unknown) => string;
  } = {},
) {
  return createUIMessageStream<SixtusUIMessage>({
    execute: async ({ writer }) => {
      const result = await streamTangent(request);
      writer.merge(result.toUIMessageStream());
    },
    onError,
  });
}

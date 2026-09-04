import "@std/dotenv/load";
import {
  convertToModelMessages,
  createUIMessageStream,
  streamText,
} from "@ai";
import { cerebras } from "../../../lib/cerebras.ts";
import { formatSixtusRuntime } from "../chat/runtime.ts";
import type { SixtusUIMessage } from "../types.ts";
import { TANGENT_SYSTEM_PROMPT } from "./prompt.ts";
import type { TangentRequest } from "./schema.ts";


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

  const modelMessages = await convertToModelMessages(
    stripToolAndDataParts(messages),
  )

  return streamText({
    model: cerebras("qwen-3.8-27b"),
    providerOptions: {
      cerebras: { reasoningEffort: "medium" },
    },  
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

import "@std/dotenv/load";
import { generateText } from "@ai";

import type { SixtusUIMessage } from "../types.ts";
import { GLOSSARY_SYSTEM_PROMPT } from "./prompt.ts";
import type { GlossaryRequest } from "./schema.ts";

type MessagePart = SixtusUIMessage["parts"][number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractAssistantText(messages: SixtusUIMessage[]): string {
  const texts = messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) =>
      message.parts.filter((part): part is Extract<MessagePart, { type: "text" }> =>
        isRecord(part) && part.type === "text" && typeof part.text === "string"
      )
    )
    .map((part) => part.text.trim())
    .filter((text) => text.length > 0);

  return texts.join("\n\n");
}

export async function generateGlossary(
  { messages }: GlossaryRequest,
): Promise<{ glossary: string }> {
  const lessonText = extractAssistantText(messages);
  if (!lessonText) {
    throw new Error("No assistant text found in messages.");
  }

  const { text } = await generateText({
    model: "google/gemma-4-31b-it", //update to qwen3.8-27b when it's available sep 3
    reasoning: "medium",
    system: GLOSSARY_SYSTEM_PROMPT,
    prompt: lessonText,
    providerOptions: {
      gateway: {
        only: ["cerebras"],
      },
    },
  });

  return { glossary: text.trim() };
}

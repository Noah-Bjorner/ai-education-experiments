import "@std/dotenv/load";
import {
  convertToModelMessages,
  createGateway,
  isStepCount,
  streamText,
  type UIMessage,
} from "@ai";

import { webSearchTool } from "../../tools/web-search.ts";

const DEFAULT_MODEL = "xai/grok-4.3";
const MAX_TOOL_STEPS = 8;

const TUTOR_GPT_SYSTEM_PROMPT = (tutor_instructions: string, student_profile: string) => `
## Tutor Instructions
${tutor_instructions}

## Student Profile
${student_profile}
`;


export const tutorGptTools = {
  webSearch: webSearchTool,
};

export type TutorGptChatRequest = {
  messages: UIMessage[];
  tutor_instructions: string;
  student_profile: string;
};

export async function streamTutorGptChat({ messages, tutor_instructions, student_profile }: TutorGptChatRequest) {
  const apiKey = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is required to run Tutor GPT chat.");
  }

  const gateway = createGateway({ apiKey });

  return streamText({
    model: gateway(Deno.env.get("TUTOR_GPT_MODEL") ?? DEFAULT_MODEL),
    system: TUTOR_GPT_SYSTEM_PROMPT(tutor_instructions, student_profile),
    messages: await convertToModelMessages(messages),
    tools: tutorGptTools,
    stopWhen: isStepCount(MAX_TOOL_STEPS),
  });
}

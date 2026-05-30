import "@std/dotenv/load";
import {
  convertToModelMessages,
  createGateway,
  isStepCount,
  streamText,
  type UIMessage,
} from "@ai";

import { webSearchTool } from "../../tools/web-search.ts";
import { quizTool } from "./tools/quiz.ts";

const DEFAULT_MODEL = "xai/grok-4.3";
const MAX_TOOL_STEPS = 8;

const TUTOR_CHAT_SYSTEM_PROMPT = (tutor_instructions: string, student_profile: string) => `
## Tutor Instructions
${tutor_instructions}

## Student Profile
${student_profile}

## Tool Calling
Use tools when they improve the student's learning experience. Do not call tools just because they are available.

- quiz: Use when you want the student to actively think, practice, or check understanding. Prefer the simplest quizType that matches the learning task:
  - multiple_choice_text: default for quick conceptual checks or choosing among text options.
  - text_response: when the student should explain, define, or reflect in their own words.
  - math_response: when the answer is numeric, an equation, an expression, or unit-based.
  - fill_in_the_blank: when recalling vocabulary, formulas, steps, or sentence completions. Use {{blankId}} markers.
  - matching: when pairing related items, such as terms and definitions or examples and categories.
  - multiple_choice_image: only when visual recognition/comparison matters. Each choice needs an imageUrl or imageDescription.
- webSearch: Use when the answer depends on current, external, or source-backed information.

## Output Format
Use Markdown as the response format. Let the content determine the structure: choose the simplest Markdown that makes relationships, sequence, emphasis, and examples easy to understand. Keep formatting natural, consistent, and unobtrusive.
`;


export const tutorChatTools = {
  quiz: quizTool,
  webSearch: webSearchTool,
};

export type TutorChatRequest = {
  messages: UIMessage[];
  tutor_instructions: string;
  student_profile: string;
};

export async function streamTutorChat({ messages, tutor_instructions, student_profile }: TutorChatRequest) {
  const apiKey = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is required to run Tutor chat.");
  }

  const gateway = createGateway({ apiKey });

  return streamText({
    model: gateway(Deno.env.get("TUTOR_CHAT_MODEL") ?? DEFAULT_MODEL),
    system: TUTOR_CHAT_SYSTEM_PROMPT(tutor_instructions, student_profile),
    messages: await convertToModelMessages(messages),
    tools: tutorChatTools,
    stopWhen: isStepCount(MAX_TOOL_STEPS),
  });
}

import "@std/dotenv/load";
import {
  convertToModelMessages,
  createGateway,
  createUIMessageStream,
  hasToolCall,
  type InferUITools,
  isStepCount,
  streamText,
  type ToolSet,
  type UIMessage,
} from "@ai";

import {
  createWebSearchTool,
  webSearchTool,
  type WebSearchToolInvocation,
} from "../../tools/web-search.ts";
import {
  createQuestionTool,
  questionTool,
  type QuestionToolInvocation,
} from "./tools/question.ts";

const DEFAULT_MODEL = "xai/grok-4.3";
const MAX_TOOL_STEPS = 8;

const TUTOR_CHAT_SYSTEM_PROMPT = (
  tutor_instructions: string,
  student_profile: string,
) => `
## Tutor Instructions
${tutor_instructions}

## Student Profile
${student_profile}

## Tool Calling
Use tools when they improve the student's learning experience. Do not call tools just because they are available.

- question: Use when you want the student to actively think, practice, or check understanding. Prefer the simplest questionType that matches the learning task:
  - multiple_choice_text: default for quick conceptual checks or choosing among text options.
  - multiple_choice_image: only when visual recognition/comparison matters. Each choice needs an imageUrl or imageDescription.
  - text_response: when the student should explain, define, or reflect in their own words.
  - math_response: when the answer is numeric, an equation, an expression, or unit-based.
  - fill_in_the_blank: when recalling vocabulary, formulas, steps, or sentence completions. Use {{blankId}} markers.
  - matching: when pairing related items, such as terms and definitions or examples and categories.
- webSearch: Use when the answer depends on current, external, or source-backed information.

## Output Format
Use Markdown as the response format when responding in text. Let the content determine the structure: choose the simplest Markdown that makes relationships, sequence, emphasis, and examples easy to understand. Keep formatting natural, consistent, and unobtrusive.
`;

export const tutorChatTools = {
  question: questionTool,
  webSearch: webSearchTool,
} satisfies ToolSet;

export type TutorChatUITools = InferUITools<typeof tutorChatTools>;
export type TutorChatToolInvocation =
  | QuestionToolInvocation
  | WebSearchToolInvocation;
export type TutorChatToolName = keyof typeof tutorChatTools;
export type TutorChatToolPartType = `tool-${TutorChatToolName}`;
export type TutorChatToolStatus = {
  toolName: TutorChatToolName;
  toolCallId: string;
  status: "started";
  label: string;
};
export type TutorChatDataTypes = {
  "tool-status": TutorChatToolStatus;
};
export type TutorChatUIMessage = UIMessage<
  unknown,
  TutorChatDataTypes,
  TutorChatUITools
>;

export const TUTOR_CHAT_TOOL_PART_TYPES = [
  "tool-question",
  "tool-webSearch",
] as const satisfies readonly TutorChatToolPartType[];

export const TUTOR_CHAT_TOOL_STATES = [
  "input-streaming",
  "input-available",
  "output-available",
  "output-error",
] as const;

export type TutorChatRequest = {
  messages: TutorChatUIMessage[];
  tutor_instructions: string;
  student_profile: string;
};

function createTutorChatTools(
  onToolStart?: (status: TutorChatToolStatus) => void,
) {
  return {
    question: createQuestionTool({
      onToolStart: ({ toolCallId }) =>
        onToolStart?.({
          toolName: "question",
          toolCallId,
          status: "started",
          label: "Creating a question...",
        }),
    }),
    webSearch: createWebSearchTool({
      onToolStart: ({ toolCallId }) =>
        onToolStart?.({
          toolName: "webSearch",
          toolCallId,
          status: "started",
          label: "Searching the web...",
        }),
    }),
  } satisfies ToolSet;
}

export async function streamTutorChat(
  { messages, tutor_instructions, student_profile }: TutorChatRequest,
  {
    onToolStart,
  }: {
    onToolStart?: (status: TutorChatToolStatus) => void;
  } = {},
) {
  const apiKey = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is required to run Tutor chat.");
  }

  const gateway = createGateway({ apiKey });

  return streamText({
    model: gateway(Deno.env.get("TUTOR_CHAT_MODEL") ?? DEFAULT_MODEL),
    system: TUTOR_CHAT_SYSTEM_PROMPT(tutor_instructions, student_profile),
    messages: await convertToModelMessages(messages),
    tools: createTutorChatTools(onToolStart),
    stopWhen: [hasToolCall("question"), isStepCount(MAX_TOOL_STEPS)],
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
      const result = await streamTutorChat(request, {
        onToolStart: (status) => {
          writer.write({
            type: "data-tool-status",
            id: status.toolCallId,
            data: status,
            transient: true,
          });
        },
      });

      writer.merge(result.toUIMessageStream());
    },
    onError,
  });
}

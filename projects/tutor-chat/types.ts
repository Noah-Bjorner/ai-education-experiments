import { type InferUITools, type UIMessage } from "@ai";

import type { WebSearchToolInvocation } from "../../tools/web-search.ts";
import type { ObjectiveToolInvocation } from "./tools/objective.ts";
import type { PromptSuggestionsToolInvocation } from "./tools/prompt-suggestions.ts";
import type { QuestionToolInvocation } from "./tools/question.ts";
import type { TutorChatToolName, tutorChatTools } from "./tools/index.ts";

export type { TutorChatToolName } from "./tools/index.ts";

export type TutorChatUITools = InferUITools<typeof tutorChatTools>;
export type TutorChatToolInvocation =
  | ObjectiveToolInvocation
  | PromptSuggestionsToolInvocation
  | QuestionToolInvocation
  | WebSearchToolInvocation;
export type TutorChatToolPartType = `tool-${TutorChatToolName}`;
export type TutorChatDataTypes = Record<string, never>;
export type TutorChatUIMessage = UIMessage<
  unknown,
  TutorChatDataTypes,
  TutorChatUITools
>;

export const TUTOR_CHAT_TOOL_PART_TYPES = [
  "tool-objective",
  "tool-prompt-suggestions",
  "tool-question",
  "tool-webSearch",
] as const satisfies readonly TutorChatToolPartType[];

export const TUTOR_CHAT_TOOL_LABELS = {
  "tool-objective": "Updating the learning objective...",
  "tool-prompt-suggestions": "Creating prompt suggestions...",
  "tool-question": "Creating a question...",
  "tool-webSearch": "Searching the web...",
} as const satisfies Record<TutorChatToolPartType, string>;

export const TUTOR_CHAT_TOOL_STATES = [
  "input-streaming",
  "input-available",
  "output-available",
  "output-error",
] as const;

export type TutorChatToolState = typeof TUTOR_CHAT_TOOL_STATES[number];

export const TUTOR_CHAT_ACTIVE_TOOL_STATES = [
  "input-streaming",
  "input-available",
] as const satisfies readonly TutorChatToolState[];

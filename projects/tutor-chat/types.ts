import { type InferUITools, type UIMessage } from "@ai";

import type { DemonstrationToolInvocation } from "./tools/demontrate/index.ts";
import type { ObjectiveToolInvocation } from "./tools/objective/index.ts";
import type { PromptSuggestionsToolInvocation } from "./tools/prompt-suggestions/index.ts";
import type { QuestionToolInvocation } from "./tools/question/index.ts";
import type { TutorChatToolName, tutorChatTools } from "./tools/index.ts";

export type { TutorChatToolName } from "./tools/index.ts";

export type TutorChatUITools = InferUITools<typeof tutorChatTools>;
export type TutorChatToolInvocation =
  | DemonstrationToolInvocation
  | ObjectiveToolInvocation
  | PromptSuggestionsToolInvocation
  | QuestionToolInvocation;
export type TutorChatToolPartType = `tool-${TutorChatToolName}`;
export type TutorChatDataTypes = Record<string, never>;
export type TutorChatUIMessage = UIMessage<
  unknown,
  TutorChatDataTypes,
  TutorChatUITools
>;

export const TUTOR_CHAT_TOOL_PART_TYPES = [
  "tool-demonstration",
  "tool-objective",
  "tool-promptSuggestions",
  "tool-question",
] as const satisfies readonly TutorChatToolPartType[];

export const TUTOR_CHAT_TOOL_LABELS = {
  "tool-demonstration": "Creating a demonstration...",
  "tool-objective": "Updating the learning objective...",
  "tool-promptSuggestions": "Creating prompt suggestions...",
  "tool-question": "Creating a question...",
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

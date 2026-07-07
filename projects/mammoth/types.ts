import { type InferUITools, type UIMessage } from "@ai";

import type { DemonstrationToolInvocation } from "./tools/demontrate/index.ts";
import type { ObjectiveToolInvocation } from "./tools/objective/index.ts";
import type { PromptSuggestionsToolInvocation } from "./tools/prompt-suggestions/index.ts";
import type { QuestionToolInvocation } from "./tools/question/index.ts";
import type { MammothToolName, mammothTools } from "./tools/index.ts";

export type { MammothToolName } from "./tools/index.ts";

export type MammothUITools = InferUITools<typeof mammothTools>;
export type MammothToolInvocation =
  | DemonstrationToolInvocation
  | ObjectiveToolInvocation
  | PromptSuggestionsToolInvocation
  | QuestionToolInvocation;
export type MammothToolPartType = `tool-${MammothToolName}`;
export type MammothDataTypes = Record<string, never>;
export type MammothUIMessage = UIMessage<
  unknown,
  MammothDataTypes,
  MammothUITools
>;

export const MAMMOTH_TOOL_PART_TYPES = [
  "tool-demonstration",
  "tool-objective",
  "tool-promptSuggestions",
  "tool-question",
] as const satisfies readonly MammothToolPartType[];

export const MAMMOTH_TOOL_LABELS = {
  "tool-demonstration": "Creating a demonstration...",
  "tool-objective": "Updating the learning objective...",
  "tool-promptSuggestions": "Creating prompt suggestions...",
  "tool-question": "Creating a question...",
} as const satisfies Record<MammothToolPartType, string>;

export const MAMMOTH_TOOL_STATES = [
  "input-streaming",
  "input-available",
  "output-available",
  "output-error",
] as const;

export type MammothToolState = typeof MAMMOTH_TOOL_STATES[number];

export const MAMMOTH_ACTIVE_TOOL_STATES = [
  "input-streaming",
  "input-available",
] as const satisfies readonly MammothToolState[];

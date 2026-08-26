import { type InferUITools, type UIMessage } from "@ai";
import type { AssessmentToolInvocation } from "./tools/assessment/index.ts";
import type { GatherContextToolInvocation } from "./tools/gather-context/index.ts";
import type { LearningMaterialToolInvocation } from "./tools/learning-material/index.ts";
import type { ObjectiveToolInvocation } from "./tools/objective/index.ts";
import type { PromptSuggestionsToolInvocation } from "./tools/prompt-suggestions/index.ts";
import type { QuestionToolInvocation } from "./tools/question/index.ts";
import type { SearchLibraryContextToolInvocation } from "./tools/search-library-context/index.ts";
import type { UserActionToolInvocation } from "./tools/user-action/index.ts";
import type { createSixtusTools, SixtusToolName } from "./tools/index.ts";

export type { SixtusToolName } from "./tools/index.ts";

export type SixtusUITools = InferUITools<ReturnType<typeof createSixtusTools>>;
export type SixtusToolInvocation =
  | AssessmentToolInvocation
  | LearningMaterialToolInvocation
  | ObjectiveToolInvocation
  | PromptSuggestionsToolInvocation
  | QuestionToolInvocation
  | GatherContextToolInvocation
  | SearchLibraryContextToolInvocation
  | UserActionToolInvocation;
export type SixtusToolPartType = `tool-${SixtusToolName}`;
export type SixtusDataTypes = Record<string, never>;
export type SixtusUIMessage = UIMessage<
  unknown,
  SixtusDataTypes,
  SixtusUITools
>;

export const SIXTUS_TOOL_PART_TYPES = [
  "tool-assessment",
  "tool-learningMaterial",
  "tool-objective",
  "tool-promptSuggestions",
  "tool-question",
  "tool-gatherContext",
  "tool-searchLibraryContext",
  "tool-userAction",
] as const satisfies readonly SixtusToolPartType[];

export const SIXTUS_TOOL_LABELS = {
  "tool-assessment": "Creating an assessment...",
  "tool-learningMaterial": "Creating learning material...",
  "tool-objective": "Updating the learning objective...",
  "tool-promptSuggestions": "Creating prompt suggestions...",
  "tool-question": "Creating a question...",
  "tool-gatherContext": "Gathering context...",
  "tool-searchLibraryContext": "Searching the library...",
  "tool-userAction": "Requesting a user action...",
} as const satisfies Record<SixtusToolPartType, string>;

export const SIXTUS_TOOL_STATES = [
  "input-streaming",
  "input-available",
  "output-available",
  "output-error",
] as const;

export type SixtusToolState = typeof SIXTUS_TOOL_STATES[number];

export const SIXTUS_ACTIVE_TOOL_STATES = [
  "input-streaming",
  "input-available",
] as const satisfies readonly SixtusToolState[];

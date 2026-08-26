import { type ToolSet } from "@ai";

import { assessmentTool } from "./assessment/index.ts";
import { gatherContextTool } from "./gather-context/index.ts";
import { learningMaterialTool } from "./learning-material/index.ts";
import { objectiveTool } from "./objective/index.ts";
import { promptSuggestionsTool } from "./prompt-suggestions/index.ts";
import { questionTool } from "./question/index.ts";
import { createSearchLibraryContextTool } from "./search-library-context/index.ts";
import { userActionTool } from "./user-action/index.ts";

export type SixtusToolRuntime = {
  userId: string;
};

export function createSixtusTools(runtime: SixtusToolRuntime) {
  return {
    objective: objectiveTool,
    question: questionTool,
    assessment: assessmentTool,
    learningMaterial: learningMaterialTool,
    promptSuggestions: promptSuggestionsTool,
    gatherContext: gatherContextTool,
    searchLibraryContext: createSearchLibraryContextTool(runtime),
    userAction: userActionTool,
  } satisfies ToolSet;
}

export type SixtusTools = ReturnType<typeof createSixtusTools>;
export type SixtusToolName = keyof SixtusTools;

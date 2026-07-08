import { type ToolSet } from "@ai";

import { gatherContextTool } from "./gather-context/index.ts";
import { objectiveTool } from "./objective/index.ts";
import { promptSuggestionsTool } from "./prompt-suggestions/index.ts";
import { questionTool } from "./question/index.ts";

export const mammothTools = {
  objective: objectiveTool,
  question: questionTool,
  promptSuggestions: promptSuggestionsTool,
  gatherContext: gatherContextTool,
} satisfies ToolSet;

export type MammothToolName = keyof typeof mammothTools;

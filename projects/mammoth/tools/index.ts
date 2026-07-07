import { type ToolSet } from "@ai";

import { objectiveTool } from "./objective/index.ts";
import { promptSuggestionsTool } from "./prompt-suggestions/index.ts";
import { questionTool } from "./question/index.ts";

export const mammothTools = {
  objective: objectiveTool,
  question: questionTool,
  promptSuggestions: promptSuggestionsTool,
} satisfies ToolSet;

export type MammothToolName = keyof typeof mammothTools;

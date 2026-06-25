import { type ToolSet } from "@ai";

import { webSearchTool } from "../../../tools/web-search.ts";
import { demonstrationTool } from "./demontrate/index.ts";
import { objectiveTool } from "./objective.ts";
import { promptSuggestionsTool } from "./prompt-suggestions.ts";
import { questionTool } from "./question.ts";

export const tutorChatTools = {
  objective: objectiveTool,
  question: questionTool,
  "prompt-suggestions": promptSuggestionsTool,
  webSearch: webSearchTool,
  demonstration: demonstrationTool,
} satisfies ToolSet;

export type TutorChatToolName = keyof typeof tutorChatTools;

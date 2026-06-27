import { type ToolSet } from "@ai";


import { demonstrationTool } from "./demontrate/index.ts";
import { objectiveTool } from "./objective/index.ts";
import { promptSuggestionsTool } from "./prompt-suggestions/index.ts";
import { questionTool } from "./question/index.ts";

export const tutorChatTools = {
  objective: objectiveTool,
  question: questionTool,
  promptSuggestions: promptSuggestionsTool,
  demonstration: demonstrationTool,
} satisfies ToolSet;

export type TutorChatToolName = keyof typeof tutorChatTools;

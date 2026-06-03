import { type ToolSet } from "@ai";

import { webSearchTool } from "../../../tools/web-search.ts";
import { objectiveTool } from "./objective.ts";
import { questionTool } from "./question.ts";

export const tutorChatTools = {
  objective: objectiveTool,
  question: questionTool,
  webSearch: webSearchTool,
} satisfies ToolSet;

export type TutorChatToolName = keyof typeof tutorChatTools;

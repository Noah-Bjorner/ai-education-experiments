import { tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";

export const PROMPT_SUGGESTIONS_TOOL_DESCRIPTION = "Suggest follow-up prompts the learner can use when the conversation reaches a dead end or the next step may be unclear.";
export const PROMPT_SUGGESTIONS_SYSTEM_PROMPT_DESCRIPTION = "Use after your response when the conversation reaches a natural dead end, the learner may not know what to ask next, or helpful follow-up questions would guide the next step. Return only a structured array of concise, learner-facing prompt strings. Do not use this when you are already using the question tool, when the next action is obvious, or when the learner asked for a direct final answer.";

export const promptSuggestionsSchema = z.array(
  z.string().min(1).describe("A concise learner-facing prompt suggestion."),
).min(1).max(5).describe(
  "Context-aware prompts the learner can choose to continue the conversation.",
);

const promptSuggestionsInputSchema = z.object({
  suggestions: promptSuggestionsSchema,
});

export const promptSuggestionsTool = tool({
  description: PROMPT_SUGGESTIONS_TOOL_DESCRIPTION,
  inputSchema: promptSuggestionsInputSchema,
  execute: ({ suggestions }) => suggestions,
});

export type PromptSuggestionsToolOutput = z.infer<
  typeof promptSuggestionsSchema
>;
export type PromptSuggestionsToolInvocation = UIToolInvocation<
  typeof promptSuggestionsTool
>;

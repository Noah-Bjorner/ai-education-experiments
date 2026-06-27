import { tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";

export const promptSuggestionsSchema = z.array(
  z.string().min(1).describe("A concise learner-facing prompt suggestion."),
).min(1).max(5).describe(
  "Context-aware prompts the learner can choose to continue the conversation.",
);

const promptSuggestionsInputSchema = z.object({
  suggestions: promptSuggestionsSchema,
});

export const promptSuggestionsTool = tool({
  description:
    "Suggest follow-up prompts the learner can use when the conversation reaches a dead end or the next step may be unclear.",
  inputSchema: promptSuggestionsInputSchema,
  execute: ({ suggestions }) => suggestions,
});

export type PromptSuggestionsToolOutput = z.infer<
  typeof promptSuggestionsSchema
>;
export type PromptSuggestionsToolInvocation = UIToolInvocation<
  typeof promptSuggestionsTool
>;

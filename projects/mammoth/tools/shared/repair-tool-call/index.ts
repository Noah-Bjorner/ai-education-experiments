import {
  generateText,
  type LanguageModel,
  Output,
  type ToolCallRepairFunction,
  type ToolSet,
} from "@ai";
import { z } from "@zod";

const repairedToolCallInputSchema = z.object({
  input: z.string().min(1).describe(
    "A stringified JSON object containing the corrected tool input.",
  ),
});

export function createToolCallRepair<TOOLS extends ToolSet>(
  { model, tools }: { model: LanguageModel; tools: TOOLS },
): ToolCallRepairFunction<TOOLS> {
  return async ({ toolCall, inputSchema, error }) => {
    if (!(toolCall.toolName in tools)) {
      return null;
    }

    const schema = await inputSchema({ toolName: toolCall.toolName });
    const repair = await generateText({
      model,
      output: Output.object({ schema: repairedToolCallInputSchema }),
      prompt: [
        `The model produced invalid input for the "${toolCall.toolName}" tool.`,
        "Rewrite only the tool input so it matches the provided JSON schema exactly.",
        "Return the corrected input as a stringified JSON object.",
        "",
        `Validation error: ${String(error)}`,
        "",
        `JSON schema: ${JSON.stringify(schema)}`,
        "",
        `Invalid input: ${toolCall.input}`,
      ].join("\n"),
    });

    return {
      ...toolCall,
      input: repair.output.input,
    };
  };
}

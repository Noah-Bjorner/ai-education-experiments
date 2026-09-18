import { generateText, NoObjectGeneratedError, Output } from "@ai";
import {
  _TEST_WHITEBOARD_SPEC_SYSTEM_PROMPT,
  _TEST_WHITEBOARD_SPEC_USER_PROMPT,
} from "./prompt.ts";
import {
  InvalidSpecOutput,
  type SpecGenerationRequest,
  type SpecGenerationResult,
} from "./index.ts";
import type { WhiteboardMode } from "../schema.ts";
import { cerebras } from "../../../../../../lib/cerebras.ts";

function modelOptions(mode?: WhiteboardMode) {
  if (mode === "fast") {
    return {
      model: cerebras("qwen-3.8-27b"),
      providerOptions: { cerebras: { reasoningEffort: "medium" as const } },
    };
  }
  return { model: "openai/gpt-5.6-sol", reasoning: "medium" as const };
}

export const SPEC_REPAIR_INSTRUCTIONS =
  `Correct only the reported problems in the previous board. Return the complete corrected JSON object.
Preserve all figures, elements, annotations, unaffected IDs, supplied facts, values, and mathematical meaning. Do not delete content to pass validation. Change an ID or reference only when it is invalid or must follow a corrected ID. Keep the same available figure types and board-title policy. Placement remains application-owned.`;

/** Extract only structured-output failures; refusals and operational errors escape unchanged. */
export function invalidSpecOutputFromProvider(
  error: unknown,
): InvalidSpecOutput | undefined {
  if (
    !NoObjectGeneratedError.isInstance(error) || !error.text?.trim() ||
    (error.finishReason !== "stop" && error.finishReason !== "length")
  ) return undefined;
  // A refusal is not a malformed board. Providers normally expose it without JSON text.
  if (!/^[\s]*[\[{]/.test(error.text)) return undefined;
  return new InvalidSpecOutput(error.text, error.usage, { cause: error });
}

export async function generateSpecOutput(
  request: SpecGenerationRequest,
): Promise<SpecGenerationResult> {
  const { input, availableFigures, showTitle, schema, repair } = request;
  const system = _TEST_WHITEBOARD_SPEC_SYSTEM_PROMPT({ availableFigures });
  console.log("system ->\n", system);
  const prompt = [
    _TEST_WHITEBOARD_SPEC_USER_PROMPT({
      goal: input.goal,
      showTitle,
      availableFigures,
    }),
    repair
      ? `${SPEC_REPAIR_INSTRUCTIONS}\nPrevious output:\n${
        JSON.stringify(repair.previous)
      }\nValidation issues:\n${JSON.stringify(repair.issues)}`
      : "",
  ].filter(Boolean).join("\n\n");
  console.log("prompt ->\n", prompt);

  try {
    const { output, usage } = await generateText({
      ...modelOptions(input.mode),
      maxRetries: 1,
      system,
      prompt,
      output: Output.object({
        schema,
        name: "whiteboard_spec",
        description:
          "Complete whiteboard content in reading order, with semantic annotations.",
      }),
    });
    return { output, usage };
  } catch (error) {
    throw invalidSpecOutputFromProvider(error) ?? error;
  }
}

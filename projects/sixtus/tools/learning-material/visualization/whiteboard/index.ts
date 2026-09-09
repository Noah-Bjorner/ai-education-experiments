import "@std/dotenv/load";
import {
  type WhiteboardInput,
  WhiteboardOutput,
  type WhiteboardRequest,
  type WhiteboardResult,
  type WhiteboardSpec,
} from "./schema.ts";
import {
  WHITEBOARD_GOAL_WRAPPER_PROMPT,
  WHITEBOARD_SPEC_SYSTEM_PROMPT,
} from "./prompt.ts";
import { generateText, NoObjectGeneratedError, Output } from "@ai";
import { cerebras } from "../../../../../../lib/cerebras.ts";

export type {
  WhiteboardInput,
  WhiteboardRequest,
  WhiteboardResult,
  WhiteboardSpec,
} from "./schema.ts";

export const whiteboardSpec = async (
  input: WhiteboardInput,
): Promise<WhiteboardSpec> => {
  const { goal } = input;

  const system = WHITEBOARD_SPEC_SYSTEM_PROMPT;
  console.log("system: ", system);
  const prompt = WHITEBOARD_GOAL_WRAPPER_PROMPT(goal);

  try {
    const { output } = await generateText({
      model: cerebras("qwen-3.8-27b"),
      providerOptions: {
        cerebras: { reasoningEffort: "medium" },
      },
      //model: "google/gemini-3.8-flash",
      //reasoning: "high",
      system,
      prompt,
      output: Output.object({
        schema: WhiteboardOutput,
        name: "whiteboard_spec",
        description:
          "Layout and child visualization specs that accomplish the whiteboard's educational or communication goal.",
      }),
    });

    if (!output) {
      throw new Error(
        "Whiteboard spec generation produced no structured output.",
      );
    }

    return output;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      console.log("Whiteboard spec did not match schema.");
      console.log("Raw output:", error.text);
      console.log("Cause:", error.cause);
    }
    throw error;
  }
};

export { whiteboardSpec as whiteboard };

/** Render a whiteboard from a goal or an existing spec and return a public URL. */
export const executeWhiteboard = (
  _input: WhiteboardRequest,
): Promise<WhiteboardResult> => {
  // const url = await renderAndUploadWhiteboard(_input);
  // return { url };

  const temporaryUrl = "https://static.noahbjorner.com/sixtus/graph-2-pie_chart-v2.svg";

  return Promise.resolve({ url: temporaryUrl });
};

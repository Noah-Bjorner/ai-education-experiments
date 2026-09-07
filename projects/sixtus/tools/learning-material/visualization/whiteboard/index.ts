import "@std/dotenv/load";
import { WhiteboardOutput, type WhiteboardSpec } from "./schema.ts";
import { WHITEBOARD_SPEC_SYSTEM_PROMPT, WHITEBOARD_INSTRUCTION_WRAPPER_PROMPT } from "./prompt.ts";
import { generateText, NoObjectGeneratedError, Output } from "@ai";
import { cerebras } from "../../../../../../lib/cerebras.ts";

export interface WhiteboardInput {
  instruction: string;
  category: "charts" | "diagrams" | "maps";
}

export const whiteboardSpec = async (
  input: WhiteboardInput,
): Promise<WhiteboardSpec> => {
  const { instruction, category } = input;

  const system = WHITEBOARD_SPEC_SYSTEM_PROMPT;  
  console.log("system: ", system);
  const prompt = WHITEBOARD_INSTRUCTION_WRAPPER_PROMPT(instruction);

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
            description: "Layout and child visualization specs for the whiteboard.",
        }),
    });

    if (!output) {
      throw new Error("Whiteboard spec generation produced no structured output.");
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

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
import { uploadImage } from "../../../../../../lib/cloudflare.ts";
import { renderWhiteboardSvg } from "./render/index.ts";

const WHITEBOARD_UPLOAD_PREFIX = "sixtus/whiteboards";

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

function resolveWhiteboardSpec(
  input: WhiteboardRequest,
): Promise<WhiteboardSpec> {
  return "goal" in input ? whiteboardSpec(input) : Promise.resolve(input);
}

async function uploadWhiteboardSvg(svg: string): Promise<string> {
  const name = crypto.randomUUID();
  return await uploadImage(
    new Blob([svg], { type: "image/svg+xml" }),
    `${name}.svg`,
    { prefix: WHITEBOARD_UPLOAD_PREFIX, name },
  );
}






export const executeWhiteboard = async (
  input: WhiteboardRequest,
): Promise<WhiteboardResult> => {
  const spec = await resolveWhiteboardSpec(input);
  const { svg } = renderWhiteboardSvg(spec);
  const url = await uploadWhiteboardSvg(svg);
  return { url };
};

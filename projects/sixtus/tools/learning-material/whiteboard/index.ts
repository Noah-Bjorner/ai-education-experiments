import "@std/dotenv/load";
import { generateText, NoObjectGeneratedError, Output, tool, type UIToolInvocation } from "@ai";
import {
  type WhiteboardInput,
  whiteboardInputSchema,
  WhiteboardOutput,
  type WhiteboardRequest,
  type WhiteboardResult,
  whiteboardResultSchema,
  type WhiteboardSpec,
} from "./schema.ts";
import {
  WHITEBOARD_GOAL_WRAPPER_PROMPT,
  WHITEBOARD_SPEC_SYSTEM_PROMPT,
} from "./prompt.ts";
import { uploadImage } from "../../../../../lib/cloudflare.ts";
import { renderWhiteboardSvg } from "./render/index.ts";


/* all these are just tempoary for demo */

export const WHITEBOARD_TOOL_DESCRIPTION =
  "Show the learner a whiteboard diagram. Use when a chart, graph, geometry diagram, or composed visual explanation would help them understand something.";

export const WHITEBOARD_SYSTEM_PROMPT_DESCRIPTION = [
  "Use when a composed diagram would help the learner understand a relationship, comparison, quantity, or math idea.",
  "Prefer whiteboard over image when the visual should be a chart, graph, geometry diagram, or math layout rather than a photo or illustration.",
  "Pass a self-contained goal describing what the audience should understand, including relevant audience context, supplied facts or data, and constraints.",
].join("\n");

const WHITEBOARD_UPLOAD_PREFIX = "sixtus/whiteboards";

export {
  WHITEBOARD_DOMAINS,
  WHITEBOARD_FORMATS,
  WHITEBOARD_MODES,
  whiteboardInputSchema,
  whiteboardResultSchema,
} from "./schema.ts";

export type {
  WhiteboardDomain,
  WhiteboardFormat,
  WhiteboardInput,
  WhiteboardMode,
  WhiteboardRequest,
  WhiteboardResult,
  WhiteboardSpec,
} from "./schema.ts";

export const whiteboardSpec = async (
  input: WhiteboardInput,
): Promise<WhiteboardSpec> => {
  const { goal } = input;

  const system = WHITEBOARD_SPEC_SYSTEM_PROMPT;
  console.log("system.length: ", system.length);
  const prompt = WHITEBOARD_GOAL_WRAPPER_PROMPT(goal);

  const useFastModel = input.mode === "fast";

  try {
    const { output, usage, finalStep } = await generateText({
      model: useFastModel ? "alibaba/qwen3.8-27b" : "openai/gpt-5.6-sol",
      reasoning: useFastModel ? "medium" : "medium",
      ...(useFastModel
        ? {
          providerOptions: {
            gateway: { only: ["cerebras"] },
          },
        }
        : {}),
      system,
      prompt,
      output: Output.object({
        schema: WhiteboardOutput,
        name: "whiteboard_spec",
        description:
          "Anchored figure visualization specs that accomplish the whiteboard's educational or communication goal.",
      }),
    });

    console.log("usage:", usage);
    console.log("cost USD:", finalStep?.providerMetadata?.gateway?.cost);

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
  if ("format" in input && input.format === "svg") {
    return { svg };
  }
  const url = await uploadWhiteboardSvg(svg);
  return { url };
};

export const whiteboardTool = tool({
  description: WHITEBOARD_TOOL_DESCRIPTION,
  inputSchema: whiteboardInputSchema,
  outputSchema: whiteboardResultSchema,
  execute: (input) => executeWhiteboard(input),
});

export type WhiteboardToolInvocation = UIToolInvocation<typeof whiteboardTool>;

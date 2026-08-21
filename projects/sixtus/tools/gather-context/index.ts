import "@std/dotenv/load";
import { webSearch, webExtract, deepResearch } from "../../../../lib/parallel.ts";
import { extractVideoTranscriptTool } from "../../../../lib/supadata.ts";
import { generateText, tool, type UIToolInvocation, stepCountIs } from "@ai";
import { z } from "@zod";
import {
  createGatherContextPrompt,
  GATHER_CONTEXT_SYSTEM_PROMPT,
} from "./prompt.ts";

export const GATHER_CONTEXT_TOOL_DESCRIPTION =
  "Gather external context to ground your answer when it's missing from the conversation. Use when you need non-obvious facts, up-to-date information, or content from a URL.";
export const GATHER_CONTEXT_SYSTEM_PROMPT_DESCRIPTION =
  "Use when you need external context beyond the conversation and common knowledge — non-obvious facts, up-to-date information, or content from a URL or video. Pass a specific instruction for what to gather. Its purpose is internal: help you think and answer accurately, not produce student-facing text.";

const gatherContextInputSchema = z.object({
  instruction: z.string().min(1).describe(
    "What context to gather. Be specific about the facts or content needed, and include any URL to fetch.",
  ),
});

/** Max model steps. The final step forces text (no tools) so we never end on tool calls only. */
const GATHER_CONTEXT_MAX_STEPS = 3;

export const gatherContext = async (instruction: string) => {
  const start = performance.now();
  const trace: { toolName: string; input: unknown }[] = [];
  const { text } = await generateText({
    model: "openai/gpt-5.6-sol",
    reasoning: "medium",
    system: GATHER_CONTEXT_SYSTEM_PROMPT,
    prompt: createGatherContextPrompt(instruction),
    tools: {
      webSearch,
      webExtract,
      deepResearch,
      extractVideoTranscript: extractVideoTranscriptTool,
    },
    stopWhen: stepCountIs(GATHER_CONTEXT_MAX_STEPS),
    prepareStep: ({ stepNumber }) =>
      stepNumber === GATHER_CONTEXT_MAX_STEPS - 1 ? { toolChoice: "none" } : {},
    onToolExecutionStart({ toolCall }) {
      trace.push({ toolName: toolCall.toolName, input: toolCall.input });
    },
  });
  const end = performance.now();
  const durationSeconds = (end - start) / 1000;

  return { text, durationSeconds, trace };
};

export const gatherContextTool = tool({
  description: GATHER_CONTEXT_TOOL_DESCRIPTION,
  inputSchema: gatherContextInputSchema,
  execute: async ({ instruction }) => {
    const { text } = await gatherContext(instruction);
    return text;
  },
});

export type GatherContextToolInvocation = UIToolInvocation<
  typeof gatherContextTool
>;

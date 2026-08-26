import "@std/dotenv/load";
import { generateText, tool, type UIToolInvocation, stepCountIs } from "@ai";
import { z } from "@zod";

import { webSearch, webExtract, deepResearch } from "../../../../lib/parallel.ts";
import { extractVideoTranscriptTool } from "../../../../lib/supadata.ts";
import {
  groundedContextSchema,
  type GroundedContext,
} from "../../citations/schema.ts";
import { groundedContextFromDrafts, normalizeToolResults } from "../../citations/normalize.ts";
import { groundedContextToModelOutput } from "../../citations/format.ts";
import {
  createGatherContextPrompt,
  GATHER_CONTEXT_SYSTEM_PROMPT,
} from "./prompt.ts";

export const GATHER_CONTEXT_TOOL_DESCRIPTION =
  "Gather external context to ground your answer when it's missing from the conversation. Use when you need non-obvious facts, up-to-date information, or content from a URL.";
export const GATHER_CONTEXT_SYSTEM_PROMPT_DESCRIPTION =
  "Use when you need external context beyond the conversation and common knowledge — non-obvious facts, up-to-date information, or content from a URL or video. Pass a specific instruction for what to gather. Its purpose is internal: help you think and answer accurately, not produce learner-facing text. Cite returned source ids with <citation ref=\"SOURCE_ID\" />; never invent ids, titles, or URLs.";

const gatherContextInputSchema = z.object({
  instruction: z.string().min(1).describe(
    "What context to gather. Be specific about the facts or content needed, and include any URL to fetch.",
  ),
});

/** Max model steps. The final step forces text (no tools) so we never end on tool calls only. */
const GATHER_CONTEXT_MAX_STEPS = 3;
const EMPTY_CONTEXT_CONTENT =
  "Context gathering failed or returned no verified sources. Do not invent facts, quotes, statistics, URLs, or citations.";

export type GatherContextTrace = {
  toolName: string;
  input: unknown;
};

export type GatherContextResult = {
  context: GroundedContext;
  durationSeconds: number;
  trace: GatherContextTrace[];
};

export async function gatherContext(
  instruction: string,
  options: { toolCallId?: string } = {},
): Promise<GatherContextResult> {
  const start = performance.now();
  const toolCallId = options.toolCallId?.trim() || "local";
  const trace: GatherContextTrace[] = [];

  try {
    const result = await generateText({
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

    const drafts = normalizeToolResults(
      result.staticToolResults.map((toolResult) => ({
        toolName: toolResult.toolName,
        input: toolResult.input,
        output: toolResult.output,
      })),
    );
    const content = result.text.trim() ||
      (drafts.length === 0 ? EMPTY_CONTEXT_CONTENT : "Retrieved sources are attached. No additional synthesis was produced.");
    const context = groundedContextFromDrafts(content, drafts, toolCallId);
    const durationSeconds = (performance.now() - start) / 1000;

    console.info("gatherContext completed", {
      durationSeconds: Number(durationSeconds.toFixed(2)),
      sourceCount: context.sources.length,
      nestedToolCount: trace.length,
      nestedTools: trace.map((item) => item.toolName),
    });

    return { context, durationSeconds, trace };
  } catch (error) {
    const durationSeconds = (performance.now() - start) / 1000;
    console.error("gatherContext failed", {
      durationSeconds: Number(durationSeconds.toFixed(2)),
      nestedToolCount: trace.length,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      context: {
        content: EMPTY_CONTEXT_CONTENT,
        sources: [],
      },
      durationSeconds,
      trace,
    };
  }
}

export const gatherContextTool = tool({
  description: GATHER_CONTEXT_TOOL_DESCRIPTION,
  inputSchema: gatherContextInputSchema,
  outputSchema: groundedContextSchema,
  execute: async ({ instruction }, { toolCallId }) => {
    const { context } = await gatherContext(instruction, { toolCallId });
    return context;
  },
  toModelOutput: ({ output }) => groundedContextToModelOutput(output),
});

export type GatherContextToolInvocation = UIToolInvocation<
  typeof gatherContextTool
>;
export type GatherContextToolOutput = GroundedContext;

import { google } from "@ai-sdk/google";
import { generateText, tool, type ToolSet, type UIToolInvocation } from "@ai";
import { z } from "@zod";

export const GATHER_CONTEXT_TOOL_DESCRIPTION = "Search the web and read URLs to gather up-to-date context needed to answer the student accurately.";
export const GATHER_CONTEXT_SYSTEM_PROMPT_DESCRIPTION = "Use when you need current information, facts, or page content you are not confident about from memory alone, such as recent events, live data, or a URL the user references. Pass a clear, specific prompt describing exactly what information to find. Do not use this for general teaching content you already know well.";

const gatherContextInputSchema = z.object({
  prompt: z.string().min(1).describe(
    "A specific research question or instruction describing what information to gather, including any URLs to read.",
  ),
});

export const gatherContext = async (prompt: string) => {
  const start = performance.now();
  const { text } = await generateText({
    model: "google/gemini-3.5-flash",
    reasoning: "medium",
    tools: {
      google_search: google.tools.googleSearch({}),
      url_context: google.tools.urlContext({}),
    } as ToolSet,
    prompt,
  });
  const end = performance.now();
  const durationSeconds = (end - start) / 1000;

  return { text, durationSeconds };
};

export const gatherContextTool = tool({
  description: GATHER_CONTEXT_TOOL_DESCRIPTION,
  inputSchema: gatherContextInputSchema,
  execute: async ({ prompt }) => {
    const { text } = await gatherContext(prompt);
    return text;
  },
});

export type GatherContextToolInvocation = UIToolInvocation<
  typeof gatherContextTool
>;

import { tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";

import { parallelSearch } from "../lib/parallel.ts";

export const webSearchTool = tool({
  description:
    "Search the web for current information and return concise excerpts with source URLs.",
  inputSchema: z.object({
    objective: z.string().min(1).describe(
      "What information to find and which details make results relevant.",
    ),
    searchQueries: z.array(z.string().min(1)).min(1).max(8).describe(
      "Concise keyword queries to run. Use 2-3 targeted queries for most questions.",
    ),
    maxResults: z.number().int().min(1).max(10).optional().describe(
      "Maximum number of search results to return. Defaults to 5.",
    ),
  }),
  execute: async (
    { objective, searchQueries, maxResults = 5 },
    { abortSignal },
  ) => {
    const search = await parallelSearch(
      { objective, searchQueries },
      { abortSignal },
    );

    return {
      objective,
      searchId: search.search_id,
      results: search.results.slice(0, maxResults).map((result) => ({
        title: result.title,
        url: result.url,
        publishDate: result.publish_date ?? undefined,
        excerpts: result.excerpts,
      })),
      warnings: search.warnings ?? null,
    };
  },
});

export type WebSearchToolInvocation = UIToolInvocation<typeof webSearchTool>;

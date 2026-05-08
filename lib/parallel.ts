import "@std/dotenv/load";
import { z } from "@zod";

const PARALLEL_SEARCH_URL = "https://api.parallel.ai/v1/search";

const parallelSearchResultSchema = z.object({
  url: z.string(),
  title: z.string(),
  publish_date: z.string().nullable().optional(),
  excerpts: z.array(z.string()),
});

const parallelSearchResponseSchema = z.object({
  search_id: z.string(),
  results: z.array(parallelSearchResultSchema),
  warnings: z.unknown().nullable().optional(),
  usage: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
    }),
  ).optional(),
  session_id: z.string().optional(),
});

export type ParallelSearchResult = z.infer<typeof parallelSearchResultSchema>;
export type ParallelSearchResponse = z.infer<
  typeof parallelSearchResponseSchema
>;

export type ParallelSearchInput = {
  objective: string;
  searchQueries: string[];
};

export async function parallelSearch(
  input: ParallelSearchInput,
  options: { abortSignal?: AbortSignal } = {},
): Promise<ParallelSearchResponse> {
  const apiKey = Deno.env.get("PARALLEL_API_KEY");

  if (!apiKey) {
    throw new Error("PARALLEL_API_KEY environment variable is required");
  }

  const response = await fetch(PARALLEL_SEARCH_URL, {
    method: "POST",
    signal: options.abortSignal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      objective: input.objective,
      search_queries: input.searchQueries,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Parallel search failed with ${response.status} ${response.statusText}`,
    );
  }

  return parallelSearchResponseSchema.parse(await response.json());
}

import "@std/dotenv/load";

import { tool } from "@ai";
import { z } from "@zod";
import { Parallel } from "@parallel-web";

const parallel = new Parallel({
  apiKey: Deno.env.get('PARALLEL_API_KEY'),
});

export const webSearch = tool({
  description: 'Search the web for information.',
  inputSchema: z.object({
    search_queries: z.array(z.string()).min(1).describe('Keyword search queries'),
    objective: z.string().nullable().optional().describe("The user's question"),
    mode: z
      .enum(['turbo', 'basic', 'advanced'])
      .optional()
      .default('turbo')
      .describe('Use turbo for simple lookups, basic for typical research, advanced for multi-hop or deep queries; defaults to turbo.'),
  }),
  execute: async ({ search_queries, objective, mode }, { abortSignal }) => {
    return await parallel.search(
      {
        search_queries,
        objective,
        mode,
        advanced_settings: { max_results: 10 },
      },
      { signal: abortSignal },
    );
  },
});

export const webExtract = tool({
  description: 'Extract content from web URLs.',
  inputSchema: z.object({
    urls: z.array(z.string()).min(1).describe('URLs to extract content from'),
    objective: z.string().nullable().optional().describe('What information to look for in the URLs'),
  }),
  execute: async ({ urls, objective }, { abortSignal }) => {
    return await parallel.extract(
      {
        urls,
        objective,
      },
      { signal: abortSignal },
    );
  },
});

export const deepResearch = tool({
  description:
    'Run deep multi-step deep research and return a synthesized answer.',
  inputSchema: z.object({
    input: z.string().min(1).describe('Research question or entity to look up'),
    processor: z
      .enum(['base', 'core', 'core2x', 'pro', 'ultra'])
      .optional()
      .default('base')
      .describe(
        [
          'Research depth / latency tradeoff. Defaults to core.',
          'base: Efficient for standard tasks (15s-50s).',
          'core: Balanced and strong at many tasks (15s-2min).',
          'core2x: High complexity cross-referenced outputs (15s-3min).',
          'pro: Exploratory web research (30s-5min).',
          'ultra: Extensive deep research (1min-10min).',
        ].join(' '),
      ),
  }),
  execute: async ({ input, processor }, { abortSignal }) => {
    const taskRun = await parallel.taskRun.create(
      {
        input,
        processor,
      },
      { signal: abortSignal },
    );
    return await parallel.taskRun.result(
      taskRun.run_id,
      { timeout: 3600 },
      { signal: abortSignal },
    );
  },
});

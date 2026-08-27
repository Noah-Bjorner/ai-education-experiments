import "@std/dotenv/load";
import { generateText } from "@ai";
import { detect } from "tinyld";

import { searchWeb } from "../../../lib/parallel.ts";
import { imageSearch } from "../../../lib/serper.ts";
import {
  getSixtusRedisCache,
  setSixtusRedisCache,
} from "../../../lib/upstash.ts";
import {
  type CitationSourceDraft,
  normalizeWebSearchResult,
} from "../citations/normalize.ts";
import {
  type ContextLookupRequest,
  type ContextLookupResult,
  contextLookupResultSchema,
} from "./schema.ts";

const MAX_LOOKUP_SOURCES = 5;

const languageDisplayNames = new Intl.DisplayNames(["en"], {
  type: "language",
});

function detectResponseLanguage(text: string): string {
  const code = detect(text);
  if (!code) return "English";
  return languageDisplayNames.of(code) ?? "English";
}

function contextLookupCacheKey(term: string, language: string): string {
  const normalizedLanguage = language.trim().toLowerCase();
  const normalizedTerm = term.trim().toLowerCase().replace(/\s+/g, " ");
  return `sixtus:context-lookup:${normalizedLanguage}:${normalizedTerm}`;
}

async function readContextLookupCache(
  cacheKey: string,
): Promise<ContextLookupResult | null> {
  try {
    const cached = await getSixtusRedisCache<ContextLookupResult>(cacheKey);
    if (!cached) return null;
    const parsed = contextLookupResultSchema.safeParse(cached);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.error("Sixtus context lookup cache read failed", error);
    return null;
  }
}

async function writeContextLookupCache(
  cacheKey: string,
  result: ContextLookupResult,
): Promise<void> {
  try {
    const ninetyDaysInSeconds = 60 * 60 * 24 * 90;
    await setSixtusRedisCache(cacheKey, result, { ex: ninetyDaysInSeconds });
  } catch (error) {
    console.error("Sixtus context lookup cache write failed", error);
  }
}

function contextLookupSystemPrompt(language: string): string {
  return `You write a short standalone card that answers "What does this term mean?"

- Use the search results as grounding. Prefer them over prior knowledge when they cover the term.
- Write a self-contained explanation of the term.
- Explain the primary meaning from the search results. Mention other common meanings only when they would confuse a learner, in one clause.
- If search results are missing or thin, say so briefly and only then use prior knowledge, marking uncertainty.
- Write 2-5 sentences. Respond in ${language}.
- Respond only in plain text.`;
}

function formatSourcesForPrompt(sources: CitationSourceDraft[]): string {
  if (sources.length === 0) {
    return "No search results were found.";
  }

  return sources.map((source, index) => {
    const lines = [
      `### ${index + 1}. ${source.title}`,
    ];
    if (source.url) lines.push(source.url);
    lines.push(source.excerpt);
    return lines.join("\n");
  }).join("\n\n");
}

export async function generateContextLookup(
  { term, context_message }: ContextLookupRequest,
): Promise<ContextLookupResult> {
  const apiKey = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is required to run Sixtus.");
  }
  const language = detectResponseLanguage(context_message);
  const cacheKey = contextLookupCacheKey(term, language);
  const cached = await readContextLookupCache(cacheKey);
  if (cached) {
    return { ...cached, term };
  }

  const [search, imageResults] = await Promise.all([
    searchWeb({
      search_queries: [term, `${term} definition`],
      objective:
        `Extract a concise encyclopedic definition of "${term}": what it is, its primary sense, and 1-2 distinguishing facts. Prefer encyclopedia entries, textbooks, and official reference pages. Ignore navigation, ads, footers, and forum or Q&A threads asking what the word means.`,
      mode: "fast",
      max_results: MAX_LOOKUP_SOURCES,
    }),
    imageSearch({ q: term, num: 5, download: false }),
  ]);
  const drafts = normalizeWebSearchResult(search).slice(0, MAX_LOOKUP_SOURCES);
  const sources = drafts.flatMap((draft) =>
    draft.url ? [{ title: draft.title, url: draft.url }] : []
  );
  const images = imageResults.map((image) => image.url);

  const system = contextLookupSystemPrompt(language);
  const prompt = [
    "## Term",
    term,
    "",
    "## Search results",
    formatSourcesForPrompt(drafts),
  ].join("\n");

  const { text } = await generateText({
    model: "google/gemma-4-31b-it", //update to qwen3.8-27b when it's available sep 3
    system,
    prompt,
    providerOptions: {
      gateway: {
        only: ["cerebras"],
      },
    },
  });

  const result: ContextLookupResult = {
    term,
    explanation: text.trim(),
    sources,
    images,
  };
  await writeContextLookupCache(cacheKey, result);
  return result;
}

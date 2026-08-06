import {
  matchLibraryItems,
  type LibrarySearchMatch,
} from "../database/index.ts";
import { embedMultimodal } from "./embedding.ts";

export type { LibrarySearchMatch };

export type HighlightRange = {
  start: number;
  end: number;
};

export type LibrarySearchResult = LibrarySearchMatch & {
  /** Short display excerpt around the best local span. */
  snippet: string;
  /** Character offsets into `matched_content` for UI marking. */
  highlights: HighlightRange[];
};

const SNIPPET_RADIUS = 140;
const MIN_WINDOW_CHARS = 40;
const MAX_WINDOW_CHARS = 280;

export async function searchLibrary(input: {
  userId: string;
  query: string;
  matchThreshold?: number;
  matchCount?: number;
}): Promise<LibrarySearchResult[]> {
  const query = input.query.trim();
  if (!query) {
    return [];
  }

  const queryEmbedding = await embedMultimodal([{ text: query }]);

  const matches = await matchLibraryItems({
    userId: input.userId,
    queryEmbedding,
    matchThreshold: input.matchThreshold ?? 0.55,
    matchCount: input.matchCount ?? 10,
  });

  return matches.map((match) => ({
    ...match,
    ...highlightSnippet(query, match.matched_content),
  }));
}

/** Pick the best local span inside chunk text using query-term overlap (no embeds). */
export function highlightSnippet(
  query: string,
  content: string,
): { snippet: string; highlights: HighlightRange[] } {
  if (!content.trim()) {
    return { snippet: "", highlights: [] };
  }

  // Keep offsets relative to the original `matched_content` string.
  const text = content;
  const queryTokens = tokenize(query);
  const best = pickBestWindow(text, queryTokens);

  if (best.score <= 0) {
    const end = Math.min(text.length, MAX_WINDOW_CHARS);
    return {
      snippet: formatSnippet(text, 0, end),
      highlights: [],
    };
  }

  const highlights = findTokenRanges(text, queryTokens, best.start, best.end);
  const snippetStart = Math.max(0, best.start - SNIPPET_RADIUS);
  const snippetEnd = Math.min(text.length, best.end + SNIPPET_RADIUS);

  return {
    snippet: formatSnippet(text, snippetStart, snippetEnd),
    highlights,
  };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((token) => token.length > 1) ?? [];
}

function splitSentences(text: string): Array<{ start: number; end: number }> {
  const parts: Array<{ start: number; end: number }> = [];
  const re = /[^.!?\n]+[.!?]+(?:\s+|$)|[^.!?\n]+$/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const raw = match[0];
    const leading = raw.match(/^\s*/)?.[0].length ?? 0;
    const trailing = raw.match(/\s*$/)?.[0].length ?? 0;
    const start = match.index + leading;
    const end = match.index + raw.length - trailing;
    if (end > start) {
      parts.push({ start, end });
    }
  }

  if (parts.length === 0) {
    return [{ start: 0, end: text.length }];
  }

  const merged: Array<{ start: number; end: number }> = [];
  for (const part of parts) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      (part.end - part.start < MIN_WINDOW_CHARS ||
        prev.end - prev.start < MIN_WINDOW_CHARS)
    ) {
      prev.end = part.end;
    } else {
      merged.push({ ...part });
    }
  }

  return merged;
}

function pickBestWindow(
  text: string,
  queryTokens: string[],
): { start: number; end: number; score: number } {
  const sentences = splitSentences(text);
  let best = {
    start: 0,
    end: Math.min(text.length, MAX_WINDOW_CHARS),
    score: 0,
  };

  const candidates: Array<{ start: number; end: number }> = [...sentences];

  for (let i = 0; i < sentences.length - 1; i++) {
    candidates.push({
      start: sentences[i]!.start,
      end: sentences[i + 1]!.end,
    });
  }

  // Sliding windows help long transcript lines without punctuation.
  const step = Math.floor(MAX_WINDOW_CHARS / 2);
  for (let start = 0; start < text.length; start += step) {
    const end = Math.min(text.length, start + MAX_WINDOW_CHARS);
    candidates.push({ start, end });
    if (end >= text.length) break;
  }

  for (const candidate of candidates) {
    const span = text.slice(candidate.start, candidate.end);
    if (span.trim().length < MIN_WINDOW_CHARS && text.length > MIN_WINDOW_CHARS) {
      continue;
    }

    const score = scoreSpan(span, queryTokens);
    if (score > best.score) {
      best = { ...candidate, score };
    }
  }

  return best;
}

function scoreSpan(span: string, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;

  const spanTokens = tokenize(span);
  if (spanTokens.length === 0) return 0;

  const spanSet = new Set(spanTokens);
  let hits = 0;
  let consecutive = 0;
  let bestConsecutive = 0;

  for (const token of queryTokens) {
    const matched = spanSet.has(token) ||
      spanTokens.some((s) => s.startsWith(token) || token.startsWith(s));
    if (matched) {
      hits += 1;
      consecutive += 1;
      bestConsecutive = Math.max(bestConsecutive, consecutive);
    } else {
      consecutive = 0;
    }
  }

  const density = hits / Math.max(spanTokens.length, 1);
  return hits * 3 + bestConsecutive * 1.5 + density;
}

function findTokenRanges(
  text: string,
  queryTokens: string[],
  from: number,
  to: number,
): HighlightRange[] {
  if (queryTokens.length === 0) return [];

  const region = text.slice(from, to);
  const ranges: HighlightRange[] = [];
  const unique = [...new Set(queryTokens)].sort((a, b) => b.length - a.length);

  for (const token of unique) {
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(token)}(?![\\p{L}\\p{N}])`,
      "giu",
    );
    let match: RegExpExecArray | null;
    while ((match = re.exec(region)) !== null) {
      ranges.push({
        start: from + match.index,
        end: from + match.index + match[0].length,
      });
    }
  }

  return mergeRanges(ranges);
}

function mergeRanges(ranges: HighlightRange[]): HighlightRange[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: HighlightRange[] = [{ ...sorted[0]! }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

function formatSnippet(text: string, start: number, end: number): string {
  let from = start;
  let to = end;

  if (from > 0) {
    const space = text.lastIndexOf(" ", from);
    if (space >= Math.max(0, from - 40)) from = space + 1;
  }
  if (to < text.length) {
    const space = text.indexOf(" ", to);
    if (space !== -1 && space <= to + 40) to = space;
  }

  const prefix = from > 0 ? "…" : "";
  const suffix = to < text.length ? "…" : "";
  return `${prefix}${text.slice(from, to).trim()}${suffix}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


if (import.meta.main) {
  const start = performance.now();
  const query = "Varför har Katolska kyrkan inte några kvinnliga präster?";
  const results = await searchLibrary({
    userId: "ff52ec97-73c6-42f4-a9ea-c1c320ac1646",
    query,
  });
  const end = performance.now();
  console.log("query:", query);
  console.log("results:", results.length, results);
  console.log(`Time taken: ${((end - start) / 1000).toFixed(2)} seconds`);
}

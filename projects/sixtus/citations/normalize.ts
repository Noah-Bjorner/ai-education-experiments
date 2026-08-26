import type { LibrarySearchMatch } from "../database/index.ts";
import {
  assignCitationIds,
  type CitationKind,
  type CitationSource,
  type GroundedContext,
} from "./schema.ts";

export const MAX_EXCERPT_CHARS = 800;
export const MAX_SOURCES_PER_CALL = 12;

export type CitationSourceDraft = Omit<CitationSource, "id">;

export type ToolResultLike = {
  toolName: string;
  input: unknown;
  output: unknown;
};

export function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function canonicalizeHttpUrl(value: string): string | undefined {
  if (!isSafeHttpUrl(value)) return undefined;
  const parsed = new URL(value);
  parsed.hash = "";
  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }
  return parsed.toString();
}

export function truncateExcerpt(text: string, maxChars = MAX_EXCERPT_CHARS): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function titleFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function joinExcerpts(excerpts: string[]): string {
  return truncateExcerpt(excerpts.filter((part) => part.trim()).join("\n\n"));
}

function draftFromWebResult(input: {
  url: unknown;
  title?: unknown;
  excerpts?: unknown;
  fullContent?: unknown;
  locator?: string;
}): CitationSourceDraft | undefined {
  if (typeof input.url !== "string") return undefined;
  const url = canonicalizeHttpUrl(input.url);
  if (!url) return undefined;

  const excerptParts = Array.isArray(input.excerpts)
    ? input.excerpts.filter((part): part is string =>
      typeof part === "string" && part.trim().length > 0
    )
    : [];
  const fullContent = typeof input.fullContent === "string"
    ? input.fullContent
    : undefined;
  const excerpt = excerptParts.length > 0
    ? joinExcerpts(excerptParts)
    : fullContent
    ? truncateExcerpt(fullContent)
    : "";
  if (!excerpt) return undefined;

  const title = typeof input.title === "string" && input.title.trim()
    ? input.title.trim()
    : titleFromUrl(url);

  return {
    kind: "web",
    title,
    url,
    excerpt,
    locator: input.locator ? { label: input.locator } : undefined,
  };
}

export function normalizeWebSearchResult(output: unknown): CitationSourceDraft[] {
  if (!isRecord(output) || !Array.isArray(output.results)) return [];
  return compactDrafts(output.results.map((result) => {
    if (!isRecord(result)) return undefined;
    return draftFromWebResult({
      url: result.url,
      title: result.title,
      excerpts: result.excerpts,
    });
  }));
}

export function normalizeWebExtractResult(output: unknown): CitationSourceDraft[] {
  if (!isRecord(output) || !Array.isArray(output.results)) return [];
  return compactDrafts(output.results.map((result) => {
    if (!isRecord(result)) return undefined;
    return draftFromWebResult({
      url: result.url,
      title: result.title,
      excerpts: result.excerpts,
      fullContent: result.full_content,
    });
  }));
}

export function normalizeDeepResearchResult(output: unknown): CitationSourceDraft[] {
  if (!isRecord(output)) return [];
  const nested = isRecord(output.output) ? output.output : output;
  const basis = Array.isArray(nested.basis) ? nested.basis : [];
  const drafts: Array<CitationSourceDraft | undefined> = [];

  for (const field of basis) {
    if (!isRecord(field) || !Array.isArray(field.citations)) continue;
    for (const citation of field.citations) {
      if (!isRecord(citation)) continue;
      drafts.push(draftFromWebResult({
        url: citation.url,
        title: citation.title,
        excerpts: citation.excerpts,
      }));
    }
  }

  return compactDrafts(drafts);
}

export function normalizeTranscriptResult(
  output: unknown,
  url?: string,
): CitationSourceDraft[] {
  if (typeof output !== "string" || !output.trim()) return [];
  if (!url) return [];
  const canonicalUrl = canonicalizeHttpUrl(url);
  if (!canonicalUrl) return [];

  const locator = firstTranscriptLocator(output);
  return [{
    kind: "video",
    title: titleFromUrl(canonicalUrl),
    url: canonicalUrl,
    excerpt: truncateExcerpt(output),
    locator: locator ? { label: locator } : undefined,
  }];
}

export function normalizeLibraryMatch(
  match: LibrarySearchMatch,
): CitationSourceDraft | undefined {
  const url = canonicalizeHttpUrl(match.src_url);
  const excerpt = truncateExcerpt(match.matched_content);
  if (!excerpt) return undefined;

  const kind: CitationKind = match.type === "document" || match.type === "image"
    ? "user-document"
    : "library";

  return {
    kind,
    title: match.name.trim() || (url ? titleFromUrl(url) : "Library item"),
    url,
    excerpt,
    locator: { label: `chunk ${match.matched_chunk_index}` },
  };
}

export function dedupeSourceDrafts(
  drafts: CitationSourceDraft[],
): CitationSourceDraft[] {
  const seen = new Set<string>();
  const unique: CitationSourceDraft[] = [];

  for (const draft of drafts) {
    const key = draft.url ?? `${draft.kind}:${draft.title}:${draft.excerpt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(draft);
  }

  return unique.slice(0, MAX_SOURCES_PER_CALL);
}

export function normalizeToolResults(
  results: ReadonlyArray<ToolResultLike>,
): CitationSourceDraft[] {
  const drafts: CitationSourceDraft[] = [];

  for (const result of results) {
    switch (result.toolName) {
      case "webSearch":
        drafts.push(...normalizeWebSearchResult(result.output));
        break;
      case "webExtract":
        drafts.push(...normalizeWebExtractResult(result.output));
        break;
      case "deepResearch":
        drafts.push(...normalizeDeepResearchResult(result.output));
        break;
      case "extractVideoTranscript":
        drafts.push(
          ...normalizeTranscriptResult(
            result.output,
            readToolInputUrl(result.input),
          ),
        );
        break;
      default:
        break;
    }
  }

  return dedupeSourceDrafts(drafts);
}

export function groundedContextFromDrafts(
  content: string,
  drafts: CitationSourceDraft[],
  toolCallId: string,
): GroundedContext {
  return {
    content: content.trim(),
    sources: assignCitationIds(drafts, toolCallId),
  };
}

function firstTranscriptLocator(markdown: string): string | undefined {
  const match = markdown.match(/\[(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)\]/);
  if (!match) return undefined;
  return `${match[1]}-${match[2]}`;
}

function readToolInputUrl(input: unknown): string | undefined {
  if (!isRecord(input) || typeof input.url !== "string") return undefined;
  return input.url;
}

function compactDrafts(
  drafts: Array<CitationSourceDraft | undefined>,
): CitationSourceDraft[] {
  return drafts.filter((draft): draft is CitationSourceDraft => draft != null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

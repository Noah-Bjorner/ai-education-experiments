import "@std/dotenv/load";
import { embed } from "@ai";
import type { LibraryEmbeddingChunk } from "../database/index.ts";

type EmbeddingPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } } // base64
  | { fileData: { fileUri: string; mimeType: string } }; // http(s) or gs://

export async function embedMultimodal(
  parts: EmbeddingPart[],
  value = "",
): Promise<number[]> {
  const { embedding } = await embed({
    model: "google/gemini-embedding-2",
    value, // text still goes here; multimodal parts merge with it
    providerOptions: {
      google: {
        outputDimensionality: 1536,
        content: [parts], // one entry per value
      },
    },
  });

  return embedding;
}

export type MarkdownChunk = {
  content: string;
  headingPath: string;
};

type MarkdownBlock = {
  kind: "heading" | "code" | "list" | "table" | "blockquote" | "paragraph";
  text: string;
  headingLevel?: number;
  headingTitle?: string;
};

const DEFAULT_MAX_CHARS = 2000;
const DEFAULT_MIN_CHARS = 500;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const FENCE_RE = /^(`{3,}|~{3,})/;
const LIST_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const BLOCKQUOTE_RE = /^\s*>/;
const SENTENCE_BOUNDARY_RE = /(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÄÖÜÅÆØ"'(])/;

export function chunkMarkdown(
  text: string,
  opts: { maxChars?: number; minChars?: number } = {},
): MarkdownChunk[] {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const minChars = Math.min(opts.minChars ?? DEFAULT_MIN_CHARS, maxChars);
  const blocks = scanMarkdownBlocks(text);
  const prepared = assignHeadingPaths(blocks);
  return coalesceSmallChunks(packBlocks(prepared, maxChars), minChars, maxChars);
}

export function buildEmbeddingInput(chunk: MarkdownChunk): string {
  if (!chunk.headingPath) return chunk.content;
  return `Section: ${chunk.headingPath}\n\n${chunk.content}`;
}

export function chunkAndEmbedMarkdown(
  text: string,
): Promise<LibraryEmbeddingChunk[]> {
  const chunks = chunkMarkdown(text, {
    maxChars: DEFAULT_MAX_CHARS,
    minChars: DEFAULT_MIN_CHARS,
  });
  return Promise.all(
    chunks.map(async (chunk, chunkIndex) => ({
      chunkIndex,
      content: chunk.content,
      embedding: await embedMultimodal([{ text: buildEmbeddingInput(chunk) }]),
    })),
  );
}

function scanMarkdownBlocks(text: string): MarkdownBlock[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      blocks.push({
        kind: "heading",
        text: line.trimEnd(),
        headingLevel: heading[1]!.length,
        headingTitle: heading[2]!.trim(),
      });
      i += 1;
      continue;
    }

    const fence = line.match(FENCE_RE);
    if (fence) {
      const marker = fence[1]!;
      const fenceLines = [line];
      i += 1;
      while (i < lines.length) {
        fenceLines.push(lines[i]!);
        if (lines[i]!.startsWith(marker)) {
          i += 1;
          break;
        }
        i += 1;
      }
      blocks.push({ kind: "code", text: fenceLines.join("\n") });
      continue;
    }

    if (LIST_RE.test(line)) {
      const listLines = [line];
      i += 1;
      while (i < lines.length) {
        const next = lines[i]!;
        if (!next.trim()) {
          // Allow a blank line inside a list only when the following line continues it.
          const peek = lines[i + 1];
          if (peek && (LIST_RE.test(peek) || /^\s{2,}\S/.test(peek))) {
            listLines.push(next);
            i += 1;
            continue;
          }
          break;
        }
        if (LIST_RE.test(next) || /^\s{2,}\S/.test(next)) {
          listLines.push(next);
          i += 1;
          continue;
        }
        break;
      }
      blocks.push({ kind: "list", text: listLines.join("\n").trimEnd() });
      continue;
    }

    if (TABLE_ROW_RE.test(line)) {
      const tableLines = [line];
      i += 1;
      while (i < lines.length && TABLE_ROW_RE.test(lines[i]!)) {
        tableLines.push(lines[i]!);
        i += 1;
      }
      blocks.push({ kind: "table", text: tableLines.join("\n").trimEnd() });
      continue;
    }

    if (BLOCKQUOTE_RE.test(line)) {
      const quoteLines = [line];
      i += 1;
      while (i < lines.length && BLOCKQUOTE_RE.test(lines[i]!)) {
        quoteLines.push(lines[i]!);
        i += 1;
      }
      blocks.push({
        kind: "blockquote",
        text: quoteLines.join("\n").trimEnd(),
      });
      continue;
    }

    const paragraphLines = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i]!;
      if (!next.trim()) break;
      if (
        HEADING_RE.test(next) ||
        FENCE_RE.test(next) ||
        LIST_RE.test(next) ||
        TABLE_ROW_RE.test(next) ||
        BLOCKQUOTE_RE.test(next)
      ) {
        break;
      }
      paragraphLines.push(next);
      i += 1;
    }
    blocks.push({
      kind: "paragraph",
      text: paragraphLines.join("\n").trimEnd(),
    });
  }

  return blocks;
}

function assignHeadingPaths(
  blocks: MarkdownBlock[],
): Array<{ text: string; headingPath: string }> {
  const stack: Array<{ level: number; title: string }> = [];
  const prepared: Array<{ text: string; headingPath: string }> = [];

  for (const block of blocks) {
    if (block.kind === "heading") {
      const level = block.headingLevel!;
      while (stack.length > 0 && stack[stack.length - 1]!.level >= level) {
        stack.pop();
      }
      stack.push({ level, title: block.headingTitle! });
      continue;
    }

    prepared.push({
      text: block.text,
      headingPath: stack.map((entry) => entry.title).join(" > "),
    });
  }

  return prepared;
}

function packBlocks(
  blocks: Array<{ text: string; headingPath: string }>,
  maxChars: number,
): MarkdownChunk[] {
  const chunks: MarkdownChunk[] = [];
  let currentContent = "";
  let currentPath = "";

  const flush = () => {
    const content = currentContent.trim();
    if (content) {
      chunks.push({ content, headingPath: currentPath });
    }
    currentContent = "";
    currentPath = "";
  };

  for (const block of blocks) {
    const pieces = splitOversizedBlock(block.text, maxChars);

    for (const piece of pieces) {
      if (!currentContent) {
        currentContent = piece;
        currentPath = block.headingPath;
        continue;
      }

      const samePath = currentPath === block.headingPath;
      const candidate = `${currentContent}\n\n${piece}`;

      if (samePath && candidate.length <= maxChars) {
        currentContent = candidate;
        continue;
      }

      flush();
      currentContent = piece;
      currentPath = block.headingPath;
    }
  }

  flush();
  return chunks;
}

/** Merge undersized leftovers into neighbors when they still fit under maxChars. */
function coalesceSmallChunks(
  chunks: MarkdownChunk[],
  minChars: number,
  maxChars: number,
): MarkdownChunk[] {
  if (chunks.length <= 1 || minChars <= 0) return chunks;

  const merged: MarkdownChunk[] = [];

  for (const chunk of chunks) {
    if (merged.length === 0) {
      merged.push({ ...chunk });
      continue;
    }

    const prev = merged[merged.length - 1]!;
    const eitherTooSmall =
      prev.content.length < minChars || chunk.content.length < minChars;
    const candidate = `${prev.content}\n\n${chunk.content}`;

    if (eitherTooSmall && candidate.length <= maxChars) {
      prev.content = candidate;
      if (!prev.headingPath && chunk.headingPath) {
        prev.headingPath = chunk.headingPath;
      }
      continue;
    }

    merged.push({ ...chunk });
  }

  return merged;
}

function splitOversizedBlock(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const preferSentences = !looksLikeStructuredBlock(text);
  const units = preferSentences
    ? splitIntoSentences(text)
    : text.split("\n");

  const parts: string[] = [];
  let current = "";
  const joiner = preferSentences ? " " : "\n";

  for (const unit of units) {
    const trimmed = unit.trimEnd();
    if (!trimmed) {
      if (!preferSentences && current) current += "\n";
      continue;
    }

    if (trimmed.length > maxChars) {
      if (current.trim()) {
        parts.push(current.trim());
        current = "";
      }
      parts.push(...splitByLength(trimmed, maxChars));
      continue;
    }

    const candidate = current ? `${current}${joiner}${trimmed}` : trimmed;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current.trim()) parts.push(current.trim());
    current = trimmed;
  }

  if (current.trim()) parts.push(current.trim());
  return parts.length > 0 ? parts : [text.slice(0, maxChars)];
}

function looksLikeStructuredBlock(text: string): boolean {
  const first = text.split("\n")[0] ?? "";
  return (
    FENCE_RE.test(first) ||
    LIST_RE.test(first) ||
    TABLE_ROW_RE.test(first) ||
    BLOCKQUOTE_RE.test(first)
  );
}

function splitIntoSentences(text: string): string[] {
  const sentences = text
    .split(SENTENCE_BOUNDARY_RE)
    .map((part) => part.trim())
    .filter(Boolean);
  return sentences.length > 0 ? sentences : [text];
}

function splitByLength(text: string, maxChars: number): string[] {
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    let cut = remaining.lastIndexOf(" ", maxChars);
    if (cut < Math.floor(maxChars * 0.5)) cut = maxChars;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

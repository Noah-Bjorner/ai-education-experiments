import "@std/dotenv/load";

import { tool } from "@ai";
import { z } from "@zod";

const SUPADATA_API_BASE_URL = "https://api.supadata.ai/v1";
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
/** Consecutive caption chunks per markdown section. 1 = one per chunk. */
const DEFAULT_TRANSCRIPT_GROUP_SIZE = 4;

export type TranscriptMode = "native" | "auto" | "generate";

export interface TranscriptChunk {
  text: string;
  offset: number;
  duration: number;
  lang?: string;
}

export interface TranscriptResult {
  content: string | TranscriptChunk[];
  lang: string;
  availableLangs: string[];
}

export interface ExtractVideoTranscriptOptions {
  url: string;
  lang?: string;
  text?: boolean;
  mode?: TranscriptMode;
  signal?: AbortSignal;
}

function getApiKey(): string {
  const apiKey = Deno.env.get("SUPADATA_API_KEY");
  if (!apiKey) {
    throw new Error("SUPADATA_API_KEY is not set");
  }
  return apiKey;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function fetchTranscriptJob(
  jobId: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<TranscriptResult> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < DEFAULT_TIMEOUT_MS) {
    const response = await fetch(
      `${SUPADATA_API_BASE_URL}/transcript/${jobId}`,
      {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        signal,
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Supadata transcript job error: ${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`,
      );
    }

    const result = await response.json() as {
      status?: string;
      content?: string | TranscriptChunk[];
      lang?: string;
      availableLangs?: string[];
      error?: string;
      message?: string;
    };

    if (result.status === "completed") {
      return {
        content: result.content ?? "",
        lang: result.lang ?? "",
        availableLangs: result.availableLangs ?? [],
      };
    }

    if (result.status === "failed") {
      throw new Error(
        `Supadata transcript job failed: ${result.error ?? result.message ?? "unknown error"}`,
      );
    }

    await sleep(DEFAULT_POLL_INTERVAL_MS, signal);
  }

  throw new Error(
    `Supadata transcript job timed out after ${DEFAULT_TIMEOUT_MS / 1000}s`,
  );
}

/** Fetch a transcript from YouTube, TikTok, Instagram, X, Facebook, or a public media file URL. */
export async function extractVideoTranscript(
  options: ExtractVideoTranscriptOptions,
): Promise<TranscriptResult> {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    url: options.url,
    mode: options.mode ?? "auto",
    text: String(options.text ?? false),
  });
  if (options.lang) params.set("lang", options.lang);

  const response = await fetch(
    `${SUPADATA_API_BASE_URL}/transcript?${params}`,
    {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      signal: options.signal,
    },
  );

  if (response.status === 202) {
    const { jobId } = await response.json() as { jobId?: string };
    if (!jobId) {
      throw new Error("Supadata returned 202 without a jobId");
    }
    return await fetchTranscriptJob(jobId, apiKey, options.signal);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Supadata transcript error: ${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`,
    );
  }

  const result = await response.json() as TranscriptResult & { jobId?: string };
  if (result.jobId) {
    return await fetchTranscriptJob(result.jobId, apiKey, options.signal);
  }

  return {
    content: result.content,
    lang: result.lang,
    availableLangs: result.availableLangs ?? [],
  };
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export interface FormatTranscriptOptions {
  /** How many consecutive chunks to merge into one section. Defaults to 1 (no grouping). */
  groupSize?: number;
}

/**
 * Group consecutive chunks into batches of `groupSize` (e.g. 2 → [1+2], [3+4], …).
 * Each group uses the first chunk's start and the last chunk's end.
 */
function groupChunks(
  chunks: TranscriptChunk[],
  groupSize: number,
): TranscriptChunk[] {
  const size = Math.max(1, Math.floor(groupSize));
  if (size === 1) return chunks;

  const grouped: TranscriptChunk[] = [];
  for (let i = 0; i < chunks.length; i += size) {
    const batch = chunks.slice(i, i + size);
    const first = batch[0]!;
    const last = batch[batch.length - 1]!;
    grouped.push({
      text: batch.map((c) => c.text.trim()).filter(Boolean).join(" "),
      offset: first.offset,
      duration: last.offset + last.duration - first.offset,
    });
  }
  return grouped;
}

/**
 * Map transcript chunks to markdown sections with [start–end] timestamps.
 * Use `groupSize` to merge consecutive chunks (1 = one section per chunk).
 */
export function formatTranscriptAsMarkdown(
  content: string | TranscriptChunk[],
  options: FormatTranscriptOptions = {},
): string {
  if (typeof content === "string") {
    return content.trim();
  }

  const groupSize = options.groupSize ?? 1;
  const chunks = groupChunks(
    content.filter((chunk) => chunk.text?.trim()),
    groupSize,
  );

  return chunks
    .map((chunk) => {
      const start = formatTimestamp(chunk.offset);
      const end = formatTimestamp(chunk.offset + chunk.duration);
      return `[${start}–${end}]\n${chunk.text.trim()}`;
    })
    .join("\n\n");
}

export const extractVideoTranscriptTool = tool({
  description: "Extract a transcript from a public video URL (YouTube, TikTok, Instagram, X/Twitter, Facebook)",
  inputSchema: z.object({
    url: z.string().url().describe(
      "Video URL.",
    ),
    lang: z.string().optional().describe(
      "Preferred transcript language (ISO 639-1). Defaults to the first available language.",
    ),
    mode: z
      .enum(["native", "auto", "generate"])
      .optional()
      .default("auto")
      .describe(
        "native: existing captions only; generate: always AI-transcribe; auto: native with AI fallback. Defaults to auto.",
      ),
  }),
  execute: async ({ url, lang, mode }, { abortSignal }) => {
    const transcript = await extractVideoTranscript({
      url,
      lang,
      mode,
      text: false,
      signal: abortSignal,
    });
    return formatTranscriptAsMarkdown(transcript.content, {
      groupSize: DEFAULT_TRANSCRIPT_GROUP_SIZE,
    });
  },
});
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


function chunkMarkdown(text: string, opts: { maxChars: number; overlapChars: number }) {
  const parts = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const part of parts) {
    if (current.length + part.length + 2 > opts.maxChars && current) {
      chunks.push(current.trim());
      current = current.slice(-opts.overlapChars) + "\n\n" + part;
    } else {
      current = current ? `${current}\n\n${part}` : part;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function chunkAndEmbedMarkdown(
    text: string,
  ): Promise<LibraryEmbeddingChunk[]> {
    const chunks = chunkMarkdown(text, { maxChars: 2000, overlapChars: 200 });
    return Promise.all(
      chunks.map(async (content, chunkIndex) => ({
        chunkIndex,
        content,
        embedding: await embedMultimodal([{ text: content }]),
      })),
    );
}
  
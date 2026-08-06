import {
  resolveLibraryMediaKind,
  resolveLibraryMediaKindFromUrl,
} from "./media-kind.ts";
import { toMarkdownBytes } from "@firecrawl/anydoc";
import { uploadDocument, uploadImage } from "../../../lib/cloudflare.ts";
import { getXaiTranscriptionToMarkdown } from "../../../lib/xai.ts";
import {
  createLibraryWithEmbeddings,
  type LibraryEmbeddingChunk,
  type LibraryItem,
} from "../database/index.ts";
import { embedMultimodal } from "./embedding.ts";
import { scrap } from "../../../lib/parallel.ts";
import { getPageTitle } from "../../../helper/url.ts";
import { fileFromUrl } from "../../../helper/file.ts";

export type { LibraryMediaKind } from "./media-kind.ts";
export {
  isYouTubeUrl,
  resolveLibraryMediaKind,
  resolveLibraryMediaKindFromUrl,
} from "./media-kind.ts";
import { chunkAndEmbedMarkdown } from "./embedding.ts";
import { extractVideoTranscriptToMarkdown } from "../../../lib/supadata.ts";

export type LibraryUploadInput = {
  userId: string;
  source:
    | { type: "file"; file: File }
    | { type: "url"; url: string };
};

/** Thrown for user-fixable upload problems (unsupported type, etc.). */
export class LibraryClientError extends Error {
  override readonly name = "LibraryClientError";
}

interface LibraryUploadOutput {
  name: string;
  url: string;
  type:
    | "document"
    | "image"
    | "audio_transcript"
    | "website"
    | "youtube_transcript";
}

interface HandleLibraryUploadOutput {
  embeddings: LibraryEmbeddingChunk[];
  libraryItem: LibraryUploadOutput;
}

async function handleDocumentUpload(
  file: File,
): Promise<HandleLibraryUploadOutput> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const markdown = await toMarkdownBytes(bytes);
    const [url, embeddings] = await Promise.all([
      uploadDocument(
        new Blob([markdown], { type: "text/markdown; charset=utf-8" }),
        file.name.replace(/\.[^/.]+$/, ".md"),
      ),
      chunkAndEmbedMarkdown(markdown),
    ]);
    return {
      embeddings,
      libraryItem: {
        name: file.name,
        url,
        type: "document",
      },
    };
  } catch (error) {
    console.error("Error uploading document: ", error);
    throw error;
  }
}

async function handleImageUpload(
  file: File,
): Promise<HandleLibraryUploadOutput> {
  try {
    const [url, embedding] = await Promise.all([
      uploadImage(file, file.name),
      (async () => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const data = btoa(
          bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), ""),
        );
        return embedMultimodal([{
          inlineData: {
            mimeType: file.type,
            data,
          },
        }]);
      })(),
    ]);
    return {
      embeddings: [{
        chunkIndex: 0,
        content: file.name,
        embedding,
      }],
      libraryItem: {
        name: file.name,
        url,
        type: "image",
      },
    };
  } catch (error) {
    console.error("Error uploading image: ", error);
    throw error;
  }
}

async function handleAudioUpload(
  file: File,
): Promise<HandleLibraryUploadOutput> {
  try {
    const markdown = await getXaiTranscriptionToMarkdown(file);
    const name = file.name.replace(/\.[^/.]+$/, "");
    const [url, embeddings] = await Promise.all([
      uploadDocument(
        new Blob([markdown], { type: "text/markdown; charset=utf-8" }),
        `${name}.md`,
      ),
      chunkAndEmbedMarkdown(markdown),
    ]);
    return {
      embeddings,
      libraryItem: {
        name,
        url,
        type: "audio_transcript",
      },
    };
  } catch (error) {
    console.error("Error uploading audio: ", error);
    throw error;
  }
}

async function handleWebsiteUpload(
  sourceUrl: string,
): Promise<HandleLibraryUploadOutput> {
  try {
    const markdown = await scrap(sourceUrl);
    const [url, embeddings, name] = await Promise.all([
      uploadDocument(
        new Blob([markdown], { type: "text/markdown; charset=utf-8" }),
        `${crypto.randomUUID()}.md`,
      ),
      chunkAndEmbedMarkdown(markdown),
      pageTitleOrFallback(sourceUrl),
    ]);
    return {
      embeddings,
      libraryItem: {
        name,
        url,
        type: "website",
      },
    };
  } catch (error) {
    console.error("Error uploading Website: ", error);
    throw error;
  }
}

async function handleYoutubeUpload(
  sourceUrl: string,
): Promise<HandleLibraryUploadOutput> {
  try {
    const markdown = await extractVideoTranscriptToMarkdown({ url: sourceUrl });
    const [url, embeddings, name] = await Promise.all([
      uploadDocument(
        new Blob([markdown], { type: "text/markdown; charset=utf-8" }),
        `${crypto.randomUUID()}.md`,
      ),
      chunkAndEmbedMarkdown(markdown),
      pageTitleOrFallback(sourceUrl),
    ]);
    return {
      embeddings,
      libraryItem: {
        name,
        url,
        type: "youtube_transcript",
      },
    };
  } catch (error) {
    console.error("Error uploading YouTube: ", error);
    throw error;
  }
}

async function handleFileUpload(
  file: File,
): Promise<HandleLibraryUploadOutput> {
  let kind;
  try {
    kind = resolveLibraryMediaKind(file);
  } catch (error) {
    throw new LibraryClientError(
      error instanceof Error ? error.message : "Invalid file type",
    );
  }

  switch (kind) {
    case "document":
      return await handleDocumentUpload(file);
    case "image":
      return await handleImageUpload(file);
    case "audio":
      return await handleAudioUpload(file);
    case "video":
      throw new LibraryClientError("Video is currently not supported");
    case "website":
      throw new LibraryClientError(
        "HTML files are not supported; upload the website URL instead",
      );
    case "youtube":
      throw new LibraryClientError("YouTube uploads require a URL");
    default:
      throw new LibraryClientError("Invalid file type");
  }
}

async function handleUrlUpload(
  sourceUrl: string,
): Promise<HandleLibraryUploadOutput> {
  const kind = resolveLibraryMediaKindFromUrl(sourceUrl);

  if (kind === "youtube") {
    return await handleYoutubeUpload(sourceUrl);
  }
  if (kind === "website") {
    return await handleWebsiteUpload(sourceUrl);
  }

  const file = await fileFromUrl(sourceUrl);
  return await handleFileUpload(file);
}

export async function handleLibraryUpload(
  input: LibraryUploadInput,
): Promise<LibraryItem> {
  const output = input.source.type === "url"
    ? await handleUrlUpload(input.source.url)
    : await handleFileUpload(input.source.file);

  return await createLibraryWithEmbeddings({
    userId: input.userId,
    name: output.libraryItem.name,
    srcUrl: output.libraryItem.url,
    type: output.libraryItem.type,
    chunks: output.embeddings,
  });
}

async function pageTitleOrFallback(sourceUrl: string): Promise<string> {
  try {
    return await getPageTitle(sourceUrl);
  } catch {
    try {
      return new URL(sourceUrl).hostname;
    } catch {
      return sourceUrl;
    }
  }
}
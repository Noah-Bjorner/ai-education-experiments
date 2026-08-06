import { isYouTubeUrl, resolveLibraryMediaKind } from "./media-kind.ts";
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
export { isYouTubeUrl, resolveLibraryMediaKind } from "./media-kind.ts";
import { chunkAndEmbedMarkdown } from "./embedding.ts";
import { extractVideoTranscriptToMarkdown } from "../../../lib/supadata.ts";

export type LibraryUploadInput = {
  userId: string;
  source:
    | { type: "file"; file: File }
    | { type: "url"; url: string };
};

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
        type: "audio_transcript",
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
      getPageTitle(sourceUrl),
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
      getPageTitle(sourceUrl),
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
  const kind = resolveLibraryMediaKind(file);

  switch (kind) {
    case "document":
      return await handleDocumentUpload(file);
    case "image":
      return await handleImageUpload(file);
    case "audio":
      return await handleAudioUpload(file);
    case "video":
      throw new Error("Video is currently not supported");
    case "website":
      throw new Error(
        "HTML files are not supported; upload the website URL instead",
      );
    case "youtube":
      throw new Error("YouTube uploads require a URL");
    default:
      throw new Error("Invalid file type");
  }
}

async function handleUrlUpload(
  sourceUrl: string,
): Promise<HandleLibraryUploadOutput> {
  if (isYouTubeUrl(sourceUrl)) {
    return await handleYoutubeUpload(sourceUrl);
  }

  const file = await fileFromUrl(sourceUrl);
  const kind = resolveLibraryMediaKind(file);
  if (kind === "website") {
    return await handleWebsiteUpload(sourceUrl);
  }

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
import { fileFromUrl } from "../../../helper/file.ts";
import { resolveLibraryMediaKind } from "./media-kind.ts";
import { toMarkdownBytes } from "@firecrawl/anydoc";
import { uploadDocument, uploadImage } from "../../../lib/cloudflare.ts";
import { getXaiTranscriptionToMarkdown } from "../../../lib/xai.ts";
import {
  createLibraryWithEmbeddings,
  type LibraryEmbeddingChunk,
  type LibraryItem,
} from "../database/index.ts";
import { embedMultimodal } from "./embedding.ts";

export type { LibraryMediaKind } from "./media-kind.ts";
export { isYouTubeUrl, resolveLibraryMediaKind } from "./media-kind.ts";
import { chunkAndEmbedMarkdown } from "./embedding.ts";
import { extractVideoTranscriptToMarkdown } from "../../../lib/supadata.ts";

interface LibraryUploadInput {
  userId: string;
  file: File;
  /** Original URL when the upload came from a link (needed for YouTube vs website). */
  sourceUrl?: string;
}

interface LibraryUploadOutput {
  name: string;
  url: string;
  type: "document" | "image" | "audio_transcript" | "website" | "youtube_transcript";
}

interface HandleLibraryUploadOutput {
  embeddings: LibraryEmbeddingChunk[];
  libraryItem: LibraryUploadOutput;
}

async function handleDocumentUpload(input: LibraryUploadInput): Promise<HandleLibraryUploadOutput> {
  try {
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    const markdown = await toMarkdownBytes(bytes);
    const [url, embeddings] = await Promise.all([
      uploadDocument(
        new Blob([markdown], { type: "text/markdown; charset=utf-8" }),
        input.file.name.replace(/\.[^/.]+$/, ".md"),
      ),
      chunkAndEmbedMarkdown(markdown),
    ]);
    return {
      embeddings,
      libraryItem: {
        name: input.file.name,
        url,
        type: "audio_transcript",
      },
    };
  } catch (error) {
    console.error("Error uploading document: ", error);
    throw error;
  }
}

async function handleImageUpload(input: LibraryUploadInput): Promise<HandleLibraryUploadOutput> {
  try {
    const [url, embedding] = await Promise.all([
      uploadImage(input.file, input.file.name),
      (async () => {
        const bytes = new Uint8Array(await input.file.arrayBuffer());
        const data = btoa(bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), ""));
        return embedMultimodal([{
          inlineData: {
            mimeType: input.file.type,
            data,
          },
        }]);
      })(),
    ]);
    return {
      embeddings: [{
        chunkIndex: 0,
        content: "",
        embedding,
      }],
      libraryItem: {
        name: input.file.name,
        url,
        type: "image",
      },
    };
  } catch (error) {
    console.error("Error uploading image: ", error);
    throw error;
  }
}

async function handleAudioUpload(input: LibraryUploadInput): Promise<HandleLibraryUploadOutput> {
  try {
    const markdown = await getXaiTranscriptionToMarkdown(input.file);
    const [url, embeddings] = await Promise.all([
      uploadDocument(
        new Blob([markdown], { type: "text/markdown; charset=utf-8" }),
        input.file.name.replace(/\.[^/.]+$/, ".md"),
      ),
      chunkAndEmbedMarkdown(markdown),
    ]);
    return {
      embeddings,
      libraryItem: {
        name: input.file.name,
        url,
        type: "audio_transcript",
      },
    };
  } catch (error) {
    console.error("Error uploading audio: ", error);
    throw error;
  }
}

async function handleWebsiteUpload(input: LibraryUploadInput): Promise<HandleLibraryUploadOutput> {
  try {
    const sourceUrl = input.sourceUrl;
    if (!sourceUrl) {
      throw new Error("Website upload requires a sourceUrl");
    }
    const markdown = ""///extract
    const name = `${sourceUrl.split("/").pop()?.split("?")[0]}`;
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
        type: "youtube_transcript",
      },
    };
  } catch (error) {
    console.error("Error uploading Website: ", error);
    throw error;
  }
}

async function handleYoutubeUpload(input: LibraryUploadInput): Promise<HandleLibraryUploadOutput> {
  try {
    const sourceUrl = input.sourceUrl;
    if (!sourceUrl) {
      throw new Error("YouTube upload requires a sourceUrl");
    }
  
    const markdown = await extractVideoTranscriptToMarkdown({ url: sourceUrl });
    const name = `${sourceUrl.split("/").pop()?.split("?")[0]}`;
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
        type: "youtube_transcript",
      },
    };  
  } catch (error) {
    console.error("Error uploading YouTube: ", error);
    throw error;
  }
}

export async function handleLibraryUpload(input: LibraryUploadInput): Promise<LibraryItem> {
  const kind = resolveLibraryMediaKind(input.file, { sourceUrl: input.sourceUrl });

  let output: HandleLibraryUploadOutput;
  switch (kind) {
    case "document":
      output = await handleDocumentUpload(input);
      break;
    case "image":
      output = await handleImageUpload(input);
      break;
    case "audio": {
      output = await handleAudioUpload(input);
      break;
    }
    case "video":
      throw new Error("Video is currently not supported");
    case "website":
      output = await handleWebsiteUpload(input);
      break;
    case "youtube":
      output = await handleYoutubeUpload(input);
      break;
    default:
      throw new Error("Invalid file type");
  }

  return await createLibraryWithEmbeddings({
    userId: input.userId,
    name: output.libraryItem.name,
    srcUrl: output.libraryItem.url,
    type: output.libraryItem.type,
    chunks: output.embeddings,
  });
}



//quick tests
// pdf: https://static.noahbjorner.com/tmp/25fra-gor_kpn.pdf
// image: https://static.noahbjorner.com/tmp/grahp.webp
// audio: https://traffic.libsyn.com/secure/wordonfire/Word_on_Fire_Show_-_526_CC_v2_-_Mixed_English_Audio_Master.mp3?dest-id=302449
// audio 2: https://static.noahbjorner.com/tmp/The%20Instagram%20Christian%20Aesthetic%20Is%20a%20Problem.mp3
// video: https://static.noahbjorner.com/tmp/demo-ex.mp4
// website: https://politicaljudas.com
// website 2: https://substack.com/home/post/p-179054974
// website 3: https://x.com/thedankoe/status/2081415714636996844
// youtube: https://www.youtube.com/watch?v=L4lh6lxHd3k
// youtube 2: https://youtu.be/L4lh6lxHd3k

/*
if (import.meta.main) {
  const start = performance.now();
  const file = await fileFromUrl("https://static.noahbjorner.com/tmp/25fra-gor_kpn.pdf")
  console.log("file: ", file);
  console.log("handleLibraryUpload: ", await handleLibraryUpload({ userId: "ff52ec97-73c6-42f4-a9ea-c1c320ac1646", file }));
  const end = performance.now();
  console.log(`Time taken: ${((end - start) / 1000).toFixed(2)} seconds`);
}
*/
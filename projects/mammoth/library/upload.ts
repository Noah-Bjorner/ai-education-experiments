import { fileFromUrl } from "../../../helper/file.ts";
import { resolveLibraryMediaKind } from "./media-kind.ts";
import { toMarkdownBytes } from "@firecrawl/anydoc";
import { uploadDocument, uploadImage } from "../../../lib/cloudflare.ts";
import { getXaiTranscriptionToMarkdown } from "../../../lib/xai.ts";

export type { LibraryMediaKind } from "./media-kind.ts";
export { isYouTubeUrl, resolveLibraryMediaKind } from "./media-kind.ts";

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

async function handleDocumentUpload(input: LibraryUploadInput): Promise<LibraryUploadOutput> {
  try {
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    const markdown = await toMarkdownBytes(bytes);
    const url = await uploadDocument(
      new Blob([markdown], { type: "text/markdown; charset=utf-8" }),
      input.file.name.replace(/\.[^/.]+$/, ".md"),
    );
    return {
      name: input.file.name,
      url,
      type: "document",
    };  
  } catch (error) {
    console.error("Error uploading document: ", error);
    throw error;
  }
}

async function handleImageUpload(input: LibraryUploadInput): Promise<LibraryUploadOutput> {
  try {
    const url = await uploadImage(input.file, input.file.name);
    return {
      name: input.file.name,
      url,
      type: "image",
    };
  } catch (error) {
    console.error("Error uploading image: ", error);
    throw error;
  }
}

async function handleAudioUpload(input: LibraryUploadInput): Promise<LibraryUploadOutput> {
  try {
    const markdown = await getXaiTranscriptionToMarkdown(input.file);
    const url = await uploadDocument(
      new Blob([markdown], { type: "text/markdown; charset=utf-8" }),
      input.file.name.replace(/\.[^/.]+$/, ".md"),
    );
    return {
      name: input.file.name,
      url,
      type: "audio_transcript",
    };  
  } catch (error) {
    console.error("Error uploading audio: ", error);
    throw error;
  }
}

async function handleWebsiteUpload(_input: LibraryUploadInput): Promise<LibraryUploadOutput> {
  throw new Error("Website upload is not implemented yet.");
}

async function handleYoutubeUpload(_input: LibraryUploadInput): Promise<LibraryUploadOutput> {
  throw new Error("YouTube upload is not implemented yet.");
}

export async function handleLibraryUpload(input: LibraryUploadInput): Promise<LibraryUploadOutput> {
  const kind = resolveLibraryMediaKind(input.file, { sourceUrl: input.sourceUrl });

  let output: LibraryUploadOutput;
  switch (kind) {
    case "document":
      output = await handleDocumentUpload(input);
      break;
    case "image":
      output = await handleImageUpload(input);
      break;
    case "audio":
      output = await handleAudioUpload(input);
      break;
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
  //store in database
  //shoot of async task
  return output;
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

if (import.meta.main) {
  const file = await fileFromUrl("https://traffic.libsyn.com/secure/wordonfire/Word_on_Fire_Show_-_526_CC_v2_-_Mixed_English_Audio_Master.mp3?dest-id=302449")
  console.log("file: ", file);
  console.log("handleLibraryUpload: ", await handleLibraryUpload({ userId: "123", file }));
}

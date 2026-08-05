import "@std/dotenv/load";
import Groq, { toFile } from "@groq";
import { fileFromUrl } from "../helper/file.ts";

const groq = new Groq({
  apiKey: Deno.env.get("GROQ_API_KEY"),
});

export type GroqTranscriptionFile = string | Blob | File | Response;

export type GroqTranscriptionOptions = {
  language?: string;
  prompt?: string;
  temperature?: number;
  timestampGranularities?: Array<"segment" | "word">;
};

const isRemoteUrl = (value: string): boolean => /^https?:\/\//i.test(value);

async function resolveTranscriptionFile(
  file: GroqTranscriptionFile,
): Promise<File | Response> {
  if (file instanceof Response || file instanceof File) {
    return file;
  }

  if (typeof file !== "string") {
    return await toFile(file, "audio.bin");
  }

  if (isRemoteUrl(file)) {
    return await fetch(file);
  }

  const bytes = await Deno.readFile(file);
  const filename = file.split("/").pop() || "audio.bin";
  return await toFile(bytes, filename);
}

export async function transcribeAudio(
  file: GroqTranscriptionFile,
  options: GroqTranscriptionOptions = {},
) {
  return await groq.audio.transcriptions.create({
    file: await resolveTranscriptionFile(file),
    model: "whisper-large-v3-turbo",
    response_format: "verbose_json",
    timestamp_granularities: options.timestampGranularities ?? ["segment"],
    language: options.language,
    prompt: options.prompt,
    temperature: options.temperature,
  });
}
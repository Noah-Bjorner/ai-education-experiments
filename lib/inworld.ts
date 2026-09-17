import "@std/dotenv/load";

import { InworldTTS, type TimestampInfo } from "@inworld/tts";
import { uploadAudio } from "./cloudflare.ts";

const tts = InworldTTS({
  apiKey: Deno.env.get("INWORLD_API_KEY"),
});

export type InworldModel =
  | "inworld-tts-2"
  | "inworld-tts-2-flash";

export type GenerateSpeechOptions = {
  voice?: string;
  model?: InworldModel;
  timestamps?: boolean;
};

export type SpeechTimestamp = {
  word: string;
  start: number;
  end: number;
};

export type GenerateSpeechResult = {
  url: string;
  timestamps?: SpeechTimestamp[];
};

function toSpeechTimestamps(timestamps: TimestampInfo): SpeechTimestamp[] {
  const alignment = timestamps.wordAlignment;
  if (!alignment) return [];

  return alignment.words.flatMap((word, index) => {
    const trimmed = word.trim();
    if (!/[\p{L}\p{N}]/u.test(trimmed)) return [];

    return [{
      word: trimmed,
      start: alignment.wordStartTimeSeconds[index] ?? 0,
      end: alignment.wordEndTimeSeconds[index] ?? 0,
    }];
  });
}

async function uploadSpeech(audio: Uint8Array): Promise<string> {
  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(audio);
  return await uploadAudio(
    new Blob([bytes], { type: "audio/mpeg" }),
    "inworld-speech.mp3",
    { prefix: "inworld-speech" },
  );
}

export async function generateSpeech(
  text: string,
  options: GenerateSpeechOptions & { timestamps: true },
): Promise<{ url: string; timestamps: SpeechTimestamp[] }>;
export async function generateSpeech(
  text: string,
  options?: GenerateSpeechOptions,
): Promise<{ url: string }>;
export async function generateSpeech(
  text: string,
  options: GenerateSpeechOptions = {},
): Promise<GenerateSpeechResult> {
  const voice = options.voice ?? "Ashley";
  const model = options.model ?? "inworld-tts-2";

  if (options.timestamps) {
    const { audio, timestamps } = await tts.generateWithTimestamps({
      text,
      voice,
      model,
      timestampType: "WORD",
    });

    return {
      url: await uploadSpeech(audio),
      timestamps: toSpeechTimestamps(timestamps),
    };
  }

  const audio = await tts.generate({ text, voice, model });
  return { url: await uploadSpeech(audio) };
}


if (import.meta.main) {
  const audio = await generateSpeech("Hello, world! How are you?", { timestamps: true, voice: "Jason", model: "inworld-tts-2-flash" });
  console.log(audio);
}
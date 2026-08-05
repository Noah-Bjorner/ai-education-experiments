import "@std/dotenv/load";

import { normalizeLanguageCode } from "../helper/language.ts";

const XAI_TTS_URL = "https://api.x.ai/v1/tts";
const XAI_STT_URL = "https://api.x.ai/v1/stt";

interface XaiSpeechOptions {
  text: string;
  voice: string;
  language: string;
  outDir?: string;
}

/** Local/uploaded audio (`File`) or a publicly reachable audio URL. */
export type XaiTranscriptionInput = File | string;

interface XaiTranscriptionOptions {
  language?: string;
  /** Return formatted/natural text (numbers, currencies, etc.). Defaults to true. */
  format?: boolean;
}

/** Word-level segment. `speaker` is only present when `diarize=true`. */
export interface XaiTranscriptionWord {
  text: string;
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  end: number;
  speaker?: number;
}

/** Per-channel transcript when `multichannel=true`. */
export interface XaiTranscriptionChannel {
  index: number;
  text: string;
  words: XaiTranscriptionWord[];
}

/**
 * REST STT response.
 * @see https://docs.x.ai/developers/model-capabilities/audio/speech-to-text
 */
export interface XaiTranscriptionResult {
  text: string;
  /** Detected language — docs show names like `"English"`; API often returns codes like `"en"`. */
  language: string;
  /** Audio duration in seconds. */
  duration: number;
  words: XaiTranscriptionWord[];
  /** Only present when `multichannel=true`. */
  channels?: XaiTranscriptionChannel[];
}

export async function getXaiSpeech(options: XaiSpeechOptions): Promise<string> {
  const { text, voice, language, outDir = "./output" } = options;
  const apiKey = Deno.env.get("XAI_API_KEY");
  if (!apiKey) {
    throw new Error("XAI_API_KEY environment variable is required");
  }

  const response = await fetch(XAI_TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id: voice,
      language: normalizeLanguageCode(language),
      output_format: { codec: "mp3", sample_rate: 44100, bit_rate: 128000 },
    }),
  });

  if (!response.ok) {
    throw new Error(`xAI TTS error ${response.status}: ${await response.text()}`);
  }

  await Deno.mkdir(outDir, { recursive: true });
  const path = `${outDir}/xai-audio-${crypto.randomUUID()}.mp3`;
  await Deno.writeFile(path, new Uint8Array(await response.arrayBuffer()));

  return path;
}

export async function getXaiTranscription(
  input: XaiTranscriptionInput,
  options: XaiTranscriptionOptions = {},
): Promise<XaiTranscriptionResult> {
  const { language = "en", format = true } = options;
  const apiKey = Deno.env.get("XAI_API_KEY");
  if (!apiKey) {
    throw new Error("XAI_API_KEY environment variable is required");
  }

  // Options must precede `file` when uploading; `file`/`url` are mutually exclusive.
  const form = new FormData();
  form.append("format", String(format));
  form.append("language", normalizeLanguageCode(language));
  if (typeof input === "string") {
    form.append("url", input);
  } else {
    form.append("file", input, input.name || "audio.bin");
  }

  const response = await fetch(XAI_STT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`xAI STT error ${response.status}: ${await response.text()}`);
  }

  return await response.json() as XaiTranscriptionResult;
}

const SENTENCE_END_RE = /[.!?]$/;

const formatTimestamp = (seconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  return [hours, minutes, secs]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
};

const joinWords = (words: XaiTranscriptionWord[]): string =>
  words.map((word) => word.text).join(" ").replace(/\s+/g, " ").trim();

/** Split word timestamps into sentence-sized chunks on `.` `!` `?`. */
export function chunkXaiWordsIntoSentences(
  words: XaiTranscriptionWord[],
): Array<{ start: number; end: number; text: string }> {
  const chunks: Array<{ start: number; end: number; text: string }> = [];
  let current: XaiTranscriptionWord[] = [];

  for (const word of words) {
    current.push(word);
    if (SENTENCE_END_RE.test(word.text.trim())) {
      chunks.push({
        start: current[0]!.start,
        end: current[current.length - 1]!.end,
        text: joinWords(current),
      });
      current = [];
    }
  }

  if (current.length > 0) {
    chunks.push({
      start: current[0]!.start,
      end: current[current.length - 1]!.end,
      text: joinWords(current),
    });
  }

  return chunks;
}

export function xaiTranscriptionToMarkdown(
  transcription: XaiTranscriptionResult,
): string {
  const sentences = chunkXaiWordsIntoSentences(transcription.words ?? []);
  if (sentences.length === 0) {
    return transcription.text?.trim() ?? "";
  }

  return sentences
    .map((sentence) => {
      const start = formatTimestamp(sentence.start);
      const end = formatTimestamp(sentence.end);
      return `[${start} - ${end}] ${sentence.text}`;
    })
    .join("\n");
}

export async function getXaiTranscriptionToMarkdown(
  input: XaiTranscriptionInput,
  options: XaiTranscriptionOptions = {},
): Promise<string> {
  const transcription = await getXaiTranscription(input, options);
  return xaiTranscriptionToMarkdown(transcription);
}


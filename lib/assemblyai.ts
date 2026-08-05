import "@std/dotenv/load";
import { uploadAudio } from "./cloudflare.ts";
import { withRetry } from "../helper/retry.ts";

const ASSEMBLYAI_API_BASE_URL = "https://api.assemblyai.com/v2";
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_MAX_CAPTION_WORDS = 12;
const DEFAULT_MAX_CAPTION_DURATION_MS = 5000;
const DEFAULT_SPEECH_MODELS = ["universal-3-pro", "universal-2"] as const;
const ASSEMBLYAI_TRANSCRIPTION_COSTS_PER_HOUR = {
  "universal-2": 0.15,
  "universal-3-pro": 0.21,
} as const;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export type AssemblyAITranscriptStatus =
  | "queued"
  | "processing"
  | "completed"
  | "error";

export interface AssemblyAIWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string | null;
}

export interface AssemblyAIUtterance {
  text: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string | null;
  words?: AssemblyAIWord[];
}

export interface AssemblyAITranscriptResponse {
  id: string;
  status: AssemblyAITranscriptStatus;
  text: string | null;
  audio_url?: string;
  audio_duration?: number | null;
  language_code?: string | null;
  language_confidence?: number | null;
  speech_model_used?: string | null;
  speaker_labels?: boolean;
  cost_dollars?: number | null;
  error?: string | null;
  words?: AssemblyAIWord[];
  utterances?: AssemblyAIUtterance[];
}

export interface AssemblyAITranscriptionOptions {
  audioPath?: string;
  audioURL?: string;
  audioFile?: Blob;
  languageDetection?: boolean;
  speakerLabels?: boolean;
  speechModels?: string[];
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export type TranscribeFileInput = string | Blob;

export interface AssemblyAITimedText {
  start: number;
  end: number;
  text: string;
}

export interface AssemblyAICaptionsJson {
  words: AssemblyAITimedText[];
  captions: AssemblyAITimedText[];
}

export interface AssemblyAICaptionOptions
  extends
    Omit<AssemblyAITranscriptionOptions, "audioPath" | "audioURL" | "audioFile"> {
  maxWordsPerCaption?: number;
  maxCaptionDurationMs?: number;
}

interface AssemblyAISubmitTranscriptRequest {
  audio_url: string;
  language_detection: boolean;
  speaker_labels?: boolean;
  speech_models: string[];
}

const getAssemblyAIApiKey = (): string => {
  const apiKey = Deno.env.get("ASSEMBLYAI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing ASSEMBLYAI_API_KEY");
  }

  return apiKey;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isRemoteUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const shouldRetryAssemblyAIError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return true;
  }

  const match = error.message.match(/AssemblyAI API error (\d+)/);
  if (!match) {
    return true;
  }

  return RETRYABLE_STATUS_CODES.has(Number(match[1]));
};

const calculateTranscriptCostDollars = (
  audioDurationSeconds?: number | null,
  speechModelUsed?: string | null,
): number | null => {
  if (audioDurationSeconds == null || !speechModelUsed) {
    return null;
  }

  const hourlyRate = ASSEMBLYAI_TRANSCRIPTION_COSTS_PER_HOUR[
    speechModelUsed as keyof typeof ASSEMBLYAI_TRANSCRIPTION_COSTS_PER_HOUR
  ];
  if (hourlyRate == null) {
    return null;
  }

  return Number(((audioDurationSeconds / 3600) * hourlyRate).toFixed(6));
};

const withCalculatedTranscriptCost = (
  transcript: AssemblyAITranscriptResponse,
): AssemblyAITranscriptResponse => ({
  ...transcript,
  cost_dollars: calculateTranscriptCostDollars(
    transcript.audio_duration,
    transcript.speech_model_used,
  ),
});

const fetchAssemblyAIJson = async <T>(
  path: string,
  init: RequestInit,
): Promise<T> => {
  const apiKey = getAssemblyAIApiKey();

  return await withRetry(
    async () => {
      const headers = new Headers(init.headers);
      headers.set("authorization", apiKey);
      headers.set("accept", "application/json");
      if (init.body && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }

      const response = await fetch(`${ASSEMBLYAI_API_BASE_URL}${path}`, {
        ...init,
        headers,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`AssemblyAI API error ${response.status}: ${body}`);
      }

      return await response.json() as T;
    },
    3,
    1000,
    2,
    shouldRetryAssemblyAIError,
  );
};

const uploadAudioToAssemblyAI = async (audio: Blob): Promise<string> => {
  const result = await fetchAssemblyAIJson<{ upload_url: string }>(
    "/upload",
    {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
      },
      body: audio,
    },
  );

  return result.upload_url;
};

const resolveAudioUrl = async (
  options: AssemblyAITranscriptionOptions,
): Promise<string> => {
  if (options.audioURL) {
    return options.audioURL;
  }

  if (options.audioFile) {
    return await uploadAudioToAssemblyAI(options.audioFile);
  }

  if (options.audioPath) {
    return await uploadAudio(options.audioPath, {
      temporary: true,
      prefix: "assemblyai",
    });
  }

  throw new Error("No audioPath, audioURL, or audioFile provided");
};

export const submitTranscription = async (
  request: AssemblyAISubmitTranscriptRequest,
): Promise<AssemblyAITranscriptResponse> => {
  const transcript = await fetchAssemblyAIJson<AssemblyAITranscriptResponse>(
    "/transcript",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );

  return withCalculatedTranscriptCost(transcript);
};

export const getTranscript = async (
  transcriptId: string,
): Promise<AssemblyAITranscriptResponse> => {
  const transcript = await fetchAssemblyAIJson<AssemblyAITranscriptResponse>(
    `/transcript/${transcriptId}`,
    {
      method: "GET",
    },
  );

  return withCalculatedTranscriptCost(transcript);
};

export const transcribeAudio = async (
  options: AssemblyAITranscriptionOptions,
): Promise<AssemblyAITranscriptResponse> => {
  const audioURL = await resolveAudioUrl(options);
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const transcript = await submitTranscription({
    audio_url: audioURL,
    language_detection: options.languageDetection ?? true,
    speaker_labels: options.speakerLabels,
    speech_models: options.speechModels ?? [...DEFAULT_SPEECH_MODELS],
  });

  const startedAt = Date.now();
  while (true) {
    const currentTranscript = await getTranscript(transcript.id);

    if (currentTranscript.status === "completed") {
      return currentTranscript;
    }

    if (currentTranscript.status === "error") {
      throw new Error(
        currentTranscript.error || "AssemblyAI transcription failed",
      );
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `AssemblyAI transcription timed out after ${timeoutMs}ms`,
      );
    }

    await sleep(pollIntervalMs);
  }
};

export const transcribeFile = async (
  file: TranscribeFileInput,
  options: Omit<
    AssemblyAITranscriptionOptions,
    "audioPath" | "audioURL" | "audioFile"
  > = {},
): Promise<AssemblyAITranscriptResponse> => {
  if (typeof file !== "string") {
    return await transcribeAudio({ ...options, audioFile: file });
  }

  if (isRemoteUrl(file)) {
    return await transcribeAudio({ ...options, audioURL: file });
  }

  return await transcribeAudio({ ...options, audioPath: file });
};

export const transcribeFileToText = async (
  file: TranscribeFileInput,
  options: Omit<
    AssemblyAITranscriptionOptions,
    "audioPath" | "audioURL" | "audioFile"
  > = {},
): Promise<string> => {
  const transcript = await transcribeFile(file, options);
  return transcript.text ?? "";
};

const formatSpeakerLabel = (speaker?: string | null): string => {
  if (!speaker) {
    return "Unknown Speaker";
  }

  return `Speaker ${speaker}`;
};

const formatTimestamp = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) =>
    String(value).padStart(2, "0")
  ).join(":");
};

export const transcribeFileToMarkdown = async (
  file: TranscribeFileInput,
  options: Omit<
    AssemblyAITranscriptionOptions,
    "audioPath" | "audioURL" | "audioFile"
  > = {},
): Promise<{ markdown: string; cost_dollars: number }> => {
  const transcript = await transcribeFile(file, options);
  const utterances = transcript.utterances ?? [];
  const markdown = utterances.map((utterance) => {
    const speaker = formatSpeakerLabel(utterance.speaker);
    const start = formatTimestamp(utterance.start);
    const end = formatTimestamp(utterance.end);
    return `## ${speaker} (${start} - ${end})\n${utterance.text}`;
  }).join("\n\n");
  return { markdown, cost_dollars: transcript.cost_dollars ?? 0 };
};
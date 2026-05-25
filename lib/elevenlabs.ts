import "@std/dotenv/load";

import { uploadAudio, type UploadOptions } from "./cloudflare.ts";

const ELEVENLABS_SOUND_GENERATION_URL = "https://api.elevenlabs.io/v1/sound-generation";

export type ElevenLabsSoundEffectInput = {
  prompt: string;
  loop?: boolean;
  duration?: number;
  promptInfluence?: number;
};

export type ElevenLabsSoundEffectUrlOptions = {
  abortSignal?: AbortSignal;
  upload?: UploadOptions;
};

export async function createElevenLabsSoundEffect(
  input: ElevenLabsSoundEffectInput,
  options: { abortSignal?: AbortSignal } = {},
): Promise<Blob> {
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY environment variable is required");
  }

  const response = await fetch(ELEVENLABS_SOUND_GENERATION_URL, {
    method: "POST",
    signal: options.abortSignal,
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text: input.prompt,
      loop: input.loop,
      duration_seconds: input.duration,
      prompt_influence: input.promptInfluence,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `ElevenLabs sound effect generation failed with ${response.status} ${response.statusText}: ${await response
        .text()}`,
    );
  }

  return response.blob();
}

export async function createElevenLabsSoundEffectUrl(
  input: ElevenLabsSoundEffectInput,
  options: ElevenLabsSoundEffectUrlOptions = {},
): Promise<string> {
  const audio = await createElevenLabsSoundEffect(input, {
    abortSignal: options.abortSignal,
  });

  return uploadAudio(audio, "elevenlabs-sound-effect.mp3", options.upload);
}
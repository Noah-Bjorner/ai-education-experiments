import "@std/dotenv/load";

import { normalizeLanguageCode } from "../helper/language.ts";

const XAI_TTS_URL = "https://api.x.ai/v1/tts";

interface XaiSpeechOptions {
  text: string;
  voice: string;
  language: string;
  outDir?: string;
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

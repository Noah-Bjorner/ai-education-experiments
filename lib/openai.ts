import "@std/dotenv/load";
import { OpenAI, toFile } from "@openai";
import { uploadImage } from "./cloudflare.ts";
import { withRetry } from "../helper/retry.ts";
import { saveBase64ToFile } from "../helper/image.ts";

const client = new OpenAI({apiKey: Deno.env.get('OPENAI_API_KEY')});

  


const GPT_IMAGE_2_INPUT_PRICE_PER_MILLION_TOKENS = 8;
const GPT_IMAGE_2_OUTPUT_PRICE_PER_MILLION_TOKENS = 30;

  const GPT_IMAGE_2_TARGET_PIXELS: Record<"1K" | "2K" | "4K", number> = {
    "1K": 1024 * 1024,
    "2K": 1920 * 1920,
    "4K": 2864 * 2864,
  };
  
  const GPT_IMAGE_2_MAX_EDGE = 3584;
  const GPT_IMAGE_2_MIN_PIXELS = 655_360;
  const GPT_IMAGE_2_MAX_PIXELS = 8_294_400;
  const GPT_IMAGE_2_MAX_LONG_SHORT_RATIO = 3;
  
  function roundToMultiple(value: number, multiple: number): number {
    return Math.max(multiple, Math.round(value / multiple) * multiple);
  }
  
  function parseGPTImage2AspectRatio(aspectRatio: string): { width: number; height: number; ratio: number } {
    const match = aspectRatio.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!match) {
      throw new Error(`Invalid GPT Image 2 aspect ratio: ${aspectRatio}`);
    }
  
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) {
      throw new Error(`Invalid GPT Image 2 aspect ratio numbers: ${aspectRatio}`);
    }
  
    const ratio = width / height;
    const longShortRatio = Math.max(ratio, 1 / ratio);
    if (longShortRatio > GPT_IMAGE_2_MAX_LONG_SHORT_RATIO) {
      throw new Error(`GPT Image 2 aspect ratio must be ${GPT_IMAGE_2_MAX_LONG_SHORT_RATIO}:1 or less: ${aspectRatio}`);
    }
  
    return { width, height, ratio };
}
  
function getGPTImage2Size(aspectRatio: string, resolution: "1K" | "2K" | "4K"): string {
    const { ratio } = parseGPTImage2AspectRatio(aspectRatio);
    const targetPixels = GPT_IMAGE_2_TARGET_PIXELS[resolution];
    const targetHeight = Math.sqrt(targetPixels / ratio);
    let width = roundToMultiple(targetHeight * ratio, 16);
    let height = roundToMultiple(targetHeight, 16);
  
    if (Math.max(width, height) > GPT_IMAGE_2_MAX_EDGE) {
      if (width >= height) {
        width = GPT_IMAGE_2_MAX_EDGE;
        height = roundToMultiple(width / ratio, 16);
      } else {
        height = GPT_IMAGE_2_MAX_EDGE;
        width = roundToMultiple(height * ratio, 16);
      }
    }
  
    while (width * height > GPT_IMAGE_2_MAX_PIXELS) {
      width = roundToMultiple(width - 16, 16);
      height = roundToMultiple(height - 16, 16);
    }
  
    if (width * height < GPT_IMAGE_2_MIN_PIXELS) {
      throw new Error(`GPT Image 2 generated size for ${aspectRatio} at ${resolution} is below the minimum pixel count`);
    }
  
    return `${width}x${height}`;
  }

  function gptImage2MimeTypeFromPath(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "webp") return "image/webp";
    return "image/png";
  }
  
  


interface GPTImage2Options {
    prompt: string;
    quality?: "high" | "medium" | "low";
    resolution?: "1K" | "2K" | "4K";
    aspectRatio?: string;
    format?: "jpg" | "png" | "webp";
    imageInputPaths?: string[];
    upload?: boolean;
    outDir: string;
}

interface GPTImage2Output {
    path: string;
    url: string;
    cost: number;
}

interface GPTImage2Response {
    data?: Array<{ b64_json?: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
}

export const getGPTImage2 = async (options: GPTImage2Options): Promise<GPTImage2Output> => {
    const quality = options.quality ?? "high";
    const resolution = options.resolution ?? "2K";
    const aspectRatio = options.aspectRatio ?? "1:1";
    const size = getGPTImage2Size(aspectRatio, resolution);
    const outputFormat = options.format === "jpg" ? "jpeg" : (options.format ?? "png");
  
    const validImagePaths = (options.imageInputPaths ?? []).filter((p) => !!p);
    const hasImageInputs = validImagePaths.length > 0;
  
    const response = await withRetry<GPTImage2Response>(async () => {
      if (hasImageInputs) {
        const files = await Promise.all(
          validImagePaths.map(async (p) => {
            const filename = p.split("/").pop() ?? "image.png";
            const mime = gptImage2MimeTypeFromPath(filename);
            return await toFile(await Deno.readFile(p), filename, { type: mime });
          }),
        );
        const editRequest = {
          model: "gpt-image-2",
          image: files,
          prompt: options.prompt,
          size,
          quality,
          output_format: outputFormat,
          n: 1,
        };
        return await client.images.edit(
          editRequest as unknown as Parameters<typeof client.images.edit>[0],
        ) as unknown as GPTImage2Response;
      }
      const generateRequest = {
        model: "gpt-image-2",
        prompt: options.prompt,
        size,
        quality,
        output_format: outputFormat,
        n: 1,
      };
      return await client.images.generate(
        generateRequest as unknown as Parameters<typeof client.images.generate>[0],
      ) as unknown as GPTImage2Response;
    });
  
    const b64 = response?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("GPT Image 2 returned no image data");
    }
  
    const ext = outputFormat === "jpeg" ? "jpg" : outputFormat;
    const path = await saveBase64ToFile(b64, options.outDir, "gpt-image-2", ext);
    const url = options.upload
      ? await uploadImage(path, { temporary: true, prefix: "gpt-image-2" })
      : "";
  
    const inputTokens = response?.usage?.input_tokens ?? 0;
    const outputTokens = response?.usage?.output_tokens ?? 0;
    const cost =
      (inputTokens * GPT_IMAGE_2_INPUT_PRICE_PER_MILLION_TOKENS +
        outputTokens * GPT_IMAGE_2_OUTPUT_PRICE_PER_MILLION_TOKENS) /
      1_000_000;
  
    return {
      path,
      url,
      cost,
    };
};

export type RealtimeSessionType = "realtime" | "transcription";
export type RealtimeCallModel =
  | "gpt-realtime-2.1"
  | "gpt-realtime-2.1-mini";

export type CreateRealtimeClientSecretOptions = {
  /**
   * Session type bound to the client secret.
   * Defaults to `"realtime"` (voice call). Use `"transcription"` for dictation.
   */
  type?: RealtimeSessionType;
  /** Realtime call model to bind to the client secret. */
  model?: RealtimeCallModel;
  /** TTL in seconds (10–7200). Omit to use OpenAI’s default (600). */
  expiresAfterSeconds?: number;
  /**
   * Privacy-preserving end-user identifier for OpenAI abuse monitoring.
   * Prefer a hash of your internal user id — not raw email/username.
   * Bound to the secret via the OpenAI-Safety-Identifier header.
   */
  safetyIdentifier?: string;
};

export type RealtimeClientSecret = {
  value: string;
  expiresAt: number;
};

const DEFAULT_REALTIME_MODEL = "gpt-realtime-2.1";

const MAMMOTH_DICTATION_PROMPT =
  "Faithfully transcribe the user's speech for an educational chat composer. Preserve the speaker's language, wording, punctuation, and intent.";

export async function createRealtimeClientSecret(
  options: CreateRealtimeClientSecretOptions = {},
): Promise<RealtimeClientSecret> {
  const {
    type = "realtime",
    model = DEFAULT_REALTIME_MODEL,
    expiresAfterSeconds,
    safetyIdentifier,
  } = options;

  if (
    expiresAfterSeconds !== undefined &&
    (!Number.isInteger(expiresAfterSeconds) ||
      expiresAfterSeconds < 10 ||
      expiresAfterSeconds > 7200)
  ) {
    throw new Error("expiresAfterSeconds must be an integer between 10 and 7200");
  }

  const body: {
    expires_after?: { anchor: "created_at"; seconds: number };
    session:
      | { type: "realtime"; model: string }
      | {
        type: "transcription";
        audio: {
          input: {
            transcription: {
              model: "gpt-live-transcribe";
              prompt: string;
              delay: "minimal";
            };
            turn_detection: null;
          };
        };
      };
  } = {
    session: type === "transcription"
      ? {
        type: "transcription",
        audio: {
          input: {
            transcription: {
              model: "gpt-live-transcribe",
              prompt: MAMMOTH_DICTATION_PROMPT,
              delay: "minimal",
            },
            turn_detection: null,
          },
        },
      }
      : {
        type: "realtime",
        model,
      },
  };

  if (expiresAfterSeconds !== undefined) {
    body.expires_after = {
      anchor: "created_at",
      seconds: expiresAfterSeconds,
    };
  }

  // The installed SDK's generated types predate gpt-live-transcribe, but its
  // client-secret transport forwards the current documented JSON contract.
  const response = await client.realtime.clientSecrets.create(
    body as unknown as Parameters<
      typeof client.realtime.clientSecrets.create
    >[0],
    safetyIdentifier
      ? { headers: { "OpenAI-Safety-Identifier": safetyIdentifier } }
      : undefined,
  );

  return {
    value: response.value,
    expiresAt: response.expires_at,
  };
}

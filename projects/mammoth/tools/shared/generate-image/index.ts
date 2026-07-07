import "@std/dotenv/load";
import {
  type GeneratedFile,
  generateImage as generateImageWithAiSdk,
  generateText,
  tool,
  type UIToolInvocation,
} from "@ai";
import { z } from "@zod";
import {
  getImageDimensions,
  imageExtensionFromMediaType,
  imageSourceToUint8Array,
} from "../../../../../helper/image.ts";
import { uploadImage } from "../../../../../lib/cloudflare.ts";

const sizeSchema = z.string().regex(/^\d+x\d+$/).describe(
  "Optional image size in `{width}x{height}` format. Only use this when the selected model supports size.",
);

const aspectRatioSchema = z.string().regex(/^\d+:\d+$/).describe(
  "Optional aspect ratio in `{width}:{height}` format. Only use this when the selected model supports aspect ratios.",
);

const qualitySchema = z.enum(["auto", "low", "medium", "high"]).describe(
  "Optional image quality. For GPT Image 2, use `low`, `medium`, or `high`.",
);

const inputImageSchema = z.object({
  url: z.string().url().optional().describe(
    "Remote image URL to use as an input image.",
  ),
  dataURL: z.string().startsWith("data:").optional().describe(
    "Image as a data URL, for example `data:image/png;base64,...`.",
  ),
  base64: z.string().optional().describe("Image as raw base64 data."),
  mediaType: z.string().optional().describe(
    "Optional media type for raw base64 input, such as `image/png`.",
  ),
}).refine(
  (image) => Boolean(image.url || image.dataURL || image.base64),
  "Each input image must include url, dataURL, or base64.",
);

const generateImageInputSchema = z.object({
  model: z.string().min(1).describe(
    "AI SDK model id to use through the default provider, for example `openai/gpt-image-2` or `google/gemini-3.1-flash-lite-image`.",
  ),
  prompt: z.string().min(1).describe(
    "Text prompt describing the image to generate.",
  ),
  inputImages: z.array(inputImageSchema).optional().describe(
    "Optional input images for image editing or reference-image-capable models.",
  ),
  useLanguageModel: z.boolean().optional().describe(
    "Set true for multimodal language models that generate images through generateText, such as Gemini image models on AI Gateway.",
  ),
  size: sizeSchema.optional().describe(
    "Optional image size in `{width}x{height}` format, for example `1024x1024`. Use either size or aspectRatio; supported sizes vary by model and provider.",
  ),
  aspectRatio: aspectRatioSchema.optional().describe(
    "Optional image aspect ratio in `{width}:{height}` format, for example `16:9`. Use either aspectRatio or size; supported aspect ratios vary by model and provider.",
  ),
  resolution: z.string().min(1).optional().describe(
    "Optional resolution hint. For language-model image generation, this is added to the prompt.",
  ),
  quality: qualitySchema.optional().describe(
    "Optional image quality. Supported values vary by model and provider.",
  ),
});

const generateImageOutputSchema = z.object({
  width: z.number().int().positive().describe(
    "Generated image width in pixels.",
  ),
  height: z.number().int().positive().describe(
    "Generated image height in pixels.",
  ),
  url: z.string().url().describe(
    "Cloudflare-hosted URL for the generated image.",
  ),
  durationSeconds: z.number().int().positive().describe(
    "Duration of the image generation in seconds.",
  ),
});

export type GenerateImageInput = z.infer<typeof generateImageInputSchema>;
export type GenerateImageOutput = z.infer<typeof generateImageOutputSchema>;

async function uploadGeneratedImage(
  image: GeneratedFile,
  model: string,
): Promise<{ width: number; height: number; url: string }> {
  const dimensions = getImageDimensions(image.uint8Array);
  const extension = imageExtensionFromMediaType(image.mediaType);
  const imageBytes = Uint8Array.from(image.uint8Array);
  const blob = new Blob([imageBytes.buffer], { type: image.mediaType });
  const name = `${model}-${crypto.randomUUID()}`;
  const fileName = `${name}.${extension}`;
  const url = await uploadImage(
    blob,
    fileName,
    { temporary: true, prefix: "mammoth/generated-images", name },
  );

  return {
    width: dimensions.width,
    height: dimensions.height,
    url,
  };
}

function promptWithImageOptions(input: GenerateImageInput): string {
  const options = [
    input.size ? `Size: ${input.size}` : undefined,
    input.aspectRatio ? `Aspect ratio: ${input.aspectRatio}` : undefined,
    input.resolution ? `Resolution: ${input.resolution}` : undefined,
    input.quality ? `Quality: ${input.quality}` : undefined,
  ].filter(Boolean);

  return options.length
    ? `${input.prompt}\n\nImage generation options:\n${options.join("\n")}`
    : input.prompt;
}

export async function generateImage(
  input: GenerateImageInput,
): Promise<GenerateImageOutput> {
  const start = performance.now();

  if (input.size && input.aspectRatio) {
    throw new Error("Pass either size or aspectRatio, not both.");
  }

  const inputImageBytes = input.inputImages?.length
    ? await Promise.all(input.inputImages.map(imageSourceToUint8Array))
    : undefined;

  const modelId = input.model.split("/")[1];

  if (input.useLanguageModel) {
    const textPrompt = promptWithImageOptions(input);
    const prompt = inputImageBytes
      ? [{
        role: "user" as const,
        content: [
          { type: "text" as const, text: textPrompt },
          ...inputImageBytes.map((image) => ({
            type: "image" as const,
            image,
          })),
        ],
      }]
      : textPrompt;

    const result = await generateText({
      model: input.model,
      prompt,
    });
    const image = result.files.find((file) =>
      file.mediaType.startsWith("image/")
    );

    if (!image) {
      throw new Error(`Model ${input.model} did not return an image file.`);
    }

    const output = await uploadGeneratedImage(image, modelId);
    const durationSeconds = Math.round((performance.now() - start) / 1000);
    return {
      ...output,
      durationSeconds,
    };
  }

  const prompt = inputImageBytes
    ? { text: input.prompt, images: inputImageBytes }
    : input.prompt;

  const result = await generateImageWithAiSdk({
    model: input.model,
    prompt,
    size: input.size as `${number}x${number}` | undefined,
    aspectRatio: input.aspectRatio as `${number}:${number}` | undefined,
    providerOptions: input.quality
      ? { openai: { quality: input.quality } }
      : undefined,
  });
  const output = await uploadGeneratedImage(result.image, modelId);
  const durationSeconds = Math.round((performance.now() - start) / 1000);
  return {
    ...output,
    durationSeconds,
  };
}

export const generateImageTool = tool({
  description:
    "Generate an image from a prompt using an AI SDK image model or multimodal language model, optionally using input images, aspect ratio, size, quality, or provider-specific resolution, then upload it to Cloudflare.",
  inputSchema: generateImageInputSchema,
  outputSchema: generateImageOutputSchema,
  execute: generateImage,
});

export type GenerateImageToolInvocation = UIToolInvocation<
  typeof generateImageTool
>;

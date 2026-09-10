import "@std/dotenv/load";
import { generateImage, tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";
import { imageExtensionFromMediaType } from "../../../../../helper/image.ts";
import { uploadImage } from "../../../../../lib/cloudflare.ts";
import { imageSearchSelector } from "../../shared/image-search-selector/index.ts";

export const IMAGE_TOOL_DESCRIPTION =
  "Show the learner an image. Use when a photo would help them see or understand something.";

export const IMAGE_SYSTEM_PROMPT_DESCRIPTION = [
  "Use when a photo would help the learner see or understand something.",
  "Choose the type that best matches the need:",
  "  - search: find an existing photo of a real thing. Use when there is a real referent — a person, place, event, artwork, species, product, or what something actually looks like. Prefer search when in doubt.",
  "  - generate: invent an image. Use when the picture cannot exist as a photo — a simplified illustration, hypothetical scene, reconstruction, or stylized metaphor.",
  "Pass a self-contained prompt describing the image to show.",
].join("\n");

export const IMAGE_TYPES = [
  "search",
  "generate",
] as const;

export type ImageType = typeof IMAGE_TYPES[number];

export const imageTypeSchema = z.enum(IMAGE_TYPES);

export const imageInputSchema = z.object({
  type: imageTypeSchema.describe(
    "How to produce the image: search for an existing photo, or generate one.",
  ),
  prompt: z.string().min(1).describe(
    "A self-contained description of the image to show.",
  ),
});

export type ImageInput = z.infer<typeof imageInputSchema>;

export const imageOutputSchema = z.object({
  type: imageTypeSchema.describe("How the image was produced."),
  prompt: z.string().min(1).describe("The prompt used to produce the image."),
  url: z.string().min(1).describe("URL of the image."),
});

export type ImageToolOutput = z.infer<typeof imageOutputSchema>;

export async function executeImage(input: ImageInput): Promise<ImageToolOutput> {
    switch (input.type) {
        case "search":
            return await executeSearchImage(input);
        case "generate":
            return await executeGenerateImage(input);
        default:
            throw new Error(`Invalid image type: ${input.type}`);
    }
}

async function executeSearchImage(input: ImageInput): Promise<ImageToolOutput> {
    const result = await imageSearchSelector({
        prompt: input.prompt,
        mode: "smart",
        maxCandidates: 5,
        requireDownloadable: false,
    });
    if (!result.imageURL) {
        throw new Error("Failed to search image");
    }
    return {
        type: "search",
        prompt: input.prompt,
        url: result.imageURL,
    };
}


async function executeGenerateImage(input: ImageInput): Promise<ImageToolOutput> {
    const model = "openai/gpt-image-2.5-flare"
    const result = await generateImage({
        model,
        prompt: input.prompt
    });
    const image = result.image ?? result.images?.[0];
    if (!image) {
        throw new Error("Failed to generate image");
    }

    const extension = imageExtensionFromMediaType(image.mediaType);
    const imageBytes = Uint8Array.from(image.uint8Array);
    const blob = new Blob([imageBytes.buffer], { type: image.mediaType });
    const name = `${model}-${crypto.randomUUID()}`;
    const url = await uploadImage(
        blob,
        `${name}.${extension}`,
        { temporary: true, prefix: "sixtus/generated-images", name },
    );

    return {
        type: "generate",
        prompt: input.prompt,
        url,
    };
}

export const imageTool = tool({
  description: IMAGE_TOOL_DESCRIPTION,
  inputSchema: imageInputSchema,
  outputSchema: imageOutputSchema,
  execute: executeImage,
});

export type ImageToolInvocation = UIToolInvocation<typeof imageTool>;

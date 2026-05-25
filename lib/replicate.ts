import "@std/dotenv/load";
import Replicate from "@replicate";
import { withRetry } from "../helper/retry.ts";
import { uploadImage } from "./cloudflare.ts";


const replicate = new Replicate({ auth: Deno.env.get("REPLICATE_API_TOKEN")! });


export interface Seedance2Options {
    prompt: string;
    image: string;
    last_frame_image: string;
    reference_images: string[];
    reference_audios: string[];
    duration: number;
    resolution: "480p" | "720p" | "1080p";
    aspect_ratio: "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9" | "9:21";
    generate_audio: boolean;
    seed: number;
    outDir: string;
}

export interface Seedance2Output {
    path: string;
    url: string;
}

async function toReplicateFileInput(path: string): Promise<string | Blob> {
    if (path.startsWith("http://") || path.startsWith("https://")) {
        return path;
    }
    return new Blob([await Deno.readFile(path)]);
}

function getReplicateOutputUrl(result: unknown): string {
    if (typeof result === "string") {
        return result;
    }

    if (Array.isArray(result) && result.length > 0) {
        const item = result[0];
        if (typeof item === "string") {
            return item;
        }
        if (item && typeof item.url === "function") {
            return item.url();
        }
    }

    if (result && typeof (result as { url?: () => string }).url === "function") {
        return (result as { url: () => string }).url();
    }

    throw new Error("Unexpected Replicate output format for seedance-2.0");
}

export const seedance2 = async (options: Seedance2Options): Promise<Seedance2Output> => {
    const outputURL = await withRetry(async () => {
        const [image, lastFrameImage, referenceImages, referenceAudios] = await Promise.all([
            toReplicateFileInput(options.image),
            toReplicateFileInput(options.last_frame_image),
            Promise.all(options.reference_images.map(toReplicateFileInput)),
            Promise.all(options.reference_audios.map(toReplicateFileInput)),
        ]);

        const input: Record<string, unknown> = {
            prompt: options.prompt,
            image,
            last_frame_image: lastFrameImage,
            duration: options.duration,
            resolution: options.resolution,
            aspect_ratio: options.aspect_ratio,
            generate_audio: options.generate_audio,
            seed: options.seed,
        };

        if (referenceImages.length > 0) {
            input.reference_images = referenceImages;
        }

        if (referenceAudios.length > 0) {
            input.reference_audios = referenceAudios;
        }

        const result = await replicate.run("bytedance/seedance-2.0", { input });
        return getReplicateOutputUrl(result);
    });

    const path = await saveUrlToLocalFile(outputURL, options.outDir, "replicate-seedance-2.0");
    const url = await uploadImage(path, { temporary: true, prefix: "replicate-seedance-2.0" });
    return { path, url };
};

async function saveUrlToLocalFile(url: string, outDir: string, prefix: string): Promise<string> {
    const res = await fetch(url);
    const data = new Uint8Array(await res.arrayBuffer());
    const ext = res.headers.get("content-type")?.includes("webm") ? "webm" : "mp4";
    const path = `${outDir}/${prefix}-${crypto.randomUUID()}.${ext}`;
    await Deno.writeFile(path, data);
    return path;
}


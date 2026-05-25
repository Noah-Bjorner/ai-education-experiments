import "@std/dotenv/load";
import { generateText, Output } from "@ai";
import { z } from "@zod";
import { ensureLocalImagePath } from "../../../helper/image.ts";
import { getGPTImage2 } from "../../../lib/openai.ts";
import { seedance2, type Seedance2Output } from "../../../lib/replicate.ts";
import { generateGuideNarrationAudio } from "./guide.ts";
import type { WorkflowScene } from "../workflow.ts";

export interface HistoricalEnvironmentZoomOutInput {
    panorama_360_image: string;
    location: string;
    date: string;
    outDir?: string;
}

export interface HistoricalEnvironmentZoomOutOutput {
    image_url: string;
    path: string;
    image_instructions: string;
}

export interface GenerateIntroVideoScriptInput {
    title: string;
    language: string;
    full_script: string;
    scenes: WorkflowScene[];
    durationSeconds?: number;
}

export interface IntroVideoScriptOutput {
    guide_script: string;
    video_instructions: string;
    duration_seconds: number;
    first_scene_index: number;
}

export interface GenerateIntroVideoInput extends GenerateIntroVideoScriptInput {
    start_frame_image: string;
    outDir?: string;
    resolution?: "480p" | "720p" | "1080p";
    generateAudio?: boolean;
    seed?: number;
    reference_images?: string[];
}

export interface IntroVideoOutput {
    video: Seedance2Output;
    script: IntroVideoScriptOutput;
    guide_audio: string;
    guide_captions: Awaited<ReturnType<typeof generateGuideNarrationAudio>>["captions"];
}

const ZOOM_OUT_PROMPT = (input: Omit<HistoricalEnvironmentZoomOutInput, "panorama_360_image" | "outDir">) => `
## Role
You are an expert historical scene director and aerial cinematographer for educational history video.

## Task
You are given a reference image: a 360-degree equirectangular panorama of a historical scene.
Generate a photorealistic 16:9 widescreen establishing shot that zooms out from that environment.
Use the panorama only as a scene reference for content, period detail, weather, lighting, and mood.
Do not copy its equirectangular projection, spherical distortion, stretched edges, curved horizon, or seam artifacts.

Study the reference carefully before generating. Match what you actually see in it:
- Interior vs exterior, and what kind of space it is
- Weather and sky (clear, cloudy, overcast, hazy, rainy, etc.) as visible through windows/openings or outdoors
- Time of day and lighting quality (morning, midday, golden hour, candlelit interior, etc.)
- Color palette, materials, architecture, crowd density, and period details
- Geographic and historical cues that locate the scene
- Mood and atmosphere

Be precise about observable conditions. If the panorama shows soft overcast daylight through tall windows,
the establishing shot must use the same weather and light. Do not invent bright sun if the source is cloudy.

The generated image must:
- Feel like a camera hovering above the real-world location that contains the 360 scene: zoomed out,
  cinematic, geographically coherent with the panorama and metadata
- Show the exterior or wider context of the place (building, square, harbor, battlefield, palace complex, etc.)
  at a scale that situates the learner before they enter the 360 environment
- Perfectly match the panorama's weather, sky, lighting, season, and atmosphere
- Match the historical period from date and location (clothing era, architecture, technology)
- Use "photorealistic immersive historical reconstruction" for pre-photography eras
- Be a normal perspective photograph, NOT equirectangular, NOT fisheye, NOT a 360 panorama
- Treat the output as a standalone rectilinear image, with straight architectural lines and natural perspective
- Have strong composition for 16:9 video: clear horizon, readable landmark architecture, depth, and context
- Exclude modern objects, anachronisms, stylized CGI, painterly looks, text overlays, watermarks, 360-photo warping, and panoramic squeeze distortion

Scene metadata:
- location: ${input.location}
- date: ${input.date}
`;

const INTRO_VIDEO_SCRIPT_SCHEMA = z.object({
    guide_script: z.string(),
    video_instructions: z.string(),
}).strict();

const INTRO_VIDEO_SCRIPT_PROMPT = (
    input: Omit<GenerateIntroVideoScriptInput, "durationSeconds"> & {
        durationSeconds: number;
        firstScene: WorkflowScene;
    },
) => `
## Role
You are an expert writer and cinematic director for short educational history intro videos.

## Task
Create the in-between script for a ${input.durationSeconds}-second intro video.

The video always starts with Leo, the bird guide character, in space. Leo initially faces the camera
as he introduces himself, then turns and flies toward Earth, bringing the camera with him.
The video always ends as a zoomed-out aerial hover above the first real historical scene.
The start frame and end frame already exist, so your job is to bridge them with concise guide narration
and practical video-model instructions.

## Source Material
Use the full script and scene data as the truth for the historical arc. Scene index 0, if present, is mock
intro data and must be ignored. The first real scene is:
${JSON.stringify(input.firstScene, null, 2)}

Full script:
${input.full_script}

All scenes:
${JSON.stringify(input.scenes, null, 2)}

## Guide Character
The guide is Leo, the narrator of this experience. Leo appears on screen in the intro video.
This is the learner's first meeting with Leo, so the guide_script must open with a brief, natural
self-introduction in the target language (for example, "Hi, I'm Leo..." in English, or the equivalent
in ${input.language}).

## Guide Script Requirements
- Match this language: ${input.language}.
- Write spoken narration for the guide character, suitable for roughly ${input.durationSeconds} seconds.
- Structure the line in two beats:
  1. Introduce Leo as the learner's guide for this historical journey.
  2. Set the stage for the first scene—where and when the experience begins, and why that moment matters.
- Hand off naturally into the first environment scene. Do not summarize the whole arc or list upcoming scenes.
- It should feel like a warm, personal invitation from a historically careful guide, not a trailer voiceover.
- Mention the first scene's place and/or date when it helps orient the learner.
- Do not include camera directions, labels, markdown, citations, stage directions, or quotation marks.

## Video Instructions Requirements
- Describe only what happens between the provided start and end frames.
- Keep the guide and learner visually consistent from the start frame.
- Start with Leo facing the camera for the self-introduction, then have him turn toward Earth and fly forward.
- Make the camera follow just behind or alongside Leo as he leads the learner from cosmic scale to the historical location.
- Move from cosmic scale to historical location in one smooth, cinematic zoom led by Leo's flight.
- End by matching the provided end frame: a hovering aerial establishing view above the first scene.
- Avoid text overlays, maps, modern UI, anachronisms, hard cuts, or changing the historical content of the end frame.
- Keep the tone educational, immersive, and calm.

## Output
Return only valid JSON with this exact shape:
{
  "guide_script": <spoken guide narration only>,
  "video_instructions": <video model instructions for the in-between motion>
}
`;

export const historicalEnvironmentZoomOut = async (
    input: HistoricalEnvironmentZoomOutInput,
): Promise<HistoricalEnvironmentZoomOutOutput> => {
    const outDir = input.outDir ?? "./output";
    const panoramaPath = await ensureLocalImagePath(input.panorama_360_image, outDir, "panorama-ref");
    const image_instructions = ZOOM_OUT_PROMPT(input);

    const image = await getGPTImage2({
        prompt: image_instructions,
        outDir,
        upload: true,
        aspectRatio: "16:9",
        resolution: "2K",
        format: "jpg",
        quality: "high",
        imageInputPaths: [panoramaPath],
    });

    return {
        image_url: image.url,
        path: image.path,
        image_instructions,
    };
};

export const generateIntroVideoScript = async (
    input: GenerateIntroVideoScriptInput,
): Promise<IntroVideoScriptOutput> => {
    const duration_seconds = input.durationSeconds ?? 10;
    const firstScene = getFirstRealScene(input.scenes);

    const { output } = await generateText({
        model: "openai/gpt-5.5",
        output: Output.object({
            schema: INTRO_VIDEO_SCRIPT_SCHEMA,
            name: "history_360_intro_video_script",
            description: "Short guide narration and video instructions for the intro transition.",
        }),
        prompt: INTRO_VIDEO_SCRIPT_PROMPT({
            ...input,
            durationSeconds: duration_seconds,
            firstScene,
        }),
    });

    return {
        ...output,
        duration_seconds,
        first_scene_index: firstScene.scene_index,
    };
};

const getFirstRealScene = (scenes: WorkflowScene[]): WorkflowScene => {
    const firstScene = scenes
        .filter((scene) => scene.scene_index > 0 && scene.scene_type !== "video")
        .sort((a, b) => a.scene_index - b.scene_index)[0];

    if (!firstScene) {
        throw new Error("Cannot generate intro video script without at least one real environment scene.");
    }

    return firstScene;
};

const INTRO_VIDEO_SEEDANCE_PROMPT = (script: IntroVideoScriptOutput) => `
Create a cinematic educational intro transition between the provided first frame and last frame.

Guide narration:
${script.guide_script}

Motion and scene direction:
${script.video_instructions}

Hard requirements:
- Use the first image as the exact opening frame.
- Use the last_frame_image as the exact final frame.
- Keep the guide character visually consistent throughout the transition.
- Leo starts by facing the camera, then turns and flies toward Earth, naturally pulling the camera along with him.
- The camera move should feel like one continuous Leo-led flight and zoom from space down toward the first historical scene.
- Do not add captions, subtitles, labels, maps, logos, UI, or text overlays.
- Do not alter the historical details visible in the final frame.
- End calmly in a stable hovering aerial view so the next 360 scene can begin naturally.
`;




export const generateIntroVideo = async (
    input: GenerateIntroVideoInput,
): Promise<IntroVideoOutput> => {
    const duration_seconds = input.durationSeconds ?? 10;
    const outDir = input.outDir ?? "./output";
    const first_scene = input.scenes[0];
    const end_frame = await historicalEnvironmentZoomOut({
        panorama_360_image: first_scene.image_url ?? "",
        location: first_scene.location ?? "",
        date: first_scene.date ?? "",
        outDir,
    });

    const script = await generateIntroVideoScript({
        title: input.title,
        language: input.language,
        full_script: input.full_script,
        scenes: input.scenes,
        durationSeconds: duration_seconds,
    });

    const narration = await generateGuideNarrationAudio({
        script: script.guide_script,
        language: input.language,
    });

    const video_duration = narration.durationSeconds + 2;
    
    const video = await seedance2({
        prompt: INTRO_VIDEO_SEEDANCE_PROMPT(script),
        image: input.start_frame_image,
        last_frame_image: end_frame.image_url,
        reference_images: input.reference_images ?? [],
        reference_audios: [narration.audio],
        duration: video_duration,
        resolution: input.resolution ?? "720p",
        aspect_ratio: "16:9",
        generate_audio: input.generateAudio ?? true,
        seed: input.seed ?? Math.floor(Math.random() * 1_000_000_000),
        outDir,
    });

    return {
        video,
        script,
        guide_audio: narration.audio,
        guide_captions: narration.captions,
    };
};
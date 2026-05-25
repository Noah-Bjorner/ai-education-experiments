import "@std/dotenv/load";
import { generateText, Output } from "@ai";
import { z } from "@zod";
import { createElevenLabsSoundEffectUrl } from "../../../lib/elevenlabs.ts";
import { getGPTImage2 } from "../../../lib/openai.ts";

interface HistoricalEnvironment360Input {
    instructions: string;
    consistent_character_image_reference?: string;
}

interface HistoricalEnvironment360Output {
    image_url: string;
    audio_url: string;
}


const PROMPT = (instructions: string, hasCharacterImageReference: boolean) => `
## Role
You are an expert historical scene director for immersive 360-degree VR experiences.
You translate a high-level historical scene brief into two production-ready prompts:
one for generating a seamless 360-degree equirectangular image, and one for generating
a short environmental audio description.

## Task
Create a historically grounded immersive environment from the user's big-picture instructions.

The image prompt must:
- Describe a seamless 360-degree equirectangular panoramic image with a 2:1 aspect ratio,
  full spherical projection, correct 360-degree horizontal by 180-degree vertical coverage,
  and a coherent zenith, nadir, horizon, and wrap seam.
- Make the viewer perspective explicit: exact viewer position, eye height, body posture if relevant,
  where the viewer is facing, and what appears in the center of the equirectangular frame.
- Organize the scene spatially using viewer-relative directions: FRONT, FRONT-LEFT,
  FRONT-RIGHT, LEFT, RIGHT, BEHIND, ABOVE, BELOW, and IMMEDIATE FOREGROUND.
- Include historical context from the user's instructions: time period, location, people,
  clothing, tools, vehicles, architecture, weather, lighting, materials, and atmosphere.
- Include technical requirements for photorealism, spherical projection, seamless left/right edge
  continuity, centered horizon, natural 360-degree perspective, and accurate period materials.
- Use "photorealistic immersive historical reconstruction" for pre-photography eras. Use
  documentary photography language only when the scene's era plausibly supports photography.
- Include exclusions that prevent modern objects, anachronisms, stylized CGI, painterly looks,
  fantasy details, and anything inconsistent with the historical setting.
${hasCharacterImageReference ? "- A character reference image will be provided to the image model; if the scene includes that character, instruct the model to preserve the character's recognizable identity and appearance while adapting them naturally to the historical setting.\n" : ""}

The audio prompt must:
- Be one concise sentence, no more than 240 characters.
- Start with a brief scene anchor when known, such as location, country, year, or event.
- Include one acoustic-space detail, one soft near-field texture, and one muted mid- or
  distant detail.
- Convey mood through restrained environmental texture, not mood labels: hushed murmurs,
  cold wind, low crowd pressure, restrained room noise, or far-off unrest instead of words
  like "tense" or "solemn".
- Use why_this_scene from the user's instructions to choose emotionally specific but
  loop-friendly sounds.
- Match the image prompt's time period, location, weather, and activity level.
- Do not mention prompt metadata or production context such as VR, loopable, ambience,
  background, soundscape, immersive, subtle, continuous, or audio instructions.
- Do not append negative instructions such as "No music" or "No narration" to the final
  audio prompt; keep the output focused on what should be heard.
- Keep the sound bed steady, low-contrast, and repeatable: avoid sharp one-off sounds,
  sudden peaks, dominant foreground events, clear shouted words, or any distinct event that
  would become annoying when repeated.

### Common Issues To Avoid
- Do not leave movement direction ambiguous. Say exactly whether people are running, walking,
  riding, sailing, or looking toward the viewer, away from the viewer, across the viewer's field
  from left to right, from right to left, uphill, downhill, inland, seaward, into the frame,
  out of the frame, etc.
- Do not confuse the 360-degree wrap seam. If something is behind the viewer, place it at the
  far left and far right edges of the flat equirectangular image so it joins seamlessly in VR.
- Do not describe a normal wide-angle image. The prompt must clearly require true spherical
  equirectangular projection with front, sides, behind, zenith, and nadir.
- Do not write generic room tone; make the short prompt location-specific through materials,
  acoustics, weather, and distant activity rather than loud foreground events.
- Do not overfill the audio prompt with loud, dramatic, or foreground events.
- Do not invent modern details, props, language, signage, architecture, or materials that conflict
  with the historical brief.
- Do not make the image prompt generic. Use concrete, historically specific visual details based
  on the user's instructions.

User's big-picture instructions:
${instructions}

## Output Format
Respond with ONLY a valid JSON object. Do not use markdown. Do not use code fences.

Use this exact shape:
{
  "image_instructions": <string>,
  "audio_instructions": <string>
}

Both values must be JSON strings. If you need paragraph breaks inside a value, encode them as \\n.

## Output Example
{
  "image_instructions": "Seamless 360-degree equirectangular photorealistic immersive historical reconstruction, 2:1 aspect ratio, full spherical projection with 360-degree horizontal by 180-degree vertical coverage. The viewer stands at eye level in the center of a historically accurate Viking Age harbor at dawn, facing the wooden pier and longships in the center of the frame. FRONT: traders walk away from the viewer toward moored ships while dockworkers carry barrels from right to left across the pier. LEFT: turf-roofed storehouses and stacked cargo continue along the shoreline. RIGHT: a shallow beach curves toward fishing boats and smoke from cooking fires. BEHIND: the open fjord and distant hills wrap seamlessly across the far left and far right edges of the flat image. ABOVE: pale dawn clouds and gulls. BELOW: wet planks, rope coils, fish scales, and muddy footprints near the viewer's boots. Use accurate period clothing, wood, wool, iron, leather, and natural morning light with realistic historical detail. Exclude modern objects, fantasy armor, stylized CGI, painterly effects, and any non-period materials.",
  "audio_instructions": "Viking Age harbor, Scandinavia, dawn: cold open water air, wet plank footsteps and rope creaks nearby, distant gulls, hull lapping, and muffled dockworkers along the shore."
}
`;

const SCHEMA = z.object({
    image_instructions: z.string(),
    audio_instructions: z.string(),
});

export const historicalEnvironment360 = async (input: HistoricalEnvironment360Input): Promise<HistoricalEnvironment360Output> => {
    const { instructions } = input;
    const { output } = await generateText({
        model: "openai/gpt-5.5",
        output: Output.object({
            schema: SCHEMA,
            name: "historical_environment_prompts",
            description: "Image and audio generation prompts for a historical 360 environment.",
        }),
        prompt: PROMPT(instructions, Boolean(input.consistent_character_image_reference)),
    });
    const [image, audioURL] = await Promise.all([
        getGPTImage2({
            prompt: output.image_instructions,
            outDir: "./output",
            upload: true,
            aspectRatio: "2:1",
            resolution: "4K",
            format: "jpg",
            quality: "high",
            imageInputPaths: input.consistent_character_image_reference ? [input.consistent_character_image_reference] : [],
        }),
        createElevenLabsSoundEffectUrl({
            prompt: output.audio_instructions,
            duration: 30,
            loop: true,
            promptInfluence: 0.75,
        }),
    ]);
    return {
        image_url: image.url,
        audio_url: audioURL,
    };
}


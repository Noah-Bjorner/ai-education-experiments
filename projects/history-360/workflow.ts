import { outlineAgent } from "./steps/outline.ts";
import { guideAgent, generateGuideNarrationAudio } from "./steps/guide.ts";
import { historicalEnvironment360 } from "./steps/360-historical-environment.ts";
import { generateIntroVideo } from "./steps/video.ts";

const guideAssets = {
    firstFrame: new URL("./assets/leo_first_frame.png", import.meta.url).pathname,
    characterSheet: new URL("./assets/leo_character_sheet.png", import.meta.url).pathname,
} as const;

type Outline = Awaited<ReturnType<typeof generateOutline>>;
type OutlineScene = Outline["scenes"][number];
type IndexedScene = OutlineScene & { scene_index: number };
type GuideScript = {
    scene_index: number;
    guide_script: string;
};
type SceneWithGuide = IndexedScene & {
    guide_script: string;
};
type SceneAssets = {
    historicalEnvironment: Awaited<ReturnType<typeof historicalEnvironment360>>;
    guideNarration: Awaited<ReturnType<typeof generateGuideNarrationAudio>>;
};

export interface WorkflowOutput {
    title: string;
    language: string;
    educational_arc: string;
    recurring_characters: string[];
    prompt: string;
    full_script: string;
    scenes: WorkflowScene[];
}

export interface WorkflowScene {
    scene_type: "environment" | "video";
    scene_index: number;
    title: string;
    date?: string;
    location?: string;
    guide_script?: string;
    image_url?: string;
    audio_url?: string;
    guide_audio?: string;
    guide_captions?: {
        text: string;
        words: {
            text: string;
            start: number;
            end: number;    
        }[];
      };
    video_url?: string;
}

export const workflow = async (user_prompt: string): Promise<WorkflowOutput> => {
    const outline = await generateOutline(user_prompt);
    const scenesWithIndex = addSceneIndexes(outline.scenes);
    const guideScripts = await generateGuideScripts(user_prompt, outline, scenesWithIndex);
    const scenesWithGuide = attachGuideScripts(scenesWithIndex, guideScripts);
    const sceneAssetsBySceneIndex = await generateSceneAssets(user_prompt, outline, scenesWithGuide);
    const bodyScenes = assembleWorkflowOutput(user_prompt, outline, scenesWithGuide, sceneAssetsBySceneIndex);

    const firstBodyScene = bodyScenes.scenes[0];
    if (!firstBodyScene?.image_url) {
        throw new Error("Cannot generate intro video without the first scene's 360 image.");
    }

    const introVideo = await generateIntroVideo({
        title: outline.title,
        language: outline.language,
        full_script: bodyScenes.scenes.map((scene) => scene.guide_script).join("\n\n"),
        scenes: bodyScenes.scenes,
        durationSeconds: 7,
        start_frame_image: guideAssets.firstFrame,
        reference_images: [guideAssets.characterSheet],
    });
    const introScene: WorkflowScene = {
        scene_type: "video" as const,
        scene_index: 0,
        title: "Intro",
        guide_script: introVideo.script.guide_script,
        video_url: introVideo.video.url,
        guide_audio: introVideo.guide_audio,
        guide_captions: introVideo.guide_captions,
    };

    const allScenes = [introScene, ...bodyScenes.scenes];

    return {
        ...bodyScenes,
        scenes: allScenes,
    };
}

const generateOutline = async (user_prompt: string) => {
    const { output: outline } = await outlineAgent.generate({
        prompt: user_prompt,
    });

    return outline;
}

const addSceneIndexes = (scenes: OutlineScene[]): IndexedScene[] => {
    return scenes.map((scene, index) => ({
        scene_index: index + 1,
        ...scene,
    }));
}

const generateGuideScripts = async (
    user_prompt: string,
    outline: Outline,
    scenesWithIndex: IndexedScene[],
): Promise<GuideScript[]> => {
    const { output: guide } = await guideAgent.generate({
        prompt: JSON.stringify({
            user_prompt,
            outline: {
                ...outline,
                scenes: scenesWithIndex,
            },
        }, null, 2),
    });

    return guide.guide_scripts;
}

const attachGuideScripts = (
    scenesWithIndex: IndexedScene[],
    guideScripts: GuideScript[],
): SceneWithGuide[] => {
    const guideScriptsBySceneIndex = new Map(
        guideScripts.map((script) => [script.scene_index, script.guide_script]),
    );

    return scenesWithIndex.map((scene) => {
        const guide_script = guideScriptsBySceneIndex.get(scene.scene_index);

        if (!guide_script) {
            throw new Error(`Missing guide script for scene ${scene.scene_index}.`);
        }

        return {
            ...scene,
            guide_script,
        };
    });
}

const generateSceneAssets = async (
    user_prompt: string,
    outline: Outline,
    scenesWithGuide: SceneWithGuide[],
): Promise<Map<number, SceneAssets>> => {
    return new Map(
        await Promise.all(
            scenesWithGuide.map(async (scene) => {
                const [historicalEnvironment, guideNarration] = await Promise.all([
                    historicalEnvironment360({
                        instructions: JSON.stringify({
                            user_prompt,
                            outline: {
                                title: outline.title,
                                language: outline.language,
                                educational_arc: outline.educational_arc,
                                recurring_characters: outline.recurring_characters,
                            },
                            scene,
                        }, null, 2),
                    }),
                    generateGuideNarrationAudio({
                        script: scene.guide_script,
                        language: outline.language,
                    }),
                ]);

                return [scene.scene_index, { historicalEnvironment, guideNarration }] as const;
            }),
        ),
    );
}

const assembleWorkflowOutput = (
    user_prompt: string,
    outline: Outline,
    scenesWithGuide: SceneWithGuide[],
    sceneAssetsBySceneIndex: Map<number, SceneAssets>,
): WorkflowOutput => {
    return {
        ...outline,
        prompt: user_prompt,
        full_script: scenesWithGuide.map((scene) => scene.guide_script).join("\n\n"),
        scenes: scenesWithGuide.map((scene) => {
            const sceneAssets = sceneAssetsBySceneIndex.get(scene.scene_index);

            if (!sceneAssets) {
                throw new Error(`Missing scene assets for scene ${scene.scene_index}.`);
            }

            const { historicalEnvironment, guideNarration } = sceneAssets;

            return {
                scene_type: "environment" as const,
                ...scene,
                ...historicalEnvironment,
                guide_audio: guideNarration.audio,
                guide_captions: guideNarration.captions,
            };
        }),
    };
}
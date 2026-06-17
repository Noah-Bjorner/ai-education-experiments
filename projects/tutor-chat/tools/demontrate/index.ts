import "@std/dotenv/load";
import { generateText, tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";
import { uploadDocument } from "../../../../lib/cloudflare.ts";
import {
  triggerRemotionRender,
  type TriggerMachinePreset,
} from "../../../../lib/trigger-render.ts";
import { REMOTION_FILE_GENERATOR_INSTRUCTIONS } from "./PROMPT.ts";

const REMOTION_FILE_GENERATOR_MODEL = "moonshotai/kimi-k2.7-code-highspeed"; //"anthropic/claude-opus-4.8";
const REMOTION_FILE_GENERATOR_MODEL_REASONING = "medium";
const DEMONSTRATION_RENDER_MACHINE: TriggerMachinePreset = "medium-2x";

const demonstrationVideoConfigSchema = z.object({
  width: z.number().int().positive().describe("Video width in pixels."),
  height: z.number().int().positive().describe("Video height in pixels."),
  fps: z.number().int().positive().describe("Frames per second."),
  durationInFrames: z.number().int().positive().describe("Total video duration in frames."),
});

export type DemonstrationOutput = string;

const createDemonstrationInputSchema = z.object({
  instruction: z.string().min(1).describe(
    "A self-contained plan for the demonstration: what concept to show, what appears on screen, and how the motion unfolds over time.",
  ),
});

type CreateDemonstrationOptions = z.infer<
  typeof createDemonstrationInputSchema
>;

function stripMarkdownCodeFence(source: string): string {
  const trimmed = source.trim();
  const match = trimmed.match(
    /^```(?:tsx|typescript|ts|jsx|javascript|js)?\s*\n([\s\S]*?)\n```$/,
  );

  return match ? match[1].trim() : trimmed;
}

function extractIntegerConstant(source: string, name: string): number {
  const match = source.match(
    new RegExp(
      `(?:^|\\n)\\s*(?:export\\s+)?const\\s+${name}\\s*(?::\\s*number)?\\s*=\\s*(\\d+)\\s*(?:as\\s+const\\s*)?;`,
      "m",
    ),
  );

  if (!match) {
    throw new Error(
      `Generated Remotion file must define numeric constant ${name}.`,
    );
  }

  return Number(match[1]);
}

function extractDemonstrationVideoConfig(
  tsx: string,
): z.infer<typeof demonstrationVideoConfigSchema> {
  const source = stripMarkdownCodeFence(tsx);

  return demonstrationVideoConfigSchema.parse({
    width: extractIntegerConstant(source, "WIDTH"),
    height: extractIntegerConstant(source, "HEIGHT"),
    fps: extractIntegerConstant(source, "FPS"),
    durationInFrames: extractIntegerConstant(source, "DURATION_IN_FRAMES"),
  });
}

function formatDemonstrationOutput(
  videoUrl: string,
  durationInSeconds: number,
  width: number,
  height: number,
  instruction: string,
): DemonstrationOutput {
  return `url:${videoUrl}, duration: ${durationInSeconds}, width: ${width}, height: ${height}, instruction: ${instruction}`;
}

export async function createDemonstration(
  options: CreateDemonstrationOptions,
): Promise<DemonstrationOutput> {
  const { instruction } = options;
  const uniqueId = crypto.randomUUID();
  const outDir = `./output/${uniqueId}`;

  try {
    const { text: rawTsx } = await generateText({
      model: REMOTION_FILE_GENERATOR_MODEL,
      reasoning: REMOTION_FILE_GENERATOR_MODEL_REASONING,
      system: REMOTION_FILE_GENERATOR_INSTRUCTIONS,
      prompt: instruction,
    });

    const tsx = stripMarkdownCodeFence(rawTsx);
    const videoConfig = extractDemonstrationVideoConfig(tsx);

    await Deno.mkdir(outDir, { recursive: true });
    const tsxPath = `${outDir}/remotion-${uniqueId}.tsx`;
    await Deno.writeTextFile(tsxPath, tsx);

    const tsxFilename = `remotion-${uniqueId}.tsx`;
    const tsxUrl = await uploadDocument(
      new Blob([tsx], { type: "text/plain; charset=utf-8" }),
      tsxFilename,
      { temporary: true },
    );

    const { videoUrl } = await triggerRemotionRender(
      {
        tsxUrl,
        ...videoConfig,
      },
      {
        machine: DEMONSTRATION_RENDER_MACHINE,
      },
    );

    const durationInSeconds = videoConfig.durationInFrames / videoConfig.fps;

    return formatDemonstrationOutput(
      videoUrl,
      durationInSeconds,
      videoConfig.width,
      videoConfig.height,
      instruction,
    );
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    try {
      await Deno.remove(outDir, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        console.warn(
          "Failed to clean up demonstration output directory.",
          error,
        );
      }
    }
  }
}

export const demonstrationTool = tool({
  description: "Show the learner an idea visually, like sketching on a whiteboard, by generating a short animated clip. Plays alongside your written response and carries the visual part of the explanation. Pass instruction as a self-contained brief: the concept, what appears on screen, and how it moves over time.",
  inputSchema: createDemonstrationInputSchema,
  execute: createDemonstration,
});

export type DemonstrationToolInvocation = UIToolInvocation<typeof demonstrationTool>;



/*
const start = performance.now();
const result = await createDemonstration({
  instruction:
    "Explain supply and demand curves by showing a graph with price on the vertical axis and quantity on the horizontal axis. Start with a downward-sloping demand curve and an upward-sloping supply curve, then highlight the equilibrium point where they intersect. Show what happens when demand increases by shifting the demand curve right, raising both equilibrium price and quantity.",
});
const end = performance.now();
console.log(
  `Result(v5) (${REMOTION_FILE_GENERATOR_MODEL}):`,
  JSON.stringify(result, null, 2),
);
console.log(`Time taken: ${((end - start) / 1000).toFixed(2)} seconds`);
*/

/*
  Examples
  - Show how recursion works by visualizing the call stack for a factorial(3) calculation. First, show three stack frames piling up as the function calls itself down to the base case of factorial(1) = 1. Then, show the stack unwinding as values are returned back down the stack to compute the final result of 6.
  - Explain supply and demand curves by showing a graph with price on the vertical axis and quantity on the horizontal axis. Start with a downward-sloping demand curve and an upward-sloping supply curve, then highlight the equilibrium point where they intersect. Show what happens when demand increases by shifting the demand curve right, raising both equilibrium price and quantity.
  - Explain the offside rule in soccer by showing a simple field view with an attacker, defenders, the ball, and the goal. Pause at the moment the pass is made, draw a line through the second-to-last defender, and show that an attacker is offside if they are beyond that line and actively involved in the play. Contrast it with an onside example where the attacker stays level with or behind the defender when the pass is played.
  - Explain the three branches of government in the USA by showing three labeled pillars: Legislative, Executive, and Judicial. Show Congress making laws, the President enforcing laws, and the Supreme Court interpreting laws. Then animate arrows between the branches to show checks and balances, such as vetoes, judicial review, and congressional oversight.
  - Explain bell curve distributions by showing a normal distribution curve centered around the mean. Highlight that most values cluster near the center, fewer values appear toward the tails, and the curve is symmetric. Add bands for one, two, and three standard deviations to show how data becomes less common farther from the average.
  - Explain the multiple generations, long term effect on having an TFR(Total Fertility Rate) of 1.5 on total population by doing a graph showing how many children each generation will have.

  - Show the teritory held by Nazi Germany in the beginning of World War II and at the end.
  - Show the EUs expansion from inception to present day use blue to indicate the countries that joined.
  */


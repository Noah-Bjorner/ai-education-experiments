import "@std/dotenv/load";
import { generateText, Output, tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";
import { uploadDocument } from "../../../../lib/cloudflare.ts";
import {
  triggerRemotionRender,
  type TriggerMachinePreset,
} from "../../../../trigger/client/render.ts";
import { HOW_TO_USE_SVG_HELPER, svg } from "../../../../helper/svg/index.ts";
import {
  REMOTION_FILE_GENERATOR_INSTRUCTIONS,
  SVG_GROUNDING_INSTRUCTIONS,
} from "./PROMPT.ts";
import { validateGeneratedTsxForRender } from "./validate-tsx.ts";

const REMOTION_FILE_GENERATOR_MODEL = "anthropic/claude-opus-4.8";
const REMOTION_FILE_GENERATOR_MODEL_REASONING = "medium";
const DEMONSTRATION_RENDER_MACHINE: TriggerMachinePreset = "large-2x";
const MAX_GENERATION_ATTEMPTS = 3;

const demonstrationVideoConfigSchema = z.object({
  width: z.number().int().positive().describe("Video width in pixels."),
  height: z.number().int().positive().describe("Video height in pixels."),
  fps: z.number().int().positive().describe("Frames per second."),
  durationInFrames: z.number().int().positive().describe("Total video duration in frames."),
});

export const demonstrationOutputSchema = z.object({
  url: z.string().url().describe("URL of the rendered demonstration video."),
  duration: z.number().positive().describe("Video duration in seconds."),
  width: z.number().int().positive().describe("Video width in pixels."),
  height: z.number().int().positive().describe("Video height in pixels."),
  instruction: z.string().min(1).describe("The instruction used to create the demonstration."),
});

export type DemonstrationOutput = z.infer<typeof demonstrationOutputSchema>;

const createDemonstrationInputSchema = z.object({
  instruction: z.string().min(1).describe(
    "A self-contained plan for the demonstration: what concept to show, what appears on screen, and how the motion unfolds over time.",
  ),
});

type CreateDemonstrationOptions = z.infer<
  typeof createDemonstrationInputSchema
>;

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
  return demonstrationVideoConfigSchema.parse({
    width: extractIntegerConstant(tsx, "WIDTH"),
    height: extractIntegerConstant(tsx, "HEIGHT"),
    fps: extractIntegerConstant(tsx, "FPS"),
    durationInFrames: extractIntegerConstant(tsx, "DURATION_IN_FRAMES"),
  });
}

function createDemonstrationOutput(
  videoUrl: string,
  durationInSeconds: number,
  width: number,
  height: number,
  instruction: string,
): DemonstrationOutput {
  return demonstrationOutputSchema.parse({
    url: videoUrl,
    duration: durationInSeconds,
    width,
    height,
    instruction,
  });
}

function buildGenerationPrompt(
  instruction: string,
  validationErrors: string[],
): string {
  if (validationErrors.length === 0) {
    return instruction;
  }

  return [
    instruction,
    "",
    "Previous generation failed validation. Fix every issue below and return only valid TSX source code with no markdown fences or commentary.",
    ...validationErrors.map((error) => `- ${error}`),
  ].join("\n");
}

async function generateValidatedTsx(
  instruction: string,
  groundingSVGs: string[],
): Promise<string> {
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const prompt = buildGenerationPrompt(instruction, lastErrors);
    const { text: rawTsx, providerMetadata } = await generateText({
      model: REMOTION_FILE_GENERATOR_MODEL,
      reasoning: REMOTION_FILE_GENERATOR_MODEL_REASONING,
      system: REMOTION_FILE_GENERATOR_INSTRUCTIONS({ svgReferences: groundingSVGs }),
      prompt,
    });
    
    const validation = validateGeneratedTsxForRender(rawTsx);
    if (validation.ok) {
      return validation.tsx;
    }

    lastErrors = validation.errors;
    console.warn(
      `Demonstration TSX validation failed on attempt ${attempt}/${MAX_GENERATION_ATTEMPTS}.`,
      lastErrors,
    );
  }

  throw new Error(
    `Failed to generate valid Remotion TSX after ${MAX_GENERATION_ATTEMPTS} attempts: ${
      lastErrors.join("; ")
    }`,
  );
}

const svgGroundingSchema = z.object({
  queries: z.array(z.string()).describe(
    "SVG helper query strings (e.g. \"map?countries=es,pr&fidelity=low\"). Empty when no reference SVG would help.",
  ),
  explanation: z.string().describe(
    "Short reasoning for which references were chosen, or why none were needed.",
  ),
});

async function getGroundingSVGs(instruction: string): Promise<string[]> {
  try {
    const { output } = await generateText({
      model: "google/gemini-3.5-flash",
      reasoning: "low",
      output: Output.object({
        schema: svgGroundingSchema,
        name: "svg_grounding_selection",
        description: "Reference SVG queries that help ground the demonstration in accurate shapes.",
      }),
      system: SVG_GROUNDING_INSTRUCTIONS(HOW_TO_USE_SVG_HELPER),
      prompt: instruction,
    });

    const svgs = await Promise.all(
      output.queries.map(async (query) => {
        try {
          return await svg(query);
        } catch (error) {
          console.error(`Failed to resolve grounding SVG for "${query}".`, error);
          return null;
        }
      }),
    );

    const validSvgs = svgs.filter((markup): markup is string => Boolean(markup));
    return validSvgs;
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function createDemonstration(
  options: CreateDemonstrationOptions,
): Promise<DemonstrationOutput> {
  const { instruction } = options;
  const uniqueId = crypto.randomUUID();
  const outDir = `./output/${uniqueId}`;

  try {
    const groundingSVGs = await getGroundingSVGs(instruction);
    const tsx = await generateValidatedTsx(instruction, groundingSVGs);
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
        input: {
          tsxUrl,
          ...videoConfig,
        },
        options: {
          machine: DEMONSTRATION_RENDER_MACHINE,
        },
      },
    );

    const durationInSeconds = videoConfig.durationInFrames / videoConfig.fps;

    return createDemonstrationOutput(
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
  description: "Create a short motion-graphic visualization of one idea to teach the student visually. Shown alongside a written response, it carries the visual part of the explanation.",
  inputSchema: createDemonstrationInputSchema,
  outputSchema: demonstrationOutputSchema,
  execute: createDemonstration,
});

export type DemonstrationToolInvocation = UIToolInvocation<typeof demonstrationTool>;



/*

const start = performance.now();
const result = await createDemonstration({
  instruction:
    "Show the EUs expansion from inception to present day use blue to indicate the countries that joined. Use a map of european countries to show the expansion.",
});
const end = performance.now();
console.log(
  `Result(v6) (${REMOTION_FILE_GENERATOR_MODEL}):`,
  JSON.stringify(result, null, 2),
);
console.log(`Time taken: ${((end - start) / 1000).toFixed(2)} seconds`);


  Examples
  - Show how recursion works by visualizing the call stack for a factorial(3) calculation. First, show three stack frames piling up as the function calls itself down to the base case of factorial(1) = 1. Then, show the stack unwinding as values are returned back down the stack to compute the final result of 6.
  - Explain supply and demand curves by showing a graph with price on the vertical axis and quantity on the horizontal axis. Start with a downward-sloping demand curve and an upward-sloping supply curve, then highlight the equilibrium point where they intersect. Show what happens when demand increases by shifting the demand curve right, raising both equilibrium price and quantity.
  - Explain the offside rule in soccer by showing a simple field view with an attacker, defenders, the ball, and the goal. Pause at the moment the pass is made, draw a line through the second-to-last defender, and show that an attacker is offside if they are beyond that line and actively involved in the play. Contrast it with an onside example where the attacker stays level with or behind the defender when the pass is played.
  - Explain the three branches of government in the USA by showing three labeled pillars: Legislative, Executive, and Judicial. Show Congress making laws, the President enforcing laws, and the Supreme Court interpreting laws. Then animate arrows between the branches to show checks and balances, such as vetoes, judicial review, and congressional oversight.
  - Explain bell curve distributions by showing a normal distribution curve centered around the mean. Highlight that most values cluster near the center, fewer values appear toward the tails, and the curve is symmetric. Add bands for one, two, and three standard deviations to show how data becomes less common farther from the average.
  - Explain the multiple generations, long term effect on having an TFR(Total Fertility Rate) of 1.5 on total population by doing a graph showing how many children each generation will have.

  - Show the teritory held by Nazi Germany in the beginning of World War II and at the end.
  - Show the EUs expansion from inception to present day use blue to indicate the countries that joined.
  - Show the scandinavian countries on a map in the main color of their flag
  */



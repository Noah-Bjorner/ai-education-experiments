import "@std/dotenv/load";
import { generateText, tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";
import { SVG_MOTION_GENERATOR_INSTRUCTIONS } from "./PROMPT.ts";

const SVG_MOTION_GENERATOR_MODEL = "openai/gpt-5.6-sol";
const SVG_MOTION_GENERATOR_MODEL_REASONING = "medium";

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;

export const demonstrationOutputSchema = z.object({
  url: z.string().min(1).describe("URL of the generated SVG."),
  width: z.number().int().positive().describe("SVG width in pixels."),
  height: z.number().int().positive().describe("SVG height in pixels."),
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

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:svg|xml|html)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fenced) {
    return fenced[1].trim();
  }
  return trimmed;
}

export async function createDemonstration(
  options: CreateDemonstrationOptions,
): Promise<DemonstrationOutput> {
  const { instruction } = options;
  const uniqueId = crypto.randomUUID();

  const { text: rawSvg } = await generateText({
    model: SVG_MOTION_GENERATOR_MODEL,
    reasoning: SVG_MOTION_GENERATOR_MODEL_REASONING,
    system: SVG_MOTION_GENERATOR_INSTRUCTIONS(),
    prompt: instruction,
  });

  const svg = stripMarkdownFences(rawSvg);

  await Deno.mkdir("./output", { recursive: true });
  const url = `./output/motion-${uniqueId}.svg`;
  await Deno.writeTextFile(url, svg);

  return demonstrationOutputSchema.parse({
    url,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    instruction,
  });
}

export const demonstrationTool = tool({
  description:
    "Create a short motion-graphic visualization of one idea to teach the student visually. Shown alongside a written response, it carries the visual part of the explanation.",
  inputSchema: createDemonstrationInputSchema,
  outputSchema: demonstrationOutputSchema,
  execute: createDemonstration,
});

export type DemonstrationToolInvocation = UIToolInvocation<
  typeof demonstrationTool
>;


/*

const start = performance.now();
const result = await createDemonstration({
  instruction:
    "Explain the offside rule in soccer by showing a simple field view with an attacker, defenders, the ball, and the goal. Pause at the moment the pass is made, draw a line through the second-to-last defender, and show that an attacker is offside if they are beyond that line and actively involved in the play. Contrast it with an onside example where the attacker stays level with or behind the defender when the pass is played.",
});
const end = performance.now();
console.log(
  `Result (${SVG_MOTION_GENERATOR_MODEL}):`,
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

*/

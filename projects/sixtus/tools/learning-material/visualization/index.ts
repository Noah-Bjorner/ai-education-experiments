import { tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";
import { createDemonstration } from "./animation/index.ts";

export const visualizationTypeSchema = z.enum([
  "static",
  "animation",
  "interactive",
]);

export type VisualizationType = z.infer<typeof visualizationTypeSchema>;

export const visualizationOutputSchema = z.object({
  type: visualizationTypeSchema.describe("The type of visualization that was created."),
  url: z.string().min(1).describe("URL of the generated visualization."),
  width: z.number().int().positive().describe("Visualization width in pixels."),
  height: z.number().int().positive().describe("Visualization height in pixels."),
  instruction: z.string().min(1).describe("The instruction used to create the visualization."),
});

export type VisualizationOutput = z.infer<typeof visualizationOutputSchema>;

const createVisualizationInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("static"),
    instruction: z.string().min(1).describe(
      "A self-contained plan for the static image: what concept to show, what appears on screen, and how the elements are laid out and labeled.",
    ),
  }),
  z.object({
    type: z.literal("animation"),
    instruction: z.string().min(1).describe(
      "A self-contained plan for the animation: what concept to show, what appears on screen, and how the motion unfolds over time.",
    ),
  }),
  z.object({
    type: z.literal("interactive"),
    instruction: z.string().min(1).describe(
      "A self-contained plan for the interactive widget: what concept to show, what appears on screen, what the student can manipulate, and how the visualization responds.",
    ),
  }),
]);

export type CreateVisualizationOptions = z.infer<
  typeof createVisualizationInputSchema
>;

// TODO: implement static generation.
async function createStatic(
  _options: Extract<CreateVisualizationOptions, { type: "static" }>,
): Promise<VisualizationOutput> {
  throw new Error("Static visualization is not implemented yet.");
}

// TODO: implement interactive generation.
async function createInteractive(
  _options: Extract<CreateVisualizationOptions, { type: "interactive" }>,
): Promise<VisualizationOutput> {
  throw new Error("Interactive visualization is not implemented yet.");
}

async function createAnimation(
  options: Extract<CreateVisualizationOptions, { type: "animation" }>,
): Promise<VisualizationOutput> {
  const demonstration = await createDemonstration({
    instruction: options.instruction,
  });
  return { type: "animation", ...demonstration };
}

export async function createVisualization(
  options: CreateVisualizationOptions,
): Promise<VisualizationOutput> {
  switch (options.type) {
    case "static":
      return await createStatic(options);
    case "animation":
      return await createAnimation(options);
    case "interactive":
      return await createInteractive(options);
  }
}

export const visualizationTool = tool({
  description:
    "Create a visualization of one idea to teach the student visually. Shown alongside a written response, it carries the visual part of the explanation. Choose the type that best fits the concept: 'static' for structure or relationships, 'animation' for change over time and processes, 'interactive' for concepts best understood by manipulating parameters.",
  inputSchema: createVisualizationInputSchema,
  outputSchema: visualizationOutputSchema,
  execute: createVisualization,
});

export type VisualizationToolInvocation = UIToolInvocation<
  typeof visualizationTool
>;

import { z } from "@zod";
import { whiteboardChildren } from "./children/index.ts";

export const WHITEBOARD_DOMAINS = ["auto", "math", "data"] as const;
export const WHITEBOARD_MODES = ["smart", "fast"] as const;
export const WHITEBOARD_FORMATS = ["url", "svg"] as const;

export type WhiteboardDomain = typeof WHITEBOARD_DOMAINS[number];
export type WhiteboardMode = typeof WHITEBOARD_MODES[number];
export type WhiteboardFormat = typeof WHITEBOARD_FORMATS[number];

export const whiteboardInputSchema = z.object({
  goal: z.string().min(1).describe(
    "The educational or communication task the whiteboard should accomplish: what the audience should understand or take away. Include relevant audience context, supplied facts or data, and constraints so the goal is self-contained.",
  ),
  domain: z.enum(WHITEBOARD_DOMAINS).optional().describe(
    "Which visual language to use. auto infers from the goal. math covers equations, geometry, and coordinate plots. data covers charts of quantities.",
  ),
  mode: z.enum(WHITEBOARD_MODES).optional().describe(
    "Use smart for more careful spec generation, or fast for lower latency.",
  ),
  format: z.enum(WHITEBOARD_FORMATS).optional().describe(
    "How to return the whiteboard: a hosted URL, or the SVG source.",
  ),
});

export type WhiteboardInput = z.infer<typeof whiteboardInputSchema>;

const [firstChild, ...otherChildren] = whiteboardChildren;
// z.union emits anyOf. z.discriminatedUnion emits oneOf, which OpenAI
// response_format rejects on array items.
const whiteboardChildSchema = z.union([
  firstChild.schema,
  ...otherChildren.map((child) => child.schema),
]);

export const WhiteboardOutput = z.object({
  layout: z.enum(["single", "split", "stack"]).describe(
    "The arrangement that best serves the goal: single (one child), split (two side by side), stack (vertical).",
  ),
  children: z.array(whiteboardChildSchema).min(1).describe(
    "Visual elements chosen to accomplish the educational or communication goal. Use 1 child for single, 2 for split, 2 or more for stack.",
  ),
});

export type WhiteboardSpec = z.infer<typeof WhiteboardOutput>;

export const whiteboardRequestSchema = z.union([
  whiteboardInputSchema,
  WhiteboardOutput,
]);

export type WhiteboardRequest = z.infer<typeof whiteboardRequestSchema>;

export const whiteboardResultSchema = z.object({
  url: z.string().optional().describe(
    "Public URL of the rendered whiteboard. Present when format is url.",
  ),
  svg: z.string().optional().describe(
    "SVG source of the rendered whiteboard. Present when format is svg.",
  ),
});

export type WhiteboardResult = z.infer<typeof whiteboardResultSchema>;

import "@std/dotenv/load";
import {
  type WhiteboardFigureContent,
  type WhiteboardInput,
  whiteboardInputSchema,
  type WhiteboardMode,
  type WhiteboardRequest,
  type WhiteboardResult,
  whiteboardResultSchema,
  type WhiteboardSpec,
} from "./schema.ts";
import {
  generateText,
  NoObjectGeneratedError,
  Output,
  tool,
  type UIToolInvocation,
} from "@ai";
import { z } from "@zod";
import { cerebras } from "../../../../../lib/cerebras.ts";
import { whiteboardFigures } from "./figures/index.ts";
import {
  GOAL_PROMPT,
  INSTRUCTIONS_PROMPT,
  WHITEBOARD_PLANNER_PROMPT,
  whiteboardFigureSystemPrompt,
} from "./prompt-old.ts";
import { uploadImage } from "../../../../../lib/cloudflare.ts";
import { figureOptions } from "./render/index.ts";
import {
  contextualize,
  renderError,
  type RenderIssue,
} from "./render/issues.ts";
import {
  executeWhiteboardWith,
  generatePreparedBoard,
  generatePreparedFigure,
  type GenerationContext,
  InvalidGeneratedOutput,
  REPAIR_INSTRUCTIONS,
  type RepairRequest,
} from "./generation.ts";

export const WHITEBOARD_TOOL_DESCRIPTION =
  "Show the learner a whiteboard diagram. Use when a chart, graph, geometry diagram, or composed visual explanation would help them understand something.";

export const WHITEBOARD_SYSTEM_PROMPT_DESCRIPTION = [
  "Use when a composed diagram would help the learner understand a relationship, comparison, quantity, or math idea.",
  "Prefer whiteboard over image when the visual should be a chart, graph, geometry diagram, or math layout rather than a photo or illustration.",
  "Pass a self-contained goal describing what the audience should understand, including relevant audience context, supplied facts or data, and constraints.",
].join("\n");

export {
  WHITEBOARD_FORMATS,
  WHITEBOARD_MODES,
  WHITEBOARD_ORIENTATIONS,
  whiteboardInputSchema,
  whiteboardResultSchema,
} from "./schema.ts";

export type {
  WhiteboardFormat,
  WhiteboardInput,
  WhiteboardMode,
  WhiteboardOrientation,
  WhiteboardRequest,
  WhiteboardResult,
  WhiteboardSpec,
} from "./schema.ts";

const plannerFigureTypes = whiteboardFigures.map((figure) => figure.type) as [
  (typeof whiteboardFigures)[number]["type"],
  ...(typeof whiteboardFigures)[number]["type"][],
];

/** Only the decisions the model needs to generate. */
export const whiteboardPlannerOutputSchema = z.strictObject({
  title: z.string().trim().min(1).nullable(),
  figurePlans: z.array(z.strictObject({
    type: z.enum(plannerFigureTypes),
    instructions: z.string().trim().min(1).describe(
      "Self-contained construction task: what to draw, any shared values, units, and assumptions, and what the learner should notice.",
    ),
  })).min(1),
});

type PlannerOutput = z.infer<typeof whiteboardPlannerOutputSchema>;

function whiteboardGenerateTextOptions(mode?: WhiteboardMode) {
  if (mode === "fast") {
    return {
      model: cerebras("qwen-3.8-27b"),
      providerOptions: {
        cerebras: { reasoningEffort: "medium" as const },
      },
    };
  }
  return {
    model: "openai/gpt-5.6-sol",
    reasoning: "medium" as const,
  };
}

/** The returned plan includes deterministic IDs and default vertical placement. */
export type WhiteboardPlan = {
  title: PlannerOutput["title"];
  figurePlans: Array<
    PlannerOutput["figurePlans"][number] & {
      id: string;
      anchor: string | null;
      side: "bottom" | null;
    }
  >;
};

/** Generate one complete validated plan and log total duration and token usage. */
export async function generateWhiteboardPlan(
  goal: string,
  mode?: WhiteboardMode,
): Promise<WhiteboardPlan> {
  if (!goal.trim()) throw new Error("A whiteboard goal is required.");
  const startedAt = performance.now();
  //console.log("WHITEBOARD_PLANNER_PROMPT:", WHITEBOARD_PLANNER_PROMPT);
  //console.log("GOAL_PROMPT:", GOAL_PROMPT(goal));
  const { output, usage } = await generateText({
    ...whiteboardGenerateTextOptions(mode),
    system: WHITEBOARD_PLANNER_PROMPT,
    prompt: GOAL_PROMPT(goal),
    output: Output.object({
      schema: whiteboardPlannerOutputSchema,
      name: "whiteboard_plan",
      description: "Ordered figure construction tasks for a whiteboard.",
    }),
  });
  const plan: WhiteboardPlan = {
    ...output,
    figurePlans: output.figurePlans.map((figure, i) => ({
      ...figure,
      id: `figure-${i + 1}`,
      anchor: i === 0 ? null : `figure-${i}`,
      side: i === 0 ? null : "bottom",
    })),
  };
  console.log("Whiteboard planner:", {
    durationMs: Math.round(performance.now() - startedAt),
    usage,
  });
  return plan;
}

/** Raw SDK adapter. Preparation and the bounded repair policy live in generation.ts. */
async function generateFigureOutput(
  plan: WhiteboardPlan["figurePlans"][number],
  context: GenerationContext = {},
  repair?: RepairRequest,
): Promise<unknown> {
  const figure = whiteboardFigures.find((figure) => figure.type === plan.type);
  if (!figure) throw new Error(`Unknown whiteboard figure type: ${plan.type}`);
  const schema = figure.schema.safeExtend({ id: z.literal(plan.id) });
  const prompt = [
    INSTRUCTIONS_PROMPT(plan.instructions),
    context.goal ? `Original board goal:\n${context.goal}` : "",
    context.title ? `Board title: ${context.title}` : "",
    repair
      ? `${REPAIR_INSTRUCTIONS}\nPrevious output:\n${
        JSON.stringify(repair.previous)
      }\nRendering issues:\n${JSON.stringify(repair.issues)}`
      : "",
  ].filter(Boolean).join("\n\n");
  try {
    const { output } = await generateText({
      ...whiteboardGenerateTextOptions(context.mode),
      maxRetries: 0,
      system: whiteboardFigureSystemPrompt(figure),
      prompt,
      output: Output.object<WhiteboardFigureContent>({
        schema,
        name: `${figure.type}_spec`,
      }),
    });
    return output;
  } catch (cause) {
    if (
      NoObjectGeneratedError.isInstance(cause) &&
      typeof cause.text === "string" && cause.finishReason !== "content-filter"
    ) {
      let output: unknown = cause.text;
      try {
        output = JSON.parse(cause.text);
      } catch { /* Retain raw invalid JSON for correction. */ }
      const parsed = schema.safeParse(output);
      const error = parsed.success
        ? renderError(
          "INVALID_SPEC",
          "The generated figure could not be decoded as structured output.",
          { stage: "validation" },
        )
        : contextualize(parsed.error, { stage: "validation" });
      throw new InvalidGeneratedOutput(output, error.issues, cause);
    }
    throw cause;
  }
}

async function correctBoardTitle(
  title: string,
  context: GenerationContext,
  issues: RenderIssue[],
): Promise<unknown> {
  const { output } = await generateText({
    ...whiteboardGenerateTextOptions(context.mode),
    maxRetries: 0,
    system:
      "Rewrite the board title using Shantell-supported plain text while preserving its meaning. Return a nonempty title, never omit it. Do not change or regenerate any figures.",
    prompt: JSON.stringify({ title, goal: context.goal, issues }),
    output: Output.object({
      schema: z.object({ title: z.string().trim().min(1) }),
      name: "whiteboard_title_correction",
    }),
  });
  return output.title;
}

/** Generate and prepare one figure; at most one correction for known content failures. */
export async function generateWhiteboardFigureSpec(
  plan: WhiteboardPlan["figurePlans"][number],
  context: GenerationContext = {},
): Promise<WhiteboardSpec["figures"][number]> {
  return (await generatePreparedFigure(
    plan,
    context,
    generateFigureOutput,
    figureOptions({}, 0),
  )).spec;
}

/** Generate, prepare, and validate the complete board while preserving plan order. */
export async function generateWhiteboardSpec(
  plan: WhiteboardPlan,
  goal?: string,
  mode?: WhiteboardMode,
): Promise<WhiteboardSpec> {
  return (await generatePreparedBoard(plan, { goal, mode }, {
    generateFigure: generateFigureOutput,
    correctTitle: correctBoardTitle,
  })).spec;
}

/** Plan the board, build every figure in parallel, then merge and validate. */
export async function whiteboardSpec(
  input: WhiteboardInput,
): Promise<WhiteboardSpec> {
  const plan = await generateWhiteboardPlan(input.goal, input.mode);
  return await generateWhiteboardSpec(plan, input.goal, input.mode);
}

export { whiteboardSpec as whiteboard };

async function uploadWhiteboardSvg(svg: string): Promise<string> {
  const name = crypto.randomUUID();
  return await uploadImage(
    new Blob([svg], { type: "image/svg+xml" }),
    `${name}.svg`,
    { prefix: "sixtus/whiteboards", name },
  );
}

export const executeWhiteboard = async (
  input: WhiteboardRequest,
): Promise<WhiteboardResult> => {
  return await executeWhiteboardWith(input, {
    generatePlan: generateWhiteboardPlan,
    generateFigure: generateFigureOutput,
    correctTitle: correctBoardTitle,
    upload: uploadWhiteboardSvg,
  });
};

export const whiteboardTool = tool({
  description: WHITEBOARD_TOOL_DESCRIPTION,
  inputSchema: whiteboardInputSchema,
  outputSchema: whiteboardResultSchema,
  execute: (input) => executeWhiteboard(input),
});

export type WhiteboardToolInvocation = UIToolInvocation<typeof whiteboardTool>;

// Run: deno task dev projects/sixtus/tools/learning-material/whiteboard/index.ts "Your goal" [output-dir] [fast|smart]
if (import.meta.main) {
  const startedAt = performance.now();
  const goal = Deno.args[0] ??
    "A 7th grader bought movie tickets. Two tickets plus a $4 popcorn came to $22. Help them solve 2x + 4 = 22 for the price of one ticket, showing the algebra steps in order so they see why they subtract 4 first, then divide by 2. The ticket costs $9.";
  const outputDir = Deno.args[1] ?? "output/whiteboard-new";
  const modeArg = Deno.args[2];
  const mode: WhiteboardMode | undefined =
    modeArg === "fast" || modeArg === "smart" ? modeArg : undefined;
  await Deno.mkdir(outputDir, { recursive: true });
  const plan = await generateWhiteboardPlan(goal, mode);
  await Deno.writeTextFile(
    `${outputDir}/plan.json`,
    JSON.stringify(plan, null, 2),
  );
  const { spec, rendered: { svg } } = await generatePreparedBoard(plan, {
    goal,
    mode,
  }, {
    generateFigure: generateFigureOutput,
    correctTitle: correctBoardTitle,
  }, { orientation: "portrait" });
  await Deno.writeTextFile(
    `${outputDir}/spec.json`,
    JSON.stringify(spec, null, 2),
  );
  await Deno.writeTextFile(`${outputDir}/whiteboard.svg`, svg);
  console.log("Whiteboard saved:", {
    outputDir,
    figures: spec.figures.length,
    durationMs: Math.round(performance.now() - startedAt),
  });
}

import "@std/dotenv/load";
import {
  type WhiteboardFigureContent,
  WhiteboardOutput,
  type WhiteboardRequest,
  type WhiteboardResult,
  type WhiteboardSpec,
} from "./schema.ts";
import { generateText, Output } from "@ai";
import { z } from "@zod";
import { cerebras } from "../../../../../lib/cerebras.ts";
import { whiteboardFigures } from "./figures/index.ts";
import {
  GOAL_PROMPT,
  WHITEBOARD_PLANNER_PROMPT,
  whiteboardFigureSystemPrompt,
} from "./prompt-new.ts";

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
): Promise<WhiteboardPlan> {
  if (!goal.trim()) throw new Error("A whiteboard goal is required.");
  console.log("WHITEBOARD_PLANNER_PROMPT:", WHITEBOARD_PLANNER_PROMPT);
  const startedAt = performance.now();
  const { output, usage } = await generateText({
    model: cerebras("qwen-3.8-27b"),
    providerOptions: {
      cerebras: { reasoningEffort: "medium" },
    },
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

/** Generate one figure using only its type's schema, instructions, and example. */
export async function generateWhiteboardFigureSpec(
  plan: WhiteboardPlan["figurePlans"][number],
  context: { goal?: string; title?: string | null } = {},
): Promise<WhiteboardSpec["figures"][number]> {
  const figure = whiteboardFigures.find((figure) => figure.type === plan.type);
  if (!figure) throw new Error(`Unknown whiteboard figure type: ${plan.type}`);

  const system = whiteboardFigureSystemPrompt(figure);

  const { output } = await generateText({
    model: cerebras("qwen-3.8-27b"),
    providerOptions: {
      cerebras: { reasoningEffort: "medium" },
    },
    system,
    prompt: JSON.stringify({
      boardTitle: context.title ?? null,
      figureId: plan.id,
      instructions: plan.instructions,
    }),
    output: Output.object<WhiteboardFigureContent>({
      schema: figure.schema.safeExtend({ id: z.literal(plan.id) }),
      name: `${figure.type}_spec`,
    }),
  });

  return { ...output, id: plan.id, anchor: plan.anchor, side: plan.side };
}

/** Generate figures concurrently, keeping plan order and validating the board. */
export async function generateWhiteboardSpec(
  plan: WhiteboardPlan,
  goal?: string,
): Promise<WhiteboardSpec> {
  const figures = await Promise.all(
    plan.figurePlans.map((figurePlan) =>
      generateWhiteboardFigureSpec(figurePlan, { goal, title: plan.title })
    ),
  );
  return WhiteboardOutput.parse({ title: plan.title, figures });
}



export const executeWhiteboard = async (
  input: WhiteboardRequest,
): Promise<WhiteboardResult> => {
  //const spec_plan = await generateWhiteboardPlan(input.goal);
  // generate figures figurePlans
  return { url: "https://example.com" };
};





if (import.meta.main) {
    const plan = await generateWhiteboardPlan(
      "A 7th grader bought movie tickets. Two tickets plus a $4 popcorn came to $22. Help them solve 2x + 4 = 22 for the price of one ticket, showing the algebra steps in order so they see why they subtract 4 first, then divide by 2. The ticket costs $9.",
    );
    console.log(plan);
  }



/*
if (import.meta.main) {
    const startedAt = performance.now();
    const sepc = await generateWhiteboardFigureSpec({
        type: "math_expressions",
        instructions: `Show the step-by-step solution of 2x + 4 = 22 for x, one line at a time, in this order:
1) 2x + 4 = 22
2) 2x + 4 − 4 = 22 − 4   (note: subtract 4 from both sides to isolate the term with x)
3) 2x = 18
4) 2x / 2 = 18 / 2   (note: divide both sides by 2 to isolate x)
5) x = 9
Keep the sequence vertical so the learner sees that removing the 4 must come before dividing, because only then is x alone on its side.`,
        id: "figure-1",
        anchor: null,
        side: null,
    });
    console.log(sepc);
    console.log("Duration:", Math.round(performance.now() - startedAt), "ms");
  }

  */
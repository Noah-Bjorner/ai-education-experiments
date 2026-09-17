import { z } from "@zod";
import {
  keepTypesafeWarm,
  noul,
  typesafe,
} from "../../../../../lib/typesafe.ts";
import { whiteboardFigures } from "./figures/index.ts";
import { WhiteboardSpecError } from "./spec/validation.ts";

export type FigureType = typeof whiteboardFigures[number]["type"];
export type FigureNeedKey = `needs_${FigureType}`;
export type WhiteboardGoalClassification = {
  needs_board_title: number;
} & Record<FigureNeedKey, number>;
export type FigureSelection = {
  availableFigures: Array<(typeof whiteboardFigures)[number]>;
  showTitle: boolean;
};

export const SELECTION_THRESHOLD = 0.6;
export const TITLE_THRESHOLD = 0.7;

const probability = z.number().min(0).max(1);
export const classificationSchema = z.object({
  needs_board_title: probability,
  ...Object.fromEntries(whiteboardFigures.map((figure) => [
    `needs_${figure.type}`,
    probability,
  ])) as Record<FigureNeedKey, typeof probability>,
}) as z.ZodType<WhiteboardGoalClassification>;

export function parseClassification(
  classification: unknown,
): WhiteboardGoalClassification {
  return classificationSchema.parse(classification);
}

export function selectFigures(
  classification: WhiteboardGoalClassification,
): FigureSelection {
  const selected = whiteboardFigures.filter((figure) =>
    classification[`needs_${figure.type}`] > SELECTION_THRESHOLD
  );
  if (!selected.length) {
    throw new WhiteboardSpecError([{
      code: "NO_FIGURE_MATCH",
      path: [],
      message:
        `No figure type scored above ${SELECTION_THRESHOLD} for this goal.`,
    }]);
  }
  return {
    availableFigures: selected,
    showTitle: classification.needs_board_title > TITLE_THRESHOLD,
  };
}

export async function classifyWhiteboardGoal(
  goal: string,
): Promise<WhiteboardGoalClassification> {
  // Idempotent: the first board in this process starts the TypeSafe keepalive so
  // later boards reuse a warm socket. Processes that never draw a board never ping.
  keepTypesafeWarm();
  const questions = Object.fromEntries(whiteboardFigures.map((figure) => [
    `needs_${figure.type}`,
    noul(figure.need.question, figure.need.criteria),
  ])) as Record<FigureNeedKey, ReturnType<typeof noul>>;
  const { answers } = await typesafe().systemOne({
    state: { goal },
    questions: {
      needs_board_title: noul(
        "Does this goal need a short title above the figures?",
        {
          true:
            "The board would include more than one figure (a chart, diagram, or block of math or text), and a title would name a shared topic or relationship that those figures' own labels and content would not already make clear.",
          false:
            "Default no. A single figure, labels that already identify the content, or a step-by-step walkthrough that is itself the topic, do not need a title. If unsure, no.",
        },
      ),
      ...questions,
    },
  }, { retry: { maxRetries: 1 } });
  return parseClassification(Object.fromEntries([
    ["needs_board_title", answers.needs_board_title?.noul],
    ...whiteboardFigures.map((figure) => {
      const key = `needs_${figure.type}` as FigureNeedKey;
      return [key, answers[key]?.noul];
    }),
  ]));
}

if (import.meta.main) {
  const startTime = Date.now();
  const classification = await classifyWhiteboardGoal("A 6th grader ran a weekend lemonade stand and wants to see which flavor sold best. Saturday they sold 14 classic, 9 strawberry, and 5 mint. Sunday they sold 11 classic, 16 strawberry, and 4 mint. Help them compare the flavors and notice that strawberry overtook classic on Sunday.");
  const endTime = Date.now();
  console.log(classification);
  console.log(`Time taken: ${endTime - startTime}ms`);
}

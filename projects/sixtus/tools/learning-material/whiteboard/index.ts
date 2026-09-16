import { noul, typesafe } from "../../../../../lib/typesafe.ts";
import { whiteboardFigures } from "./figures/index.ts";
import { generateText, Output } from "@ai";
import { WHITEBOARD_SPEC_SYSTEM_PROMPT, WHITEBOARD_SPEC_USER_PROMPT } from "./prompt.ts";
import {
  type WhiteboardInput,
  type WhiteboardMode,
  WhiteboardOutput,
  type WhiteboardResult,
  type WhiteboardSpec,
} from "./schema.ts";
import { uploadImage } from "../../../../../lib/cloudflare.ts";
import { renderWhiteboardSvg } from "./render/index.ts";
import { cerebras } from "../../../../../lib/cerebras.ts";

export type FigureType = typeof whiteboardFigures[number]["type"];
export type FigureNeedKey = `needs_${FigureType}`;


export type WhiteboardGoalClassification = {
  needs_board_title: number;
} & { [K in FigureNeedKey]: number };

const figureNeedQuestions = Object.fromEntries(
  whiteboardFigures.map((figure) => [
    `needs_${figure.type}`,
    noul(figure.need.question, figure.need.criteria),
  ]),
) as { [K in FigureNeedKey]: ReturnType<typeof noul> };

export const classifyWhiteboardGoal = async (
  goal: string,
): Promise<WhiteboardGoalClassification> => {
  const { answers } = await typesafe.systemOne({
    state: { goal },
    questions: {
      needs_board_title: noul(
        "Should this whiteboard have a short board heading above the figures?",
        {
          true:
            "A heading would name a shared topic or relationship that the figures' own content would not already make clear, or the board must stand alone without surrounding text or narration.",
          false:
            "Omit it. Default is no title. One figure, labels that already identify the content, a walkthrough whose steps are the topic, or a board shown next to tutor/narration text are not enough. If unsure, no.",
        },
      ),
      ...figureNeedQuestions,
    },
  });

  const needs = Object.fromEntries(
    whiteboardFigures.map((figure) => {
      const key = `needs_${figure.type}` as FigureNeedKey;
      return [key, answers[key].noul];
    }),
  ) as { [K in FigureNeedKey]: number };

  return {
    needs_board_title: answers.needs_board_title.noul,
    ...needs,
  };
};

/*
if (import.meta.main) {
  const startTime = performance.now();
  const answers = await classifyWhiteboardGoal(
    "A painter's ladder sits 8 ft from a wall and reaches 15 ft up. Help a geometry student use a^2 + b^2 = c^2 to find the ladder length, showing 8^2 + 15^2 = c^2, 64 + 225 = 289, and c = 17 ft.",
  );
  console.log(answers);
  const endTime = performance.now();
  console.log(`Time taken: ${endTime - startTime} milliseconds`);
}
*/



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

const figureThreshold = 0.6;

export const whiteboardSpec = async (
  input: WhiteboardInput,
  classification: WhiteboardGoalClassification,
  mode?: WhiteboardMode
): Promise<WhiteboardSpec> => {
  const { goal } = input;
  const availableFigures = whiteboardFigures.filter(
    (figure) => classification[`needs_${figure.type}`] > figureThreshold,
  );

  const system = WHITEBOARD_SPEC_SYSTEM_PROMPT({ availableFigures });
  console.log("system: ", system);
  const prompt = WHITEBOARD_SPEC_USER_PROMPT({ goal, showTitle: classification.needs_board_title > 0 });
  console.log("\n\n\nprompt: ", prompt);

  try {
    const { output, finishReason, text, toolCalls, usage } = await generateText({
      ...whiteboardGenerateTextOptions(mode),
      system,
      prompt,
      output: Output.object({
        schema: WhiteboardOutput,
        name: "whiteboard_spec",
        description:
          "Anchored figure visualization specs that accomplish the whiteboard's educational or communication goal.",
      }),
    });

    console.log({
      finishReason,
      text,
      toolCalls,
      usage,
    });
    
    if (!output) {
      throw new Error(
        "Whiteboard spec generation produced no structured output.",
      );
    }

    return output;
  } catch (error) {
    console.log("error: ", error);
    throw error;
  }
};


async function uploadWhiteboardSvg(svg: string): Promise<string> {
  const name = crypto.randomUUID();
  return await uploadImage(
    new Blob([svg], { type: "image/svg+xml" }),
    `${name}.svg`,
    { prefix: "whiteboard-svg", name },
  );
}

export const executeWhiteboard = async (
  input: WhiteboardInput,
): Promise<WhiteboardResult> => {
  const startTime = performance.now();
  const { goal, mode } = input;
  const classification = await classifyWhiteboardGoal(goal);
  console.log("classification: ", classification);
  const classificationTime = performance.now();
  console.log(`Classification time: ${classificationTime - startTime} milliseconds`);

  const availableFigureTypes = whiteboardFigures.filter(
    (figure) => classification[`needs_${figure.type}`] > figureThreshold,
  );
  if (availableFigureTypes.length === 0) {
    throw new Error("No available figures found for the goal.");
  }

  const spec = await whiteboardSpec({ goal, mode }, classification, mode);
  console.log("spec: ", spec);
  const specTime = performance.now();
  console.log(`Spec time: ${specTime - classificationTime} milliseconds`);
  
  /*
  const { svg } = renderWhiteboardSvg(spec, {
    orientation: input.orientation ?? "portrait",
  });
  if ("format" in input && input.format === "svg") {
    return { svg };
  }
  const url = await uploadWhiteboardSvg(svg);
  return { url };
  */
  return { url: "https://example.com/whiteboard.svg" };
};



if (import.meta.main) {
  const startTime = performance.now();
  const answers = await executeWhiteboard(
    { 
      goal: "Draw 2(x + 3) = 10",
      mode: "fast",
      orientation: "portrait",
      format: "url",
    }
  );
  console.log(answers);
  const endTime = performance.now();
  console.log(`Time taken: ${endTime - startTime} milliseconds`);
}
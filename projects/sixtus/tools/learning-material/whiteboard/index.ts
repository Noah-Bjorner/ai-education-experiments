import { z } from "@zod";
import {
  classifyWhiteboardGoal,
  type FigureSelection,
  parseClassification,
  selectFigures,
  type WhiteboardGoalClassification,
} from "./classifier.ts";
import { generateWhiteboardSpec, type SpecDependencies } from "./spec/index.ts";
import {
  schemaIssues,
  validateWhiteboardInput,
  WhiteboardSpecError,
} from "./spec/validation.ts";
import {
  type WhiteboardInput,
  whiteboardRenderRequestSchema,
  type WhiteboardRequest,
  type WhiteboardResult,
  type WhiteboardSpec,
} from "./schema.ts";
import {
  applyDrawingAnimation,
  type DrawingAnimationOptions,
} from "./animation/index.ts";

export { whiteboardInputSchema, whiteboardResultSchema } from "./schema.ts";
export { applyDrawingAnimation, type DrawingAnimationOptions };
export const WHITEBOARD_SYSTEM_PROMPT_DESCRIPTION = [
  "Use when a composed diagram would help the learner understand a relationship, comparison, quantity, or math idea.",
  "Prefer whiteboard over image when the visual should be a chart, graph, geometry diagram, or math layout rather than a photo or illustration.",
  "Pass a self-contained goal describing what the audience should understand, including relevant audience context, supplied facts or data, and constraints.",
].join("\n");

export { classifyWhiteboardGoal, selectFigures } from "./classifier.ts";
export { generateWhiteboardSpec } from "./spec/index.ts";
export { WhiteboardSpecError } from "./spec/validation.ts";
export type {
  FigureNeedKey,
  FigureSelection,
  FigureType,
  WhiteboardGoalClassification,
} from "./classifier.ts";

export type WhiteboardDependencies = SpecDependencies & {
  classify: (goal: string) => Promise<WhiteboardGoalClassification>;
};

/** Convenience entry point for classifier → spec. Rendering is a separate stage. */
export function whiteboardSpec(
  input: WhiteboardInput,
): Promise<WhiteboardSpec> {
  return whiteboardSpecWith(input, {
    classify: classifyWhiteboardGoal,
    generate: async (request) =>
      (await import("./spec/provider.ts")).generateSpecOutput(request),
    report: (event) => console.info("Whiteboard spec:", event),
  });
}

/** Injectable pipeline for offline tests and evaluation. */
export async function whiteboardSpecWith(
  input: WhiteboardInput,
  dependencies: WhiteboardDependencies,
): Promise<WhiteboardSpec> {
  input = validateWhiteboardInput(input);

  // 1. Classifier: choose the available figure types and board-title policy.
  const startedAt = performance.now();
  let selection: FigureSelection;
  try {
    const raw = await dependencies.classify(input.goal);
    let classification: WhiteboardGoalClassification;
    try {
      classification = parseClassification(raw);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new WhiteboardSpecError(
          schemaIssues(error, raw, [], "INVALID_CLASSIFICATION"),
        );
      }
      throw error;
    }
    selection = selectFigures(classification);
    dependencies.report?.({
      stage: "classification",
      outcome: "success",
      durationMs: performance.now() - startedAt,
      selectedTypes: selection.availableFigures.map((figure) => figure.type),
    });
  } catch (error) {
    dependencies.report?.({
      stage: "classification",
      outcome: "failure",
      durationMs: performance.now() - startedAt,
    });
    throw error;
  }

  // 2. Spec: generate and validate the complete board, then add placement links.
  return generateWhiteboardSpec(input, selection, dependencies);
}

export type WhiteboardExecutionDependencies = {
  generateSpec: (input: WhiteboardInput) => Promise<WhiteboardSpec>;
  upload: (svg: string) => Promise<string>;
};

/** Full pipeline: classifier → spec → render → requested output. */
export function executeWhiteboard(
  input: WhiteboardRequest,
): Promise<WhiteboardResult> {
  return executeWhiteboardWith(input, {
    generateSpec: whiteboardSpec,
    upload: async (svg) =>
      (await import("./render/upload.ts")).uploadWhiteboardSvg(svg),
  });
}

/** Saved specs skip the models. Upload runs only after successful rendering. */
export async function executeWhiteboardWith(
  input: WhiteboardRequest,
  dependencies: WhiteboardExecutionDependencies,
): Promise<WhiteboardResult> {
  let spec: WhiteboardSpec;
  let orientation: WhiteboardInput["orientation"];
  let fontMode: WhiteboardInput["fontMode"];
  let format: WhiteboardInput["format"];
  let animation: WhiteboardInput["animation"];
  if ("goal" in input) {
    const request = validateWhiteboardInput(input);
    spec = await dependencies.generateSpec(request);
    orientation = request.orientation ?? "portrait";
    format = request.format;
    fontMode = request.fontMode;
    animation = request.animation;
  } else {
    // Keep presentation options outside the strict board-content schema.
    const request = whiteboardRenderRequestSchema.parse(input);
    ({ format, orientation, fontMode, animation } = request);
    spec = { title: request.title, figures: request.figures };
  }

  // 3. Render: the same renderer serves generated and supplied specs.
  const { renderWhiteboardSvg } = await import("./render/index.ts");
  const { svg: rendered } = renderWhiteboardSvg(spec, {
    orientation,
    fontMode,
  });
  // 4. Optional handwriting animation is a last-step rewrite of the finished SVG.
  const svg = animation === "animated"
    ? applyDrawingAnimation(rendered, {
      speed: 1.25,
      markSpeed: 1.15,
      textSpeed: 1.0,
      figureSpeeds: {
        text: { textSpeed: 1.75, markSpeed: 2.0 },
      },
    })
    : rendered;
  //console.log(svg); // temporary
  if (format === "svg") return { svg };
  return { url: await dependencies.upload(svg) };
}

if (import.meta.main) {
  const result = await executeWhiteboard({
    goal: Deno.args[0] ??
      "A middle-schooler is confused about why their phone is dead by last period. Help them see battery percent falling through the school day: 7:00 100%, 9:00 82%, 12:00 61%, 14:00 44%, 16:00 18%. They should notice the drop speeds up after lunch. Circle the 16:00 point and add a callout that they are below 20% by the end of the day.",
    mode: Deno.args[1] === "smart" ? "smart" : "fast",
    format: Deno.args[2] === "svg" ? "svg" : "url",
    fontMode: "hosted",
  });
  console.log(JSON.stringify(result, null, 2));
}

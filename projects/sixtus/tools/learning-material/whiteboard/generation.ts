import type { WhiteboardPlan } from "./index.ts";
import { type WhiteboardFigureContent, type WhiteboardInput, WhiteboardOutput, type WhiteboardRequest, type WhiteboardResult, type WhiteboardSpec } from "./schema.ts";
import { composeWhiteboard, figureOptions, renderWhiteboardSvg, type WhiteboardRenderOptions, type WhiteboardRenderResult } from "./render/index.ts";
import { prepareFigure, type PreparedFigure } from "./render/prepare.ts";
import { contextualize, type RenderIssue, renderError, WhiteboardRenderError } from "./render/issues.ts";

export type RepairRequest = { previous: unknown; issues: RenderIssue[] };
export type GenerationContext = { goal?: string; title?: string | null; mode?: WhiteboardInput["mode"] };
export type FigureGenerator = (plan: WhiteboardPlan["figurePlans"][number], context: GenerationContext, repair?: RepairRequest) => Promise<unknown>;
export type TitleCorrector = (title: string, context: GenerationContext, issues: RenderIssue[]) => Promise<unknown>;

/** The SDK adapter retains invalid output without leaking provider details into diagnostics. */
export class InvalidGeneratedOutput extends WhiteboardRenderError {
  constructor(readonly output: unknown, issues: RenderIssue[], cause?: unknown) {
    super(issues, { cause });
  }
}

export const REPAIR_INSTRUCTIONS = "Correct only the reported problems in the supplied output. Return the complete corrected object. Preserve supplied facts, values, mathematical meaning, figure type, explanatory messages, annotations, and unaffected content/IDs. Do not omit content to make rendering succeed. Use only Shantell-supported notation; never delete a mathematical symbol or replace it with a different meaning. Figure ID and board placement are fixed by the application.";

function report(figureId: string | undefined, type: string, started: number, repairs: number, issues: RenderIssue[], outcome: "success" | "failure") {
  console.log("Whiteboard preparation:", { figureId, type, durationMs: Math.round(performance.now() - started), repairCount: repairs, outcome, issues: issues.map(({ code, stage, elementId, annotationIndex, severity }) => ({ code, stage, elementId, annotationIndex, severity })) });
}

export async function generatePreparedFigure(
  plan: WhiteboardPlan["figurePlans"][number], context: GenerationContext,
  generate: FigureGenerator, options: Parameters<typeof prepareFigure>[1],
): Promise<{ spec: WhiteboardSpec["figures"][number]; prepared: PreparedFigure }> {
  const started = performance.now();
  let repair: RepairRequest | undefined;
  const history: RenderIssue[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let output: unknown;
    try {
      output = await generate(plan, context, repair);
      if (!output || typeof output !== "object" || Array.isArray(output)) throw renderError("INVALID_SPEC", "Expected a figure object.", { stage: "validation" });
      // Strip placement only: the existing generation entry point also returns placed figures.
      const { anchor: _anchor, side: _side, ...content } = output as Record<string, unknown>;
      if (content.type !== plan.type || content.id !== plan.id) throw renderError("INVALID_SPEC", `The figure must have type '${plan.type}' and id '${plan.id}'.`, { stage: "validation" });
      const result = prepareFigure(content as WhiteboardFigureContent, options);
      if (!result.ok) throw result.error;
      // Use the validated source: composition verifies that cached drawings match it.
      const validated = JSON.parse(result.figure.source) as WhiteboardFigureContent;
      const spec = { ...validated, id: plan.id, anchor: plan.anchor, side: plan.side };
      report(plan.id, plan.type, started, attempt, [...history, ...result.figure.diagnostics], "success");
      return { spec, prepared: result.figure };
    } catch (cause) {
      if (cause instanceof InvalidGeneratedOutput) output = cause.output;
      const error = contextualize(cause, { figureId: plan.id });
      history.push(...error.issues);
      if (attempt === 1 || !error.repairable) {
        report(plan.id, plan.type, started, attempt, history, "failure");
        throw error;
      }
      repair = { previous: output, issues: error.issues };
    }
  }
  throw new Error("Unreachable figure repair state.");
}

export type GeneratedBoard = { spec: WhiteboardSpec; prepared: PreparedFigure[]; rendered: WhiteboardRenderResult };

export async function generatePreparedBoard(
  plan: WhiteboardPlan, context: GenerationContext,
  dependencies: { generateFigure: FigureGenerator; correctTitle: TitleCorrector },
  options: WhiteboardRenderOptions = {},
): Promise<GeneratedBoard> {
  const results = await Promise.allSettled(plan.figurePlans.map((figure, i) =>
    generatePreparedFigure(figure, { ...context, title: plan.title }, dependencies.generateFigure, figureOptions(options, i))
  ));
  const failures = results.flatMap((result) => result.status === "rejected" ? [contextualize(result.reason, {})] : []);
  if (failures.length) throw new WhiteboardRenderError(failures.flatMap((error) => error.issues), { cause: new AggregateError(failures) });
  const successful = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  let spec: WhiteboardSpec;
  try { spec = WhiteboardOutput.parse({ title: plan.title, figures: successful.map((result) => result.spec) }); }
  catch (error) { throw contextualize(error, { stage: "validation" }); }
  const prepared = successful.map((result) => result.prepared);
  try { return { spec, prepared, rendered: composeWhiteboard(spec, prepared, options) }; }
  catch (cause) {
    const error = contextualize(cause, {});
    if (!error.repairable || spec.title === null || !error.issues.every((issue) => issue.stage === "title")) throw error;
    const started = performance.now();
    try {
      const corrected = await dependencies.correctTitle(spec.title, context, error.issues);
      if (typeof corrected !== "string" || !corrected.trim()) throw renderError("INVALID_SPEC", "The corrected board title must be nonempty text.", { stage: "title", path: ["title"] });
      spec = { ...spec, title: corrected };
      const rendered = composeWhiteboard(spec, prepared, options);
      report(undefined, "board-title", started, 1, error.issues, "success");
      return { spec, prepared, rendered };
    } catch (cause) {
      const finalError = contextualize(cause, { stage: "title" });
      report(undefined, "board-title", started, 1, finalError.issues, "failure");
      throw finalError;
    }
  }
}

/** Dependency injection keeps tests offline and ensures upload happens only after complete rendering. */
export async function executeWhiteboardWith(
  input: WhiteboardRequest,
  dependencies: {
    generatePlan: (goal: string, mode?: WhiteboardInput["mode"]) => Promise<WhiteboardPlan>;
    generateFigure: FigureGenerator;
    correctTitle: TitleCorrector;
    upload: (svg: string) => Promise<string>;
  },
): Promise<WhiteboardResult> {
  let rendered: WhiteboardRenderResult;
  if ("goal" in input) {
    const plan = await dependencies.generatePlan(input.goal, input.mode);
    ({ rendered } = await generatePreparedBoard(plan, { goal: input.goal, mode: input.mode }, dependencies, { orientation: input.orientation ?? "portrait" }));
  } else {
    try { rendered = renderWhiteboardSvg(input); }
    catch (error) { throw contextualize(error, {}); }
  }
  if ("format" in input && input.format === "svg") return { svg: rendered.svg };
  return { url: await dependencies.upload(rendered.svg) };
}

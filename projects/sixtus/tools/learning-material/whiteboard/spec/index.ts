import { type FigureSelection } from "../classifier.ts";
import { assertRepairPreservesContent } from "./repair.ts";
import { z } from "@zod";
import { type WhiteboardInput, type WhiteboardSpec } from "../schema.ts";
import {
  createGeneratedBoardSchema,
  type FigureDefinition,
  type GeneratedBoard,
} from "./schema.ts";
import {
  type SpecIssue,
  validateGeneratedBoard,
  validateWhiteboardInput,
  WhiteboardSpecError,
} from "./validation.ts";

export type SpecRepair = { previous: unknown; issues: SpecIssue[] };
export type SpecGenerationRequest = {
  input: WhiteboardInput;
  availableFigures: readonly FigureDefinition[];
  showTitle: boolean;
  schema: z.ZodType<GeneratedBoard>;
  repair?: SpecRepair;
};
export type SpecGenerationResult = { output: unknown; usage?: unknown };
export type SpecGenerationEvent = {
  stage: "classification" | "generation";
  outcome: "success" | "invalid" | "failure";
  durationMs: number;
  attempt?: number;
  selectedTypes?: string[];
  usage?: unknown;
  issues?: Pick<SpecIssue, "code" | "path">[];
};
export type SpecDependencies = {
  generate: (request: SpecGenerationRequest) => Promise<SpecGenerationResult>;
  report?: (event: SpecGenerationEvent) => void;
};

/** Explicit adapter signal: only structured-output failures are eligible for correction. */
export class InvalidSpecOutput extends Error {
  constructor(
    readonly output: unknown,
    readonly usage?: unknown,
    options?: ErrorOptions,
  ) {
    super("The provider could not decode the generated board.", options);
    this.name = "InvalidSpecOutput";
  }
}

/** Spec stage: generate one complete board, validate, correct once if needed, and add placement. */
export async function generateWhiteboardSpec(
  input: WhiteboardInput,
  selection: FigureSelection,
  dependencies: SpecDependencies = {
    generate: async (request) =>
      (await import("./provider.ts")).generateSpecOutput(request),
  },
): Promise<WhiteboardSpec> {
  input = validateWhiteboardInput(input);
  const { availableFigures, showTitle } = selection;
  const schema = createGeneratedBoardSchema(availableFigures, showTitle);
  let repair: SpecRepair | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const startedAt = performance.now();
    let output: unknown, usage: unknown;
    try {
      let decodingFailed = false;
      try {
        ({ output, usage } = await dependencies.generate({
          input,
          availableFigures,
          showTitle,
          schema,
          repair,
        }));
      } catch (error) {
        if (!(error instanceof InvalidSpecOutput)) throw error;
        output = error.output;
        usage = error.usage;
        decodingFailed = true;
      }
      if (decodingFailed && typeof output === "string") {
        try {
          output = JSON.parse(output);
        } catch {
          throw new WhiteboardSpecError([{
            code: "INVALID_SPEC",
            path: [],
            message: "Return one complete, valid JSON object.",
          }]);
        }
      }
      const { content, spec } = validateGeneratedBoard(
        output,
        availableFigures,
        showTitle,
      );
      if (decodingFailed) {
        // A valid JSON body does not override a failed provider completion (e.g. truncation).
        throw new WhiteboardSpecError([{
          code: "INVALID_SPEC",
          path: [],
          message:
            "The structured completion failed; return the complete board object.",
        }]);
      }
      if (repair) assertRepairPreservesContent(repair, content);
      dependencies.report?.({
        stage: "generation",
        outcome: "success",
        durationMs: performance.now() - startedAt,
        attempt,
        usage,
      });
      return spec;
    } catch (error) {
      dependencies.report?.({
        stage: "generation",
        outcome: error instanceof WhiteboardSpecError ? "invalid" : "failure",
        durationMs: performance.now() - startedAt,
        attempt,
        usage,
        issues: error instanceof WhiteboardSpecError
          ? error.issues.map(({ code, path }) => ({ code, path }))
          : undefined,
      });
      if (!(error instanceof WhiteboardSpecError) || attempt === 1) throw error;
      repair = { previous: output, issues: error.issues };
    }
  }
  throw new Error("Unreachable spec generation state.");
}

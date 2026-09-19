import { z } from "@zod";

export type RenderStage =
  | "validation"
  | "base"
  | "annotations"
  | "callouts"
  | "composition"
  | "title";
export type RenderIssue = {
  code:
    | "INVALID_SPEC"
    | "INVALID_OPTIONS"
    | "INVALID_GEOMETRY"
    | "UNSUPPORTED_GLYPH"
    | "INVALID_LATEX"
    | "CONTENT_DOES_NOT_FIT"
    | "UNKNOWN_TARGET"
    | "INVALID_ANNOTATION"
    | "DUPLICATE_TARGET"
    | "CALLOUT_UNPLACEABLE"
    | "LAYOUT_OVERLAP"
    | "INTERNAL_RENDER_ERROR";
  stage: RenderStage;
  figureId?: string;
  elementId?: string;
  annotationIndex?: number;
  path: (string | number)[];
  message: string;
  availableTargetIds?: string[];
  severity: "error" | "warning";
  /**
   * For CONTENT_DOES_NOT_FIT: the allocation that would let this content fit
   * at the shared type scale. Exact dimensions when the renderer can compute
   * them; "grow" when it can only tell that more room is needed. Preparation
   * retries with a larger allocation up to the ceiling before failing.
   */
  required?: RequiredAllocation;
};
export type RequiredAllocation = { width?: number; height?: number } | "grow";
export type IssueContext = Partial<
  Pick<
    RenderIssue,
    | "stage"
    | "figureId"
    | "elementId"
    | "annotationIndex"
    | "path"
    | "availableTargetIds"
    | "required"
  >
>;

/** Expected content failures are distinguishable from programming/provider errors. */
export class WhiteboardRenderError extends Error {
  readonly issues: RenderIssue[];
  constructor(issues: RenderIssue[], options?: ErrorOptions) {
    super(issues.map((issue) => issue.message).join("\n"), options);
    this.name = "WhiteboardRenderError";
    this.issues = issues;
  }
  get repairable(): boolean {
    return this.issues.length > 0 &&
      this.issues.every((issue) =>
        issue.code !== "INTERNAL_RENDER_ERROR" &&
        issue.code !== "INVALID_OPTIONS"
      );
  }
}

export function renderError(
  code: RenderIssue["code"],
  message: string,
  context: IssueContext = {},
  cause?: unknown,
): WhiteboardRenderError {
  return new WhiteboardRenderError([{
    code,
    stage: "base",
    path: [],
    severity: "error",
    ...context,
    message,
  }], cause === undefined ? undefined : { cause });
}

/** Attach location without losing the original error or classifying unknown exceptions as content. */
export function contextualize(
  error: unknown,
  context: IssueContext,
): WhiteboardRenderError {
  if (error instanceof WhiteboardRenderError) {
    return new WhiteboardRenderError(
      error.issues.map((issue) => ({
        ...context,
        ...issue,
        figureId: issue.figureId ?? context.figureId,
        elementId: issue.elementId ?? context.elementId,
        annotationIndex: issue.annotationIndex ?? context.annotationIndex,
        stage: context.stage === "title" || issue.stage === "base"
          ? context.stage ?? issue.stage
          : issue.stage,
        path: [...(context.path ?? []), ...issue.path],
      })),
      { cause: error },
    );
  }
  if (error instanceof z.ZodError) {
    return new WhiteboardRenderError(
      error.issues.map((issue) => ({
        code: "INVALID_SPEC",
        severity: "error",
        stage: "validation",
        ...context,
        path: [
          ...(context.path ?? []),
          ...issue.path.map((part) =>
            typeof part === "number" ? part : String(part)
          ),
        ],
        message: issue.message,
      })),
      { cause: error },
    );
  }
  return renderError(
    "INTERNAL_RENDER_ERROR",
    "An internal whiteboard rendering error occurred.",
    context,
    error,
  );
}

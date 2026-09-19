import type { WhiteboardFigureContent } from "../schema.ts";
import { whiteboardFigureByType } from "../figures/index.ts";
import {
  type AnnotationTargetPart,
  collectElementIds,
  disallowedAnnotationTargets,
} from "../figures/shared.ts";
import { type Drawing, unionBounds } from "./bounds.ts";
import { renderTextFigureDrawing } from "./text.ts";
import { renderCircularGraphDrawing, renderXyGraphDrawing } from "./graphs.ts";
import { renderMathExpressionsDrawing } from "./math-expressions.ts";
import { renderCoordinatePlotDrawing } from "./coordinate-plot.ts";
import { renderDistributionDrawing } from "./distribution.ts";
import { renderGeometryDrawing } from "./geometry.ts";
import { type TargetedDrawing } from "./targets.ts";
import { renderAnnotations } from "./annotations.ts";
import type { AnnotationDiagnostic } from "./annotation-types.ts";
import { type CalloutPlacement } from "./callouts.ts";
import {
  ALLOCATION_GROWTH,
  type FigureRenderOptions,
  resolveFigureOptions,
} from "./options.ts";
import {
  contextualize,
  renderError,
  type RenderIssue,
  type RenderStage,
  type RequiredAllocation,
  WhiteboardRenderError,
} from "./issues.ts";
import { assertScenePart, assertTargetedDrawing } from "./drawing.ts";
import { COLORS, SERIES_COLORS } from "./theme.ts";

export type FigureAllocation = { width: number; height: number };
export type PreparedFigure = {
  id: string;
  type: WhiteboardFigureContent["type"];
  source: string;
  optionsKey: string;
  /** The allocation the base render finally used; equals the request unless content needed more room. */
  allocation: FigureAllocation;
  base: TargetedDrawing;
  emphasis: Drawing;
  complete: Drawing;
  calloutPlacements: CalloutPlacement[];
  annotationDiagnostics: AnnotationDiagnostic[];
  diagnostics: RenderIssue[];
};
export type FigurePreparationResult = {
  ok: true;
  content: WhiteboardFigureContent;
  figure: PreparedFigure;
} | {
  ok: false;
  issues: RenderIssue[];
  error: WhiteboardRenderError;
};

export function figureOptionsKey(options: FigureRenderOptions): string {
  const { onDiagnostic: _callback, ...resolved } = resolveFigureOptions(
    options,
  );
  return JSON.stringify(resolved);
}

function renderBaseFigure(
  figure: WhiteboardFigureContent,
  options: FigureRenderOptions,
): TargetedDrawing {
  switch (figure.type) {
    case "text":
      return renderTextFigureDrawing(figure, options);
    case "xy_chart":
      return renderXyGraphDrawing(figure, options);
    case "pie_chart":
      return renderCircularGraphDrawing(figure, options);
    case "geometry":
      return renderGeometryDrawing(figure, options);
    case "math_expressions":
      return renderMathExpressionsDrawing(figure, options);
    case "coordinate_plot":
      return renderCoordinatePlotDrawing(figure, options);
    case "distribution":
      return renderDistributionDrawing(figure, options);
  }
}

/** Combine every fit requirement from one failed attempt into the next allocation. */
function nextAllocation(
  error: unknown,
  current: FigureAllocation,
): FigureAllocation | undefined {
  if (!(error instanceof WhiteboardRenderError)) return undefined;
  const fits = error.issues.filter((issue) =>
    issue.code === "CONTENT_DOES_NOT_FIT"
  );
  if (!fits.length || fits.length !== error.issues.length) return undefined;
  const requirements = fits.map((issue): RequiredAllocation =>
    issue.required ?? "grow"
  );
  let { width, height } = current;
  for (const required of requirements) {
    if (required === "grow") {
      width = Math.max(width, current.width * ALLOCATION_GROWTH.step);
      height = Math.max(height, current.height * ALLOCATION_GROWTH.step);
      continue;
    }
    if (required.width !== undefined) width = Math.max(width, required.width);
    if (required.height !== undefined) {
      height = Math.max(height, required.height);
    }
  }
  width = Math.ceil(width);
  height = Math.ceil(height);
  if (width === current.width && height === current.height) {
    // An exact requirement that did not resolve the failure: step instead of looping.
    width = Math.ceil(current.width * ALLOCATION_GROWTH.step);
    height = Math.ceil(current.height * ALLOCATION_GROWTH.step);
  }
  return { width, height };
}

/**
 * Type scale is fixed and content is never clipped, so a figure that does not
 * fit asks for more room instead. Grow the allocation toward each renderer's
 * stated requirement until it fits or reaches the ceiling; past the ceiling the
 * failure is a content problem for the author or generator.
 */
function renderBaseFigureFitting(
  figure: WhiteboardFigureContent,
  options: ReturnType<typeof resolveFigureOptions>,
): { base: TargetedDrawing; allocation: FigureAllocation } {
  let allocation: FigureAllocation = {
    width: options.width,
    height: options.height,
  };
  for (let attempt = 0;; attempt++) {
    try {
      const base = renderBaseFigure(figure, { ...options, ...allocation });
      return { base, allocation };
    } catch (error) {
      const next = nextAllocation(error, allocation);
      if (
        !next || attempt >= ALLOCATION_GROWTH.maxAttempts ||
        next.width > options.maxWidth || next.height > options.maxHeight
      ) {
        throw error;
      }
      allocation = next;
    }
  }
}

function validateElementIds(figure: WhiteboardFigureContent) {
  const ids = collectElementIds(figure).map((element) => element.id);
  if (new Set(ids).size !== ids.length) {
    throw renderError(
      "INVALID_SPEC",
      `Duplicate element ID in figure '${figure.id}'.`,
    );
  }
}

/** The single preparation boundary for generated and supplied figures. No model calls. */
export function prepareFigure(
  input: WhiteboardFigureContent,
  options: FigureRenderOptions,
): FigurePreparationResult {
  let stage: RenderStage = "validation";
  try {
    const definition = whiteboardFigureByType(input.type);
    if (!definition) {
      throw renderError("INVALID_SPEC", "Unsupported whiteboard figure type.");
    }
    const figure = definition.schema.parse(input);
    validateElementIds(figure);
    const diagnostics: RenderIssue[] = [];
    const resolved = resolveFigureOptions(options);
    const opts = {
      ...resolved,
      onDiagnostic: (issue: RenderIssue) => {
        diagnostics.push(issue);
      },
    };
    stage = "base";
    const fitted = renderBaseFigureFitting(figure, opts);
    assertTargetedDrawing(fitted.base);
    const allocation = fitted.allocation;
    const base = {
      ...fitted.base,
      markup: `<g data-layer="base">${fitted.base.markup}</g>`,
    };
    const annotationOptions = {
      ...opts,
      ...allocation,
      figureId: figure.id ?? options.id,
      color: figure.type === "math_expressions" ? SERIES_COLORS[0] : COLORS.ink,
    };
    stage = "annotations";
    const figureId = figure.id ?? options.id;
    const parts = (definition.annotationTargetParts as (
      value: typeof figure,
    ) => AnnotationTargetPart[])(figure);
    for (
      const issue of disallowedAnnotationTargets(
        figure.annotations ?? [],
        figureId,
        parts,
      )
    ) {
      throw renderError(
        "INVALID_ANNOTATION",
        `'${issue.type}' cannot target '${issue.ref}' in figure '${figureId}'.`,
        {
          stage: "annotations",
          figureId,
          annotationIndex: issue.annotationIndex,
          path: [
            "annotations",
            issue.annotationIndex,
            "targetIds",
            issue.targetIndex,
          ],
          availableTargetIds: issue.availableTargetIds,
        },
      );
    }
    const annotations = renderAnnotations(
      figure.annotations ?? [],
      base,
      annotationOptions,
    );
    const emphasis = {
      markup: base.markup + annotations.emphasis.markup,
      bounds: unionBounds([base.bounds, annotations.emphasis.bounds]),
    };
    const complete = {
      markup: emphasis.markup + annotations.callouts.markup,
      bounds: unionBounds([emphasis.bounds, annotations.callouts.bounds]),
    };
    diagnostics.push(...annotations.diagnostics.map((issue): RenderIssue => ({
      code: issue.code === "overlap-fallback"
        ? "LAYOUT_OVERLAP"
        : "CALLOUT_UNPLACEABLE",
      stage: "callouts",
      figureId: issue.figureId,
      annotationIndex: issue.annotationIndex,
      path: ["annotations", issue.annotationIndex],
      message: issue.message,
      severity: "warning",
    })));
    const unplaceable = diagnostics.filter((issue) =>
      issue.code === "CALLOUT_UNPLACEABLE"
    ).map((issue) => ({ ...issue, severity: "error" as const }));
    if (unplaceable.length) throw new WhiteboardRenderError(unplaceable);
    assertScenePart(complete);
    return {
      ok: true,
      content: figure,
      figure: {
        id: figure.id ?? options.id,
        type: figure.type,
        source: JSON.stringify(figure),
        optionsKey: figureOptionsKey(options),
        allocation,
        base,
        emphasis,
        complete,
        calloutPlacements: annotations.placements,
        annotationDiagnostics: annotations.diagnostics,
        diagnostics,
      },
    };
  } catch (cause) {
    const error = contextualize(cause, {
      figureId: input.id ?? options.id,
      stage,
    });
    return { ok: false, issues: error.issues, error };
  }
}

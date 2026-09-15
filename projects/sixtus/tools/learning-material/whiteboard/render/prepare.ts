import type { WhiteboardFigureContent } from "../schema.ts";
import { whiteboardFigures } from "../figures/index.ts";
import { type Drawing, unionBounds } from "./bounds.ts";
import { renderFreeformDrawing } from "./freeform.ts";
import { renderTextFigureDrawing } from "./text.ts";
import { renderCircularGraphDrawing, renderXyGraphDrawing } from "./graphs.ts";
import { renderMathExpressionsDrawing } from "./math-expressions.ts";
import { renderCoordinatePlotDrawing } from "./coordinate-plot.ts";
import { renderGeometryDrawing } from "./geometry.ts";
import { type TargetedDrawing } from "./targets.ts";
import { renderAnnotations } from "./annotations.ts";
import type { AnnotationDiagnostic } from "./annotation-types.ts";
import { type CalloutPlacement } from "./callouts.ts";
import { type FigureRenderOptions, resolveFigureOptions } from "./options.ts";
import {
  contextualize,
  renderError,
  type RenderIssue,
  type RenderStage,
  WhiteboardRenderError,
} from "./issues.ts";
import { assertScenePart, assertTargetedDrawing } from "./drawing.ts";
import { COLORS, SERIES_COLORS } from "./theme.ts";

export type PreparedFigure = {
  id: string;
  type: WhiteboardFigureContent["type"];
  source: string;
  optionsKey: string;
  base: TargetedDrawing;
  emphasis: Drawing;
  complete: Drawing;
  calloutPlacements: CalloutPlacement[];
  annotationDiagnostics: AnnotationDiagnostic[];
  diagnostics: RenderIssue[];
};
export type FigurePreparationResult = { ok: true; figure: PreparedFigure } | {
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
    case "freeform":
      return renderFreeformDrawing(figure, options);
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
  }
}

function validateElementIds(figure: WhiteboardFigureContent) {
  const elements = figure.type === "pie_chart"
    ? figure.slices
    : figure.type === "xy_chart"
    ? figure.series.flatMap((series) => [series, ...series.points])
    : figure.type === "geometry"
    ? [
      ...figure.points,
      ...figure.objects,
      ...figure.labels,
      ...figure.markings,
    ]
    : figure.type === "text"
    ? []
    : figure.type === "math_expressions"
    ? figure.expressions
    : figure.elements;
  const ids = elements.flatMap((element) => element.id ? [element.id] : []);
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
    const definition = whiteboardFigures.find((figure) =>
      figure.type === input.type
    );
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
    const base = renderBaseFigure(figure, opts);
    assertTargetedDrawing(base);
    const annotationOptions = {
      ...opts,
      figureId: figure.id ?? options.id,
      color: figure.type === "math_expressions" || figure.type === "freeform"
        ? SERIES_COLORS[0]
        : COLORS.ink,
    };
    stage = "annotations";
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
    const unplaceable = diagnostics.filter((issue) => issue.code === "CALLOUT_UNPLACEABLE").map((issue) => ({ ...issue, severity: "error" as const }));
    if (unplaceable.length) throw new WhiteboardRenderError(unplaceable);
    assertScenePart(complete);
    return {
      ok: true,
      figure: {
        id: figure.id ?? options.id,
        type: figure.type,
        source: JSON.stringify(figure),
        optionsKey: figureOptionsKey(options),
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

import { renderError } from "./issues.ts";
import { annotationSchema } from "../figures/shared.ts";
import type {
  Annotation,
  AnnotationOptions,
  ResolvedAnnotation,
  ResolvedCallout,
  ResolvedEmphasis,
} from "./annotation-types.ts";
import { renderEmphasis } from "./emphasis.ts";
import { renderCallouts } from "./callouts.ts";
import {
  type RenderTarget,
  type TargetedDrawing,
  validateTarget,
} from "./targets.ts";

/** Validate once, retaining measured targets throughout every annotation stage. */
export function resolveAnnotations(
  annotations: Annotation[],
  targets: Map<string, RenderTarget>,
  figureId: string,
): ResolvedAnnotation[] {
  return annotations.map((input, annotationIndex) => {
    const annotation = annotationSchema.parse(input);
    const selected = annotation.targetIds.map((id) => {
      const target = targets.get(id);
      if (!target) {
        throw renderError(
          "UNKNOWN_TARGET",
          `Unknown or unavailable annotation target '${id}' in figure '${figureId}'.`,
          {
            stage: "annotations",
            figureId,
            annotationIndex,
            path: ["annotations", annotationIndex, "targetIds"],
          },
        );
      }
      validateTarget(target, id);
      if (
        (annotation.type === "underline" ||
          annotation.type === "strikethrough") && target.kind !== "text"
      ) {
        throw renderError(
          "INVALID_ANNOTATION",
          `Annotation '${annotation.type}' requires a text target: '${id}'.`,
        );
      }
      return target;
    });
    // The schema enforces type/content combinations; downstream code uses this union.
    return {
      ...annotation,
      targets: selected,
      figureId,
      annotationIndex,
    } as ResolvedAnnotation;
  });
}

/** The sole shared annotation pipeline, independent of the figure family. */
export function renderAnnotations(
  annotations: Annotation[],
  scene: TargetedDrawing,
  options: AnnotationOptions,
) {
  const emphasisRequests: ResolvedEmphasis[] = [],
    calloutRequests: ResolvedCallout[] = [];
  for (
    const request of resolveAnnotations(
      annotations,
      scene.targets,
      options.figureId,
    )
  ) {
    switch (request.type) {
      case "arrow":
      case "line":
      case "bracket":
        calloutRequests.push(request);
        break;
      default:
        emphasisRequests.push(request);
    }
  }
  const emphasis = renderEmphasis(emphasisRequests, options);
  const callouts = renderCallouts(calloutRequests, scene, emphasis, options);
  for (const diagnostic of callouts.diagnostics) {
    console.warn(diagnostic.message);
  }
  return {
    emphasis: emphasis.drawing,
    callouts: callouts.drawing,
    placements: callouts.placements,
    diagnostics: callouts.diagnostics,
  };
}

import { renderError } from "./issues.ts";
import {
  annotationSchema,
  resolveTargetRef,
  shortTargetRefs,
} from "../figures/shared.ts";
import type {
  Annotation,
  AnnotationOptions,
  EmphasisMark,
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

/**
 * Highlight encloses the target: a circle around compact targets, a tight box
 * around elongated ones (an ellipse around a long row grows far beyond it).
 * Underlines are not chosen automatically because figure titles are already underlined.
 */
function highlightMark(target: RenderTarget): EmphasisMark {
  const { width, height } = target.bounds;
  return Math.max(width, height) > Math.min(width, height) * 3
    ? "box"
    : "circle";
}

/** Validate once, resolve short target references, and choose each mark from its target. */
export function resolveAnnotations(
  annotations: Annotation[],
  targets: Map<string, RenderTarget>,
  figureId: string,
): ResolvedAnnotation[] {
  const canonicalIds = new Set(targets.keys());
  return annotations.flatMap((input, annotationIndex) => {
    const annotation = annotationSchema.parse(input);
    const selected = annotation.targetIds.map((ref) => {
      const id = resolveTargetRef(ref, figureId, canonicalIds);
      const target = id === undefined ? undefined : targets.get(id);
      if (id === undefined || !target) {
        throw renderError(
          "UNKNOWN_TARGET",
          `Unknown or unavailable annotation target '${ref}' in figure '${figureId}'.`,
          {
            stage: "annotations",
            figureId,
            annotationIndex,
            path: ["annotations", annotationIndex, "targetIds"],
            availableTargetIds: shortTargetRefs(figureId, canonicalIds),
          },
        );
      }
      validateTarget(target, id);
      return { id, target };
    });
    const base = {
      intent: annotation.type,
      text: annotation.text,
      figureId,
      annotationIndex,
    };
    const single = (type: ResolvedAnnotation["type"]): ResolvedAnnotation =>
      ({
        ...base,
        type,
        targetIds: [selected[0].id],
        targets: [selected[0].target],
      }) as ResolvedAnnotation;
    switch (annotation.type) {
      case "highlight":
        return [single(highlightMark(selected[0].target))];
      case "strikeout":
        return [
          single(selected[0].target.kind === "text" ? "strikethrough" : "cross"),
        ];
      case "callout":
        return [single(selected[0].target.kind === "mark" ? "arrow" : "line")];
      case "group":
        return [{
          ...base,
          type: "bracket",
          targetIds: selected.map((s) => s.id),
          targets: selected.map((s) => s.target),
        }];
      case "number":
        return selected.map(({ id, target }, sequence): ResolvedEmphasis => ({
          ...base,
          type: "number",
          text: String(sequence + 1),
          targetIds: [id],
          targets: [target],
          sequence,
        }));
    }
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
  return {
    emphasis: emphasis.drawing,
    callouts: callouts.drawing,
    placements: callouts.placements,
    diagnostics: callouts.diagnostics,
  };
}

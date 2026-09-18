import type { Annotation, AnnotationType } from "../figures/shared.ts";
import type { RenderTarget } from "./targets.ts";

export type { Annotation, AnnotationType };

/** Drawn marks. The spec names an intent; `resolveAnnotations` picks the mark per target. */
export const EMPHASIS_MARKS = [
  "circle",
  "box",
  "strikethrough",
  "cross",
  "number",
] as const;
export const CALLOUT_MARKS = ["arrow", "line", "bracket"] as const;
export type EmphasisMark = typeof EMPHASIS_MARKS[number];
export type CalloutMark = typeof CALLOUT_MARKS[number];
export type MarkType = EmphasisMark | CalloutMark;

type Resolved<M extends MarkType> = M extends MarkType ? {
    type: M;
    intent: AnnotationType;
    /** Callout message, group label, or the number to draw. */
    text: string | null;
    targetIds: string[];
    targets: RenderTarget[];
    figureId: string;
    annotationIndex: number;
    /** Position within a fanned-out annotation (numbers), for stable element IDs. */
    sequence?: number;
  }
  : never;
export type ResolvedCallout = Resolved<CalloutMark>;
export type ResolvedEmphasis = Resolved<EmphasisMark>;
export type ResolvedAnnotation = ResolvedCallout | ResolvedEmphasis;

export type AnnotationOptions = {
  figureId: string;
  id: string;
  roughness?: number;
  seed?: number;
  color?: string;
};
export type AnnotationDiagnostic = {
  figureId: string;
  annotationIndex: number;
  targetIds: string[];
  code: "overlap-fallback" | "unplaceable";
  message: string;
};

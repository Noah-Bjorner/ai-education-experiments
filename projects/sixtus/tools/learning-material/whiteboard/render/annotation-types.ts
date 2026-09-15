import type { WhiteboardFigureContent } from "../schema.ts";
import type { RenderTarget } from "./targets.ts";

export type Annotation = NonNullable<
  WhiteboardFigureContent["annotations"]
>[number];
type Content<K extends Annotation["type"]> = K extends
  "arrow" | "line" | "number" ? string
  : K extends "bracket" ? string | null
  : null;
export type ResolvedAnnotation = {
  [K in Annotation["type"]]: {
    type: K;
    content: Content<K>;
    targetIds: string[];
    targets: RenderTarget[];
    figureId: string;
    annotationIndex: number;
  };
}[Annotation["type"]];
export type ResolvedCallout = Extract<
  ResolvedAnnotation,
  { type: "arrow" | "line" | "bracket" }
>;
export type ResolvedEmphasis = Exclude<ResolvedAnnotation, ResolvedCallout>;
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

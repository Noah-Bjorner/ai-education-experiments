import { z } from "@zod";
import { whiteboardFigures } from "../figures/index.ts";
import { elementIdField, figureAnnotationsField } from "../figures/shared.ts";
import type { WhiteboardFigureContent } from "../schema.ts";

export type FigureDefinition = typeof whiteboardFigures[number] & {
  boardRules?: string;
};
// Only generation requires IDs throughout; standalone figure schemas stay compatible.
type WithIds<T> = T extends readonly (infer E)[] ? WithIds<E>[]
  : T extends object ?
      & { [K in keyof T]: WithIds<T[K]> }
      & ("id" extends keyof T ? { id: string } : unknown)
  : T;
export type GeneratedFigure = WithIds<WhiteboardFigureContent> & {
  id: string;
  annotations: z.infer<typeof figureAnnotationsField>;
};
export type GeneratedBoard = {
  title: string | null;
  figures: GeneratedFigure[];
};

/** Require board identity. Nested element IDs are already required on each figure schema. */
export function generatedFigureSchema(
  figure: FigureDefinition,
): z.ZodType<GeneratedFigure> {
  return figure.schema.safeExtend({
    id: elementIdField,
    annotations: z.array(figureAnnotationsField.element.strict()),
  }).strict() as z.ZodType<GeneratedFigure>;
}

export function generatedTitleSchema(showTitle: boolean) {
  return showTitle ? z.string().trim().min(1) : z.null();
}

/** The model supplies ordered content, never board placement. */
export function createGeneratedBoardSchema(
  availableFigures: readonly FigureDefinition[],
  showTitle: boolean,
): z.ZodType<GeneratedBoard> {
  if (!availableFigures.length) {
    throw new Error("Generation requires available figure types.");
  }
  const schemas = availableFigures.map(generatedFigureSchema);
  return z.strictObject({
    title: generatedTitleSchema(showTitle),
    // anyOf, not discriminatedUnion's oneOf. A single type needs no union.
    figures: z.array(schemas.length === 1 ? schemas[0] : z.union(schemas)).min(
      1,
    ),
  });
}

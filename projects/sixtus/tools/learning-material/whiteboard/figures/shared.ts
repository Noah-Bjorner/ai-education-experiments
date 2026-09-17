import { z } from "@zod";

export const figureTitleField = z.string().min(1).nullable().describe(
  "Short learner-facing title identifying what this figure shows only when its content does not already make that clear. Default to null; do not repeat the board title, labels, or a framing question supplied in the instructions.",
);

export const elementIdField = z.string().regex(/^[a-z][a-z0-9-]*$/).describe(
  "Stable lowercase ID using letters, digits, and hyphens. Figure IDs are unique across the board; series, point, and slice IDs are unique within their figure. Preserve IDs when editing content.",
);

export const annotationSchema = z.object({
  type: z.enum([
    "circle",
    "box",
    "underline",
    "strikethrough",
    "number",
    "arrow",
    "line",
    "bracket",
  ]),
  targetIds: z.array(z.string().min(1)).min(1).describe(
    "Visual target IDs in this figure, using the documented figure.element.part naming rules. Exactly one target except for brackets, which can group multiple targets.",
  ),
  content: z.string().trim().min(1).nullable().describe(
    "Null for circle, box, underline, and strikethrough; a positive integer as text for number; nonempty message text for arrow and line; optional label text or null for bracket.",
  ),
}).superRefine((annotation, ctx) => {
  if (annotation.type !== "bracket" && annotation.targetIds.length !== 1) {
    ctx.addIssue({
      code: "custom",
      path: ["targetIds"],
      message: "Only brackets support multiple targets.",
    });
  }
  const { type, content } = annotation;
  if (
    ["circle", "box", "underline", "strikethrough"].includes(type) &&
    content !== null
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["content"],
      message: "Emphasis shapes require null content.",
    });
  }
  if (type === "number" && (content === null || !/^[1-9]\d*$/.test(content))) {
    ctx.addIssue({
      code: "custom",
      path: ["content"],
      message: "Number content must be a positive integer as text.",
    });
  }
  if ((type === "arrow" || type === "line") && content === null) {
    ctx.addIssue({
      code: "custom",
      path: ["content"],
      message: "Arrow and line callouts require message text.",
    });
  }
});

export const figureAnnotationsField = z.array(annotationSchema).describe(
  "Teaching annotations for this figure. Use an empty array when annotations do not help the goal. Every target must reference a defined element and supported visual part in this figure.",
);

/** Shared envelope. Standalone renderer schemas may omit identity; generation requires it. */
export function figureEnvelope<Type extends string>(type: Type) {
  return z.object({
    type: z.literal(type),
    id: elementIdField.optional(),
    title: figureTitleField,
    annotations: figureAnnotationsField.optional(),
  });
}

/** Semantic target suffixes; visibility and measured bounds belong to rendering. */
export type AnnotationTargetPart = { part: string; kind: "text" | "mark" };

export function titleTargetParts(
  figure: { title: string | null },
): AnnotationTargetPart[] {
  return figure.title === null ? [] : [{ part: "title", kind: "text" }];
}

/**
 * Plugin contract for one figure type. Spec generation, validation, and the
 * classifier read these fields; they should not switch on `type`.
 *
 * Own on the definition: content schema, classifier need, prompt grammar, and
 * annotation catalog. Nested objects that can be annotation targets must
 * require `id` on this schema so generation needs no per-type wrapping.
 * Type-specific facts belong in schema refinements, not in spec validation
 * switches. Board packing is renderer-owned.
 */
export type WhiteboardFigureDefinition<S extends z.ZodType<{ type: string }>> =
  {
    type: z.infer<S>["type"];
    schema: S;
    summary: string;
    useWhen: string;
    need: {
      question: string;
      criteria: { true: string; false: string };
    };
    rules: string;
    /** Board-level reading-order notes, included only when this type is selected. */
    boardRules?: string;
    annotationTargets: string[];
    annotationTargetParts: (figure: z.infer<S>) => AnnotationTargetPart[];
    example: {
      instructions: string;
      output: z.infer<S>;
    };
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Nested objects with `id`, excluding the figure itself and annotations. */
export function collectElementIds(
  value: unknown,
  path: (string | number)[] = [],
  root = true,
): { id: string; path: (string | number)[] }[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) =>
      collectElementIds(item, [...path, i], false)
    );
  }
  if (!isRecord(value)) return [];
  const ids = !root && typeof value.id === "string"
    ? [{ id: value.id, path }]
    : [];
  for (const [key, child] of Object.entries(value)) {
    if (key === "id" || key === "annotations") continue;
    ids.push(...collectElementIds(child, [...path, key], false));
  }
  return ids;
}

import { z } from "@zod";

export const figureTitleField = z.string().min(1).nullable().describe(
  "Short learner-facing title identifying what this figure shows only when its content does not already make that clear. Default to null; do not repeat the board title, labels, or a framing question supplied in the instructions.",
);

export const elementIdField = z.string().regex(/^[a-z][a-z0-9-]*$/).describe(
  "Stable lowercase ID using letters, digits, and hyphens. Figure IDs are unique across the board; series, point, and slice IDs are unique within their figure. Preserve IDs when editing content.",
);

/**
 * Annotations name a teaching intent; the renderer chooses the mark. Group and
 * number take several targets, everything else exactly one.
 */
export const ANNOTATION_TYPES = [
  "highlight",
  "callout",
  "group",
  "number",
  "strikeout",
] as const;
export type AnnotationType = typeof ANNOTATION_TYPES[number];
const MULTI_TARGET_TYPES: readonly AnnotationType[] = ["group", "number"];

export const annotationSchema = z.object({
  type: z.enum(ANNOTATION_TYPES),
  targetIds: z.array(z.string().trim().min(1)).min(1).describe(
    "Targets in this figure: an element ID, `<elementId>.<part>`, or a figure-level part such as `title`. One target, except group and number which take several.",
  ),
  text: z.string().trim().min(1).nullable().describe(
    "Callout message (required) or group label (optional). Null for highlight, number, and strikeout.",
  ),
}).superRefine((annotation, ctx) => {
  const { type, text, targetIds } = annotation;
  if (!MULTI_TARGET_TYPES.includes(type) && targetIds.length !== 1) {
    ctx.addIssue({
      code: "custom",
      path: ["targetIds"],
      message: "Only group and number take several targets.",
    });
  }
  if (new Set(targetIds).size !== targetIds.length) {
    ctx.addIssue({
      code: "custom",
      path: ["targetIds"],
      message: "Targets must not repeat.",
    });
  }
  if (type === "callout" && text === null) {
    ctx.addIssue({
      code: "custom",
      path: ["text"],
      message: "Callouts require message text.",
    });
  }
  if (type !== "callout" && type !== "group" && text !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["text"],
      message: `'${type}' takes no text.`,
    });
  }
});
export type Annotation = z.infer<typeof annotationSchema>;

/**
 * Resolve a spec target reference against the canonical `<figureId>.<part>`
 * target IDs of one figure. Accepts the canonical form, `<part>`,
 * `<elementId>.<part>`, and a bare `<elementId>` meaning its mark or its only part.
 */
export function resolveTargetRef(
  ref: string,
  figureId: string,
  canonicalIds: Iterable<string>,
): string | undefined {
  const ids = canonicalIds instanceof Set
    ? canonicalIds as Set<string>
    : new Set(canonicalIds);
  if (ids.has(ref)) return ref;
  const full = `${figureId}.${ref}`;
  if (ids.has(full)) return full;
  if (ids.has(`${full}.mark`)) return `${full}.mark`;
  const matches = [...ids].filter((id) => id.startsWith(`${full}.`));
  return matches.length === 1 ? matches[0] : undefined;
}

/** Shortest accepted spelling of each canonical target, for prompts and diagnostics. */
export function shortTargetRefs(
  figureId: string,
  canonicalIds: Iterable<string>,
): string[] {
  const prefix = `${figureId}.`;
  const parts = [...canonicalIds].map((id) =>
    id.startsWith(prefix) ? id.slice(prefix.length) : id
  );
  const partsByElement = new Map<string, number>();
  for (const part of parts) {
    const dot = part.indexOf(".");
    if (dot > 0) {
      const element = part.slice(0, dot);
      partsByElement.set(element, (partsByElement.get(element) ?? 0) + 1);
    }
  }
  return parts.map((part) => {
    const dot = part.indexOf(".");
    if (dot < 0) return part;
    const element = part.slice(0, dot), suffix = part.slice(dot + 1);
    return suffix === "mark" || partsByElement.get(element) === 1
      ? element
      : part;
  });
}

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

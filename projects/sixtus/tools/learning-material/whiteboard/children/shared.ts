import { z } from "@zod";

export const childTitleField = z.string().min(1).describe(
  "Short learner-facing title shown above this element.",
);

export const elementIdField = z.string().regex(/^[a-z][a-z0-9-]*$/).describe(
  "Stable lowercase ID using letters, digits, and hyphens. Child IDs are unique across the board; series, point, and slice IDs are unique within their child. Preserve IDs when editing content.",
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
    "Visual target IDs in this child, using the documented child.element.part naming rules. Exactly one target except for brackets, which can group multiple targets.",
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

export const childAnnotationsField = z.array(annotationSchema).describe(
  "Teaching annotations for this child. Use an empty array when annotations do not help the goal. Every target must reference a defined element and supported visual part in this child.",
);

export type WhiteboardChildDefinition<S extends z.ZodType<{ type: string }>> = {
  type: z.infer<S>["type"];
  schema: S;
  instructions: string;
  example: {
    goal: string;
    output: z.infer<S>;
  };
};

import { z } from "@zod";
import {
  childAnnotationsField,
  childTitleField,
  elementIdField,
  type WhiteboardChildDefinition,
} from "./shared.ts";

const n = z.number().finite();
const point = z.object({ x: n, y: n }).strict();
const attachment = z.object({ target: elementIdField }).strict();
const color = z.enum([
  "ink",
  "accent-1",
  "accent-2",
  "accent-3",
  "accent-4",
  "accent-5",
  "accent-6",
]);
const common = { id: elementIdField, color: color.optional() };
const stroke = { dashed: z.boolean().optional() };
const position = z.union([
  point,
  z.object({
    target: elementIdField,
    side: z.enum(["top", "right", "bottom", "left"]),
    gap: n.nonnegative().optional(),
  }).strict(),
]);
const element = z.union([
  z.object({
    ...common,
    type: z.literal("text"),
    content: z.string().min(1).max(2000).refine(
      (s) => s.trim().length > 0,
      "Text must be visible",
    ),
    position,
    width: n.positive().max(800),
    align: z.enum(["left", "center", "right"]),
    size: z.enum(["small", "normal", "large"]),
  }).strict(),
  z.object({
    ...common,
    type: z.literal("rectangle"),
    x: n,
    y: n,
    width: n.positive(),
    height: n.positive(),
    fill: z.boolean().optional(),
  }).strict(),
  z.object({
    ...common,
    type: z.literal("ellipse"),
    x: n,
    y: n,
    rx: n.positive(),
    ry: n.positive(),
    fill: z.boolean().optional(),
  }).strict(),
  z.object({
    ...common,
    type: z.literal("marker"),
    x: n,
    y: n,
    radius: n.positive(),
    variant: z.enum(["x", "o", "dot"]),
  }).strict(),
  z.object({
    ...common,
    ...stroke,
    type: z.literal("line"),
    from: point,
    to: point,
  }).strict(),
  z.object({
    ...common,
    ...stroke,
    type: z.literal("arrow"),
    from: z.union([point, attachment]),
    to: z.union([point, attachment]),
  }).strict(),
]);

export const freeformSchema = z.object({
  type: z.literal("freeform"),
  id: elementIdField.optional(),
  title: childTitleField,
  annotations: childAnnotationsField.optional(),
  elements: z.array(element).min(1).max(128),
}).strict().superRefine((spec, ctx) => {
  const elements = new Map(spec.elements.map((e) => [e.id, e]));
  const seen = new Set<string>();
  spec.elements.forEach((e, i) => {
    const issue = (message: string) =>
      ctx.addIssue({
        code: "custom",
        path: ["elements", i],
        message: `Freeform '${
          spec.id ?? spec.title
        }', element '${e.id}': ${message}`,
      });
    if (seen.has(e.id)) issue("Duplicate element ID");
    seen.add(e.id);
    const refs = e.type === "text"
      ? [e.position]
      : e.type === "arrow"
      ? [e.from, e.to]
      : [];
    for (const ref of refs) {
      if ("target" in ref) {
        const target = elements.get(ref.target);
        if (
          !target || !["rectangle", "ellipse", "marker"].includes(target.type)
        ) {
          issue(
            `Target '${ref.target}' must reference a rectangle, ellipse, or marker`,
          );
        }
      }
    }
    if (
      (e.type === "line" || e.type === "arrow") && "x" in e.from &&
      "x" in e.to && e.from.x === e.to.x && e.from.y === e.to.y
    ) issue("Zero-length connector");
  });
});
export type Freeform = z.infer<typeof freeformSchema>;
export type FreeformElement = Freeform["elements"][number];

export const freeform = {
  type: "freeform",
  schema: freeformSchema,
  instructions:
    `Use freeform for schematic explanations that do not fit a specialized chart, geometry, or math child. Generate the complete scene in this spec; no prompt or SVG fields.
Lay out the scene in an 800 by 440 logical area, beneath an automatically drawn title. X increases rightward, Y downward. Keep the main diagram inside that area so scale stays consistent; inset large containers so labels fit beside them. A label that spills past an edge is drawn (the export grows) rather than cropped. Labels may sit in or on rectangles and ellipses. Do not stack labels on each other or run connectors through text. Elements render in array order.
Every element has id and optional color (ink or accent-1 through accent-6). Omit color so the base scene draws in ink; teaching annotations use accent-1. Use accent-2 through accent-6 only when categories must be distinguished, and never color the main diagram with accent-1. Rectangle: x,y at top left, width,height, optional fill boolean. Ellipse: x,y at center, rx,ry, optional fill; equal radii make a circle. Marker: x,y at center, radius, variant x/o/dot. Line: from/to {x,y}, optional dashed. Arrow: from/to each {x,y} or {target: elementId}, optional dashed. Arrow attachments use shape boundaries; arrows are straight and must avoid text.
Text: content, width (maximum line width), align left/center/right, size small/normal/large (18/22/28 units), position {x,y} at the top-left of its text layout box or {target,side,gap?}. Attached text sits outside a rectangle, ellipse, or marker on top/right/bottom/left with gap default 8. References may point forward but only to these three shape types. Text wraps without truncation; allow enough height. Explicit newlines are preserved.
Use the fewest objects needed. Keep labels short, repeated objects equally sized, related objects aligned, and colors consistent in meaning. Prefer an 8-unit spacing rhythm without altering meaningful positions. Use arrows only for meaningful direction or relationships. Do not stack labels or cross text with lines or arrows. Intentional shape containment and overlap are allowed. No images, arbitrary paths, rotation, or styling beyond these fields.
Targets: <childId>.title; <childId>.<textId>.label for text; <childId>.<elementId>.mark for all other elements. Shared annotations may address these targets. Prefer specialized children whenever they express the goal directly.`,
  example: {
    goal: "Show a message moving from a sender to a receiver.",
    output: {
      type: "freeform",
      id: "message",
      title: "Sending a message",
      annotations: [],
      elements: [
        {
          id: "sender",
          type: "rectangle",
          x: 100,
          y: 72,
          width: 160,
          height: 100,
        },
        {
          id: "receiver",
          type: "rectangle",
          x: 540,
          y: 72,
          width: 160,
          height: 100,
        },
        {
          id: "send",
          type: "arrow",
          from: { target: "sender" },
          to: { target: "receiver" },
        },
        {
          id: "sender-label",
          type: "text",
          content: "Sender",
          width: 160,
          align: "center",
          size: "normal",
          position: { target: "sender", side: "bottom" },
        },
        {
          id: "receiver-label",
          type: "text",
          content: "Receiver",
          width: 160,
          align: "center",
          size: "normal",
          position: { target: "receiver", side: "bottom" },
        },
      ],
    },
  },
} satisfies WhiteboardChildDefinition<typeof freeformSchema>;

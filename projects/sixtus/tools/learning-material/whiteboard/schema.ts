import { z } from "@zod";
import { whiteboardFigures } from "./figures/index.ts";
import { elementIdField } from "./figures/shared.ts";

export const WHITEBOARD_DOMAINS = ["auto", "math", "data"] as const;
export const WHITEBOARD_MODES = ["smart", "fast"] as const;
export const WHITEBOARD_FORMATS = ["url", "svg"] as const;

export type WhiteboardDomain = typeof WHITEBOARD_DOMAINS[number];
export type WhiteboardMode = typeof WHITEBOARD_MODES[number];
export type WhiteboardFormat = typeof WHITEBOARD_FORMATS[number];

export const whiteboardInputSchema = z.object({
  goal: z.string().min(1).describe(
    "The educational or communication task the whiteboard should accomplish: what the audience should understand or take away. Include relevant audience context, supplied facts or data, and constraints so the goal is self-contained.",
  ),
  domain: z.enum(WHITEBOARD_DOMAINS).optional().describe(
    "Which visual language to use. auto infers from the goal. math covers equations, geometry, and coordinate plots. data covers charts of quantities.",
  ),
  mode: z.enum(WHITEBOARD_MODES).optional().describe(
    "Use smart for more careful spec generation, or fast for lower latency.",
  ),
  format: z.enum(WHITEBOARD_FORMATS).optional().describe(
    "How to return the whiteboard: a hosted URL, or the SVG source.",
  ),
});

export type WhiteboardInput = z.infer<typeof whiteboardInputSchema>;

const [firstFigure, ...otherFigures] = whiteboardFigures;
export type WhiteboardFigureContent = z.infer<
  typeof whiteboardFigures[number]["schema"]
>;

// Placement belongs to the board, not the standalone figure renderers.
const placementFields = {
  id: elementIdField,
  anchor: elementIdField.nullable().describe(
    "ID of an earlier figure to position against. Null only for the first (root) figure.",
  ),
  side: z.enum(["top", "left", "right", "bottom"]).nullable().describe(
    "Side of the anchor to place this figure on, centered along the shared edge. Null only for the root. The renderer controls spacing.",
  ),
};
// z.union emits anyOf. z.discriminatedUnion emits oneOf, which OpenAI
// response_format rejects on array items. safeExtend preserves figure refinements.
const whiteboardFigureSchema = z.union([
  firstFigure.schema.safeExtend(placementFields),
  ...otherFigures.map((figure) => figure.schema.safeExtend(placementFields)),
]);

export const WhiteboardOutput = z.object({
  title: z.string().min(1).nullable().describe(
    "Board heading drawn centered above all figures. Null when no heading is needed or a single figure's title already serves as one.",
  ),
  figures: z.array(whiteboardFigureSchema).min(1).describe(
    "Figures in placement order. The first is the root; every later figure anchors to an earlier figure by ID.",
  ),
}).strict().superRefine((spec, ctx) => {
  const seen = new Set<string>();
  const figuresById = new Map(
    spec.figures.map((figure) => [figure.id, figure]),
  );
  const hasVisualization = spec.figures.some((figure) =>
    figure.type !== "text"
  );
  for (const [i, figure] of spec.figures.entries()) {
    const issue = (field: string, message: string) =>
      ctx.addIssue({
        code: "custom",
        path: ["figures", i, field],
        message,
      });
    if (seen.has(figure.id)) issue("id", `Duplicate figure ID '${figure.id}'.`);
    if (i === 0) {
      if (figure.anchor !== null) {
        issue("anchor", "The first figure must have a null anchor.");
      }
      if (figure.side !== null) {
        issue("side", "The first figure must have a null side.");
      }
    } else {
      if (figure.anchor === null || !seen.has(figure.anchor)) {
        issue("anchor", "Anchor must reference an earlier figure ID.");
      }
      if (figure.side === null) {
        issue("side", "Anchored figures require a side.");
      }
    }
    if (figure.type === "text") {
      if (figure.anchor !== null && figure.side !== "bottom") {
        issue(
          "side",
          "Text figures must be placed below their anchor with side 'bottom'.",
        );
      }
      if (hasVisualization && figure.role === "question") {
        const next = spec.figures[i + 1];
        if (
          !next || next.anchor !== figure.id || next.side !== "bottom" ||
          (next.type === "text" && next.role !== "question")
        ) {
          issue(
            "role",
            "A question must immediately precede its bottom-anchored answer visualization (or the next question in that group).",
          );
        }
      } else if (hasVisualization) {
        // Follow the existing placement chain to the visualization this note
        // describes. No separate relationship IDs or guessed associations.
        let anchor = figure.anchor === null
          ? undefined
          : figuresById.get(figure.anchor);
        const visited = new Set([figure.id]);
        while (anchor?.type === "text") {
          if (
            anchor.role === "question" || visited.has(anchor.id) ||
            anchor.side !== "bottom"
          ) {
            anchor = undefined;
            break;
          }
          visited.add(anchor.id);
          anchor = anchor.anchor === null
            ? undefined
            : figuresById.get(anchor.anchor);
        }
        if (!anchor) {
          issue(
            "anchor",
            "Notes and takeaways must follow a visualization, anchored below it directly or through other notes/takeaways.",
          );
        }
      }
    }
    seen.add(figure.id);
  }
});

export type WhiteboardSpec = z.infer<typeof WhiteboardOutput>;

export const whiteboardRequestSchema = z.union([
  whiteboardInputSchema,
  WhiteboardOutput,
]);

export type WhiteboardRequest = z.infer<typeof whiteboardRequestSchema>;

export const whiteboardResultSchema = z.object({
  url: z.string().optional().describe(
    "Public URL of the rendered whiteboard. Present when format is url.",
  ),
  svg: z.string().optional().describe(
    "SVG source of the rendered whiteboard. Present when format is svg.",
  ),
});

export type WhiteboardResult = z.infer<typeof whiteboardResultSchema>;

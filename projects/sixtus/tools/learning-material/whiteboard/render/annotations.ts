import type { WhiteboardSpec } from "../schema.ts";
import { escapeXml } from "../../outdated-visualization/static/shared/svg.ts";
import { type Drawing, unionBounds } from "./bounds.ts";
import { GRAPH_FONT_STYLE, graphTextBounds } from "./font.ts";
import { renderHandwritten } from "./handwritten.ts";
import type { Shape } from "./shapes.ts";
import type { RenderObstacle, RenderTarget } from "./targets.ts";
import { COLORS } from "./theme.ts";

type Annotation = NonNullable<
  WhiteboardSpec["children"][number]["annotations"]
>[number];
export type PendingCallout = {
  childId: string;
  annotationIndex: number;
  annotation: Annotation;
};

/** Add emphasis first; queue message callouts for the placement stage. */
export function renderEmphasisAnnotations(
  annotations: Annotation[],
  targets: Map<string, RenderTarget>,
  options: { childId: string; id: string; roughness?: number; seed?: number },
): {
  drawing: Drawing;
  pendingCallouts: PendingCallout[];
  obstacles: RenderObstacle[];
} {
  const parts: Drawing[] = [];
  const pendingCallouts: PendingCallout[] = [];
  const obstacles: RenderObstacle[] = [];
  annotations.forEach((annotation, annotationIndex) => {
    const selected = annotation.targetIds.map((id) => {
      const target = targets.get(id);
      if (!target) {
        throw new Error(
          `Unknown or unavailable annotation target '${id}' in child '${options.childId}'.`,
        );
      }
      return target;
    });
    if (["arrow", "line", "bracket"].includes(annotation.type)) {
      pendingCallouts.push({
        childId: options.childId,
        annotationIndex,
        annotation,
      });
      return;
    }
    const target = selected[0];
    const b = target.bounds;
    const id = `${options.id}-annotation-${annotationIndex}`;
    // A stable seed per annotation, independent of the base renderer's strokes.
    const pen = {
      id,
      seed: (options.seed ?? 10) + annotationIndex,
      roughness: options.roughness ?? 1.5,
      stroke: COLORS.ink,
      strokeWidth: 2,
    };
    let drawing: Drawing;
    if (annotation.type === "number") {
      const value = annotation.content!;
      const x = b.x + b.width + 6;
      const y = b.y - 6;
      drawing = {
        markup: `<text x="${x}" y="${y}" font-size="16" fill="${COLORS.ink}">${
          escapeXml(value)
        }</text>`,
        bounds: graphTextBounds(value, 16, x, y),
      };
    } else {
      let shape: Shape;
      if (annotation.type === "circle") {
        shape = {
          type: "circle",
          cx: b.x + b.width / 2,
          cy: b.y + b.height / 2,
          r: Math.hypot(b.width, b.height) / 2 + 5,
        };
      } else if (annotation.type === "box") {
        shape = {
          type: "rectangle",
          x: b.x - 5,
          y: b.y - 5,
          width: b.width + 10,
          height: b.height + 10,
        };
      } else {
        if (target.kind !== "text") {
          throw new Error(
            `Annotation '${annotation.type}' requires a text target: '${
              annotation.targetIds[0]
            }'.`,
          );
        }
        // Underline follows glyph bottoms; strikethrough crosses glyph centers.
        // For -90-degree axis labels, the underline is on the right of the text.
        const offset = annotation.type === "underline"
          ? (target.vertical ? b.width : b.height) + 3
          : (target.vertical ? b.width : b.height) / 2;
        shape = target.vertical
          ? {
            type: "line",
            x1: b.x + offset,
            y1: b.y,
            x2: b.x + offset,
            y2: b.y + b.height,
          }
          : {
            type: "line",
            x1: b.x,
            y1: b.y + offset,
            x2: b.x + b.width,
            y2: b.y + offset,
          };
      }
      drawing = renderHandwritten(shape, pen);
    }
    parts.push({
      ...drawing,
      markup:
        `<g id="${id}" data-annotation-type="${annotation.type}" data-target-id="${
          escapeXml(annotation.targetIds[0])
        }">${drawing.markup}</g>`,
    });
    if (drawing.bounds) {
      obstacles.push({
        bounds: drawing.bounds,
        kind: "annotation",
        ownerId: annotation.type === "number"
          ? undefined
          : annotation.targetIds[0],
      });
    }
  });
  return {
    drawing: {
      markup: parts.length
        ? `<g data-layer="emphasis" style="${GRAPH_FONT_STYLE}">${
          parts.map((p) => p.markup).join("\n")
        }</g>`
        : "",
      bounds: unionBounds(parts.map((p) => p.bounds)),
    },
    pendingCallouts,
    obstacles,
  };
}

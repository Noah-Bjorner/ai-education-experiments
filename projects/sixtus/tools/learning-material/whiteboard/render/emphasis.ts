import type {
  AnnotationOptions,
  ResolvedEmphasis,
} from "./annotation-types.ts";
import { escapeXml } from "./svg.ts";
import { type Bounds, type Drawing, unionBounds } from "./bounds.ts";
import { GRAPH_FONT_STYLE, graphTextBounds } from "./font.ts";
import { renderHandwritten } from "./handwritten.ts";
import type { Shape } from "./shapes.ts";
import type { RenderObstacle } from "./targets.ts";
import { COLORS, HAND_DRAWING, SPACING, TYPE_SCALE } from "./theme.ts";

/** Draw fixed emphasis and retain each target's effective connector boundary. */
export function renderEmphasis(
  annotations: ResolvedEmphasis[],
  options: AnnotationOptions,
): {
  drawing: Drawing;
  obstacles: RenderObstacle[];
  attachmentBounds: Map<string, Bounds>;
} {
  const color = options.color ?? COLORS.ink;
  const parts: Drawing[] = [];
  const attachmentBounds = new Map<string, Bounds>();
  const obstacles: RenderObstacle[] = [];
  annotations.forEach((annotation) => {
    const { annotationIndex, sequence } = annotation;
    const target = annotation.targets[0];
    const b = target.bounds;
    const id = `${options.id}-annotation-${annotationIndex}${
      sequence === undefined ? "" : `-${sequence}`
    }`;
    // A stable seed per annotation, independent of the base renderer's strokes.
    const pen = {
      id,
      seed: (options.seed ?? 10) + annotationIndex + (sequence ?? 0) * 101,
      roughness: options.roughness ?? HAND_DRAWING.roughness,
      stroke: color,
      strokeWidth: 2,
    };
    let drawing: Drawing;
    if (annotation.type === "number") {
      const value = annotation.text ?? "";
      const x = b.x + b.width + SPACING.labelGap;
      const y = b.y - SPACING.labelGap;
      drawing = {
        markup:
          `<g data-annotation-part="text"><text x="${x}" y="${y}" font-size="${TYPE_SCALE.annotation}" fill="${
            escapeXml(color)
          }">${escapeXml(value)}</text></g>`,
        bounds: graphTextBounds(value, TYPE_SCALE.annotation, x, y),
      };
    } else if (annotation.type === "cross") {
      // Two diagonal strokes across the target; used to strike out non-text marks.
      const pad = 4;
      const strokes = [
        {
          x1: b.x - pad,
          y1: b.y - pad,
          x2: b.x + b.width + pad,
          y2: b.y + b.height + pad,
        },
        {
          x1: b.x - pad,
          y1: b.y + b.height + pad,
          x2: b.x + b.width + pad,
          y2: b.y - pad,
        },
      ].map((line, i) =>
        renderHandwritten({ type: "line", ...line }, {
          ...pen,
          id: `${id}-stroke-${i}`,
          seed: pen.seed + i,
        })
      );
      drawing = {
        markup: strokes.map((s) => s.markup).join(""),
        bounds: unionBounds(strokes.map((s) => s.bounds)),
      };
    } else {
      let shape: Shape;
      if (annotation.type === "circle") {
        shape = target.kind === "text"
          ? {
            type: "ellipse",
            cx: b.x + b.width / 2,
            cy: b.y + b.height / 2,
            // Enclose the text rectangle without making height depend on width.
            rx: b.width / Math.SQRT2 + 5,
            ry: b.height / Math.SQRT2 + 5,
          }
          : {
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
            `Mark '${annotation.type}' requires a text target: '${
              annotation.targetIds[0]
            }'.`,
          );
        }
        const { a, b } = target.decorations.strikethrough;
        shape = { type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      }
      drawing = renderHandwritten(shape, pen);
    }
    parts.push({
      ...drawing,
      markup:
        `<g id="${id}" data-annotation-type="${annotation.intent}" data-annotation-mark="${annotation.type}" data-annotation-index="${annotationIndex}"${
          sequence === undefined
            ? ""
            : ` data-annotation-sequence="${sequence}"`
        } data-target-id="${
          escapeXml(annotation.targetIds[0])
        }">${drawing.markup}</g>`,
    });
    if (drawing.bounds) {
      if (annotation.type !== "number") {
        const id = annotation.targetIds[0];
        attachmentBounds.set(
          id,
          unionBounds([
            attachmentBounds.get(id) ?? target.bounds,
            drawing.bounds,
          ])!,
        );
      }
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
    attachmentBounds,
    obstacles,
  };
}

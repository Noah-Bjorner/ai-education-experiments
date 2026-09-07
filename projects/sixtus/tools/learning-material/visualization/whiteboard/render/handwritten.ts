import { escapeXml } from "../../static/shared/svg.ts";
import type { Shape } from "./shapes.ts";

export type HandwrittenOptions = {
  /** Unique within the containing SVG, so hatch clipping stays local. */
  id: string;
  seed?: number;
  /** Maximum coordinate displacement in SVG units. Zero gives a clean outline. */
  roughness?: number;
  /** Distance between diagonal fill strokes. */
  hatchGap?: number;
  stroke?: string;
  strokeWidth?: number;
  /** Hatch color; "none" leaves the shape empty. */
  fill?: string;
};

type Point = { x: number; y: number };
const point = (p: Point) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;

/** Convert primitive geometry to SVG paths; no browser or SVG parsing needed. */
export function handwritten(shape: Shape, options: HandwrittenOptions): string {
  const {
    id,
    seed = 1,
    roughness = 1.5,
    hatchGap = 9,
    stroke = "#263449",
    strokeWidth = 2,
    fill = "none",
  } = options;
  if (!/^[a-zA-Z][\w-]*$/.test(id)) {
    throw new Error("Use a simple, unique SVG id.");
  }
  if (
    ![roughness, hatchGap, strokeWidth, seed].every(Number.isFinite) ||
    roughness < 0 || hatchGap < 2 || strokeWidth <= 0
  ) {
    throw new Error(
      "Use finite options, roughness >= 0, hatchGap >= 2, and strokeWidth > 0.",
    );
  }
  const coordinates = Object.values(shape).filter((v) => typeof v === "number");
  if (
    !coordinates.every(Number.isFinite) ||
    (shape.type === "circle" && shape.r <= 0) ||
    (shape.type === "rectangle" && (shape.width <= 0 || shape.height <= 0))
  ) {
    throw new Error("Shapes need finite coordinates and positive dimensions.");
  }

  // A tiny seeded random generator: the same input always draws the same way.
  let state = seed >>> 0;
  const offset = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 4294967296 * 2 - 1) * roughness;
  };
  const jitter = (p: Point): Point => ({
    x: p.x + offset(),
    y: p.y + offset(),
  });

  // Bend a straight segment by moving its two cubic Bezier control points.
  const bentSegment = (a: Point, b: Point) => {
    const c1 = jitter({ x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 });
    const c2 = jitter({
      x: a.x + (b.x - a.x) * 2 / 3,
      y: a.y + (b.y - a.y) * 2 / 3,
    });
    return `C ${point(c1)} ${point(c2)} ${point(b)}`;
  };

  const outline = (): string => {
    if (shape.type === "line") {
      const a = { x: shape.x1, y: shape.y1 };
      const b = { x: shape.x2, y: shape.y2 };
      return `M ${point(a)} ${bentSegment(a, b)}`;
    }
    if (shape.type === "rectangle") {
      const { x, y, width: w, height: h } = shape;
      const corners = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, {
        x,
        y: y + h,
      }].map(jitter);
      return `M ${point(corners[0])} ` + corners.map((a, i) =>
        bentSegment(a, corners[(i + 1) % 4])
      ).join(" ") + " Z";
    }

    // Four cubic curves approximate a circle. Perturb their anchors and handles.
    const { cx, cy, r } = shape;
    const k = r * 0.5522847498; // Bezier handle length for a quarter circle.
    const anchors = [{ x: cx + r, y: cy }, { x: cx, y: cy + r }, {
      x: cx - r,
      y: cy,
    }, { x: cx, y: cy - r }].map(jitter);
    const tangents = [{ x: 0, y: k }, { x: -k, y: 0 }, { x: 0, y: -k }, {
      x: k,
      y: 0,
    }];
    return `M ${point(anchors[0])} ` + anchors.map((a, i) => {
      const next = (i + 1) % 4;
      const b = anchors[next];
      const c1 = jitter({ x: a.x + tangents[i].x, y: a.y + tangents[i].y });
      const c2 = jitter({
        x: b.x - tangents[next].x,
        y: b.y - tangents[next].y,
      });
      return `C ${point(c1)} ${point(c2)} ${point(b)}`;
    }).join(" ") + " Z";
  };

  // Draw two slightly different passes, like tracing over a pen stroke.
  const border = outline();
  const secondBorder = roughness > 0 ? outline() : "";
  let hatching = "";
  if (fill !== "none" && shape.type !== "line") {
    const bounds = shape.type === "circle"
      ? {
        x: shape.cx - shape.r,
        y: shape.cy - shape.r,
        width: shape.r * 2,
        height: shape.r * 2,
      }
      : shape;
    const margin = roughness * 3 + strokeWidth;
    const x = bounds.x - margin;
    const y = bounds.y - margin;
    const width = bounds.width + margin * 2;
    const height = bounds.height + margin * 2;
    const strokes: string[] = [];
    // Draw 45-degree lines over the bounding box; the outline clips the excess.
    for (let start = -height; start <= width; start += hatchGap * Math.SQRT2) {
      const a = { x: x + start, y: y + height };
      const b = { x: x + start + height, y };
      strokes.push(`M ${point(a)} ${bentSegment(a, b)}`);
    }
    hatching =
      `<defs><clipPath id="${id}-clip" clipPathUnits="userSpaceOnUse"><path d="${border}"/></clipPath></defs>
      <path d="${
        strokes.join(" ")
      }" clip-path="url(#${id}-clip)" fill="none" stroke="${
        escapeXml(fill)
      }" stroke-width="${strokeWidth * 0.65}"/>`;
  }

  return `<g stroke-linecap="round" stroke-linejoin="round">
    ${hatching}
    <g fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}">
      <path d="${border}"/>
      ${secondBorder ? `<path d="${secondBorder}" opacity="0.45"/>` : ""}
    </g>
  </g>`;
}

import { escapeXml } from "./svg.ts";
import type { Shape } from "./shapes.ts";
import { type FillSector, hatchStrokes } from "./hatching.ts";
import { COLORS, FILL_STYLE, HAND_DRAWING } from "./theme.ts";
import { type MarkerCurve, markerOutline } from "./marker-outline.ts";
import {
  type Bounds,
  cubicBounds,
  type Drawing,
  expandBounds,
  unionBounds,
} from "./bounds.ts";

export type HandwrittenOptions = {
  /** Unique within the containing SVG, so hatch clipping stays local. */
  id: string;
  seed?: number;
  /** Vary the fill independently while preserving the outline and clip shape. */
  fillSeed?: number;
  /** Hand imperfection in SVG units; also scales width variation. Zero is clean. */
  roughness?: number;
  /** Distance between diagonal fill strokes. */
  hatchGap?: number;
  /** Limit hatch geometry to a circle sector; caller must also clip the fill. */
  hatchSector?: FillSector;
  stroke?: string;
  strokeWidth?: number;
  /** Dash and gap lengths applied to outlines only, never to fill hatching. */
  strokeDasharray?: readonly number[];
  /** @deprecated All outlines now use one pass, regardless of this value. */
  singlePass?: boolean;
  /** Color for the faint background and hatch strokes; "none" leaves it empty. */
  fill?: string;
  /**
   * Hatch (default) or a complete fill of the wobble outline. Use solid for
   * marks smaller than a hatch gap, such as scatter and dot-plot dots.
   */
  fillStyle?: "hatch" | "solid";
};

type Point = { x: number; y: number };
const point = (p: Point) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;

/** Convert primitive geometry to SVG paths; no browser or SVG parsing needed. */
export function handwritten(shape: Shape, options: HandwrittenOptions): string {
  return renderHandwritten(shape, options).markup;
}

/** The same drawing with measured bounds for tightly wrapped exports. */
export function renderHandwritten(
  shape: Shape,
  options: HandwrittenOptions,
): Drawing {
  const {
    id,
    seed = 1,
    fillSeed = seed,
    roughness = HAND_DRAWING.roughness,
    hatchGap = 9,
    stroke = COLORS.ink,
    strokeWidth = 2,
    strokeDasharray,
    fill = "none",
    fillStyle = "hatch",
  } = options;
  if (!/^[a-zA-Z][\w-]*$/.test(id)) {
    throw new Error("Use a simple, unique SVG id.");
  }
  if (
    strokeDasharray !== undefined &&
    (strokeDasharray.length === 0 ||
      !strokeDasharray.every((length) => Number.isFinite(length) && length > 0))
  ) {
    throw new Error("Dash lengths must be finite positive numbers.");
  }
  if (
    ![roughness, hatchGap, strokeWidth, seed, fillSeed].every(
      Number.isFinite,
    ) ||
    roughness < 0 || hatchGap < 2 || strokeWidth <= 0 ||
    (fillStyle !== "hatch" && fillStyle !== "solid")
  ) {
    throw new Error(
      "Use finite options, roughness >= 0, hatchGap >= 2, strokeWidth > 0, and fillStyle hatch or solid.",
    );
  }
  const coordinates = Object.values(shape).filter((v) => typeof v === "number");
  if (
    !coordinates.every(Number.isFinite) ||
    (shape.type === "circle" && shape.r <= 0) ||
    (shape.type === "ellipse" && (shape.rx <= 0 || shape.ry <= 0)) ||
    (shape.type === "rectangle" && (shape.width <= 0 || shape.height <= 0))
  ) {
    throw new Error("Shapes need finite coordinates and positive dimensions.");
  }

  // A tiny seeded random generator: the same input always draws the same way.
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const jitter = (p: Point, amount = roughness): Point => ({
    x: p.x + (random() * 2 - 1) * amount,
    y: p.y + (random() * 2 - 1) * amount,
  });

  const curves: Bounds[] = [];
  const markerCurves: MarkerCurve[] = [];
  const includeCurve = (...points: [Point, Point, Point, Point]) => {
    // Measure the actual two-decimal coordinates emitted in the SVG path.
    const rounded = points.map((p) => ({
      x: Number(p.x.toFixed(2)),
      y: Number(p.y.toFixed(2)),
    }));
    curves.push(cubicBounds(rounded[0], rounded[1], rounded[2], rounded[3]));
    markerCurves.push(rounded as MarkerCurve);
  };

  // Bend a straight segment by moving its two cubic Bezier control points.
  const bentSegment = (a: Point, b: Point, measure = true) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const amount = Math.min(roughness, length * 0.08);
    if (amount > 0 && length > 50) {
      // A broad bow plus a smaller, smooth correction. Random point jitter on
      // long edges either looks perfectly straight or produces nervous corners.
      const bow = random() * 2 - 1, correction = random() * 2 - 1;
      const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
      const sample = (t: number) => {
        const offset = amount * (0.75 * bow * Math.sin(Math.PI * t) +
          0.4 * correction * Math.sin(3 * Math.PI * t));
        const derivative = amount * Math.PI *
          (0.75 * bow * Math.cos(Math.PI * t) +
            1.2 * correction * Math.cos(3 * Math.PI * t));
        return {
          p: {
            x: a.x + (b.x - a.x) * t + normal.x * offset,
            y: a.y + (b.y - a.y) * t + normal.y * offset,
          },
          tangent: {
            x: b.x - a.x + normal.x * derivative,
            y: b.y - a.y + normal.y * derivative,
          },
        };
      };
      const count = Math.max(3, Math.min(8, Math.ceil(length / 70)));
      return Array.from({ length: count }, (_, i) => {
        const start = sample(i / count), end = sample((i + 1) / count);
        const c1 = {
          x: start.p.x + start.tangent.x / (3 * count),
          y: start.p.y + start.tangent.y / (3 * count),
        };
        const c2 = {
          x: end.p.x - end.tangent.x / (3 * count),
          y: end.p.y - end.tangent.y / (3 * count),
        };
        if (measure) includeCurve(start.p, c1, c2, end.p);
        return `C ${point(c1)} ${point(c2)} ${point(end.p)}`;
      }).join(" ");
    }
    const c1 = jitter(
      { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
      amount,
    );
    const c2 = jitter({
      x: a.x + (b.x - a.x) * 2 / 3,
      y: a.y + (b.y - a.y) * 2 / 3,
    }, amount);
    if (measure) includeCurve(a, c1, c2, b);
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
      }].map((p) => jitter(p, Math.min(roughness, w * 0.08, h * 0.08)));
      return `M ${point(corners[0])} ` + corners.map((a, i) =>
        bentSegment(a, corners[(i + 1) % 4])
      ).join(" ") + " Z";
    }

    // Shared tangents keep the four arcs smooth even when their anchors drift.
    const { cx, cy } = shape;
    const rx = shape.type === "circle" ? shape.r : shape.rx;
    const ry = shape.type === "circle" ? shape.r : shape.ry;
    const amount = Math.min(roughness, rx * 0.15, ry * 0.15);
    const anchors = [{ x: cx + rx, y: cy }, { x: cx, y: cy + ry }, {
      x: cx - rx,
      y: cy,
    }, { x: cx, y: cy - ry }].map((p) => jitter(p, amount));
    const tangents = anchors.map((_, i) => {
      const previous = anchors[(i + 3) % 4], next = anchors[(i + 1) % 4];
      const scale = 0.5522847498 / 2 *
        (1 + (random() * 2 - 1) * Math.min(0.12, amount / Math.min(rx, ry)));
      return {
        x: (next.x - previous.x) * scale,
        y: (next.y - previous.y) * scale,
      };
    });
    return `M ${point(anchors[0])} ` + anchors.map((a, i) => {
      const next = (i + 1) % 4;
      const b = anchors[next];
      const c1 = { x: a.x + tangents[i].x, y: a.y + tangents[i].y };
      const c2 = {
        x: b.x - tangents[next].x,
        y: b.y - tangents[next].y,
      };
      includeCurve(a, c1, c2, b);
      return `C ${point(c1)} ${point(c2)} ${point(b)}`;
    }).join(" ") + " Z";
  };

  // One gesture defines both the ink silhouette and the animation centerline.
  const border = outline();
  const firstBounds = unionBounds(curves);
  // Native dashed strokes keep exact dash spacing and round individual ends.
  const marker = roughness > 0 && !strokeDasharray && stroke !== "none" &&
      firstBounds && (firstBounds.width > 0 || firstBounds.height > 0)
    ? markerOutline(
      markerCurves,
      shape.type !== "line",
      strokeWidth,
      roughness,
      seed,
    )
    : null;
  let filled = "";
  if (fill !== "none" && shape.type !== "line") {
    if (fillStyle === "solid") {
      filled = `<path d="${border}" fill="${escapeXml(fill)}" stroke="none"/>`;
    } else {
      // Restart randomness for this region. Neither its identity nor its color
      // changes the shared border geometry (especially useful for pie slices).
      state = fillSeed >>> 0;
      for (const character of `${id}:${fill}`) {
        state = (Math.imul(state, 31) + character.charCodeAt(0)) >>> 0;
      }
      const strokes = hatchStrokes(
        shape,
        roughness,
        hatchGap,
        random,
        options.hatchSector,
      )
        .map(({ start, c1, c2, end }) =>
          `M ${point(start)} C ${point(c1)} ${point(c2)} ${point(end)}`
        );
      filled =
        `<defs><clipPath id="${id}-clip" clipPathUnits="userSpaceOnUse"><path d="${border}"/></clipPath></defs>
      <path d="${border}" fill="${
          escapeXml(fill)
        }" fill-opacity="${FILL_STYLE.backgroundOpacity}" stroke="none"/>
      <path d="${
          strokes.join(" ")
        }" clip-path="url(#${id}-clip)" fill="none" stroke="${
          escapeXml(fill)
        }" stroke-opacity="${FILL_STYLE.hatchOpacity}" stroke-width="${
          strokeWidth * 0.65
        }"/>`;
    }
  }

  const markup = `<g stroke-linecap="round" stroke-linejoin="round">
    ${filled}
    <g fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}"${
    strokeDasharray ? ` stroke-dasharray="${strokeDasharray.join(" ")}"` : ""
  }>
      ${
    marker
      ? `<path d="${marker.d}" fill="${
        escapeXml(stroke)
      }" stroke="none" fill-rule="evenodd" data-marker-centerline="${border}" data-marker-width="${
        marker.brushWidth.toFixed(3)
      }"/>`
      : `<path d="${border}"/>`
  }
    </g>
  </g>`;
  const bounds = stroke !== "none"
    ? unionBounds([
      marker?.bounds ?? expandBounds(firstBounds, strokeWidth / 2),
      fill !== "none" ? firstBounds : null,
    ])
    : fill !== "none" && shape.type !== "line"
    ? firstBounds
    : null;
  return { markup, bounds };
}

/**
 * A small filled mark whose center stays at (cx, cy). The outline is the same
 * seeded wobble as other handwritten circles; the interior is a complete fill
 * of that outline, not hatch (hatch gaps are larger than the mark).
 */
export function renderHandwrittenDot(
  cx: number,
  cy: number,
  r: number,
  options: HandwrittenOptions,
): Drawing {
  if (![cx, cy, r].every(Number.isFinite) || r <= 0) {
    throw new Error("Dots need a finite center and a positive radius.");
  }
  const color = options.fill ?? options.stroke ?? COLORS.ink;
  const roughness = Math.min(
    (options.roughness ?? HAND_DRAWING.roughness) * 0.4,
    r * 0.2,
  );
  const dot = renderHandwritten({ type: "circle", cx, cy, r }, {
    ...options,
    fill: color,
    stroke: options.stroke ?? color,
    fillStyle: "solid",
    roughness,
    strokeWidth: options.strokeWidth ?? Math.max(1.2, r * 0.26),
  });
  // Keep point targets centered on their true coordinate while containing all ink.
  const bounds = dot.bounds!;
  const rx = Math.max(cx - bounds.x, bounds.x + bounds.width - cx);
  const ry = Math.max(cy - bounds.y, bounds.y + bounds.height - cy);
  return {
    ...dot,
    bounds: { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 },
  };
}

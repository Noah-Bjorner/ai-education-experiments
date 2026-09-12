import { escapeXml } from "./svg.ts";
import type { Shape } from "./shapes.ts";
import { type FillSector, hatchStrokes } from "./hatching.ts";
import { COLORS, FILL_STYLE } from "./theme.ts";
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
  /** Maximum coordinate displacement in SVG units. Zero gives a clean outline. */
  roughness?: number;
  /** Distance between diagonal fill strokes. */
  hatchGap?: number;
  /** Limit hatch geometry to a circle sector; caller must also clip the fill. */
  hatchSector?: FillSector;
  stroke?: string;
  strokeWidth?: number;
  /** Dash and gap lengths applied to outlines only, never to fill hatching. */
  strokeDasharray?: readonly number[];
  /** Omit the faint retraced outline, keeping dashed gaps clear. */
  singlePass?: boolean;
  /** Color for the faint background and hatch strokes; "none" leaves it empty. */
  fill?: string;
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
    roughness = 1.5,
    hatchGap = 9,
    stroke = COLORS.ink,
    strokeWidth = 2,
    strokeDasharray,
    singlePass = false,
    fill = "none",
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
  const offset = () => (random() * 2 - 1) * roughness;
  const jitter = (p: Point): Point => ({
    x: p.x + offset(),
    y: p.y + offset(),
  });

  let curves: Bounds[] = [];
  const includeCurve = (...points: [Point, Point, Point, Point]) => {
    // Measure the actual two-decimal coordinates emitted in the SVG path.
    const rounded = points.map((p) => ({
      x: Number(p.x.toFixed(2)),
      y: Number(p.y.toFixed(2)),
    }));
    curves.push(cubicBounds(rounded[0], rounded[1], rounded[2], rounded[3]));
  };

  // Bend a straight segment by moving its two cubic Bezier control points.
  const bentSegment = (a: Point, b: Point, measure = true) => {
    const c1 = jitter({ x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 });
    const c2 = jitter({
      x: a.x + (b.x - a.x) * 2 / 3,
      y: a.y + (b.y - a.y) * 2 / 3,
    });
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
      }].map(jitter);
      return `M ${point(corners[0])} ` + corners.map((a, i) =>
        bentSegment(a, corners[(i + 1) % 4])
      ).join(" ") + " Z";
    }

    // Four cubic curves approximate a circle. Perturb their anchors and handles.
    const { cx, cy } = shape;
    const rx = shape.type === "circle" ? shape.r : shape.rx;
    const ry = shape.type === "circle" ? shape.r : shape.ry;
    const kx = rx * 0.5522847498, ky = ry * 0.5522847498; // Bezier handle length for a quarter circle.
    const anchors = [{ x: cx + rx, y: cy }, { x: cx, y: cy + ry }, {
      x: cx - rx,
      y: cy,
    }, { x: cx, y: cy - ry }].map(jitter);
    const tangents = [{ x: 0, y: ky }, { x: -kx, y: 0 }, { x: 0, y: -ky }, {
      x: kx,
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
      includeCurve(a, c1, c2, b);
      return `C ${point(c1)} ${point(c2)} ${point(b)}`;
    }).join(" ") + " Z";
  };

  // Draw two slightly different passes, like tracing over a pen stroke.
  const border = outline();
  const firstBounds = unionBounds(curves);
  curves = [];
  const secondBorder = roughness > 0 && !singlePass ? outline() : "";
  const secondBounds = unionBounds(curves);
  let hatching = "";
  if (fill !== "none" && shape.type !== "line") {
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
    hatching =
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

  const markup = `<g stroke-linecap="round" stroke-linejoin="round">
    ${hatching}
    <g fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}"${
    strokeDasharray ? ` stroke-dasharray="${strokeDasharray.join(" ")}"` : ""
  }>
      <path d="${border}"/>
      ${secondBorder ? `<path d="${secondBorder}" opacity="0.45"/>` : ""}
    </g>
  </g>`;
  const bounds = stroke !== "none"
    ? expandBounds(unionBounds([firstBounds, secondBounds]), strokeWidth / 2)
    : fill !== "none" && shape.type !== "line"
    ? firstBounds
    : null;
  return { markup, bounds };
}

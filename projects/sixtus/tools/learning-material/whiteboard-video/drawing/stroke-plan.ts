import {
  distance,
  flatten,
  pathLength,
  type Point,
  transformPoint,
} from "./geometry.ts";
import { rasterize } from "./vendor/tegaki/rasterize.ts";
import { zhangSuenThin } from "./vendor/tegaki/zhang-suen.ts";
import {
  cleanJunctionClusters,
  restoreErasedComponents,
} from "./vendor/tegaki/cleanup.ts";
import { traceAndSimplify } from "./vendor/tegaki/trace.ts";
import {
  computeInverseDistanceTransform,
  getStrokeWidth,
} from "./vendor/tegaki/width.ts";

export type BrushPoint = Point & { width: number };
export type Stroke = { points: BrushPoint[]; length: number };
export type StrokePlan = {
  kind: "skeleton" | "path" | "wipe";
  strokes: Stroke[];
  /** Why geometry did not qualify for centerline drawing. */
  fallback?: string;
};

export function makeStrokePlan(
  d: string,
  matrix: DOMMatrix,
  localExtent: number,
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    fillRule: "nonzero" | "evenodd";
  },
  resolution: number,
): StrokePlan {
  const paths = flatten(d, Math.max(localExtent / (resolution * 4), 1e-7))
    .map((path) => path.map((point) => transformPoint(point, matrix)));
  const matrixScale = Math.max(
    Math.hypot(matrix.a, matrix.b),
    Math.hypot(matrix.c, matrix.d),
  );
  if (
    style.fill === "none" && style.stroke !== "none" && style.strokeWidth > 0
  ) {
    const width = style.strokeWidth * matrixScale + 0.6;
    const strokes = paths.filter((p) => p.length > 1 && pathLength(p) > 0)
      .map((p) => ({
        points: p.map((v) => ({ ...v, width })),
        length: pathLength(p),
      }));
    return strokes.length
      ? { kind: "path", strokes }
      : { kind: "wipe", strokes: [], fallback: "empty-stroke" };
  }
  if (style.fill === "none") {
    return { kind: "wipe", strokes: [], fallback: "no-visible-fill" };
  }
  const all = paths.flat();
  if (!all.length) return { kind: "wipe", strokes: [], fallback: "empty-path" };
  const box = {
    x1: Math.min(...all.map((p) => p.x)),
    y1: Math.min(...all.map((p) => p.y)),
    x2: Math.max(...all.map((p) => p.x)),
    y2: Math.max(...all.map((p) => p.y)),
  };
  if (box.x1 === box.x2 || box.y1 === box.y2) {
    return { kind: "wipe", strokes: [], fallback: "degenerate-fill" };
  }
  // SVG implicitly closes open filled subpaths, including ones without Z.
  const closed = paths.map((p) =>
    distance(p[0], p[p.length - 1]) > 0 ? [...p, p[0]] : p
  );
  const raster = rasterize(closed, box, resolution, style.fillRule);
  const { bitmap, width, height, transform } = raster;
  const dt = computeInverseDistanceTransform(
    bitmap,
    width,
    height,
    "euclidean",
  );
  const maxRadius = dt.reduce((a, b) => Math.max(a, b), 0);
  if (maxRadius > Math.max(width, height) * 0.3) {
    return { kind: "wipe", strokes: [], fallback: "solid-fill" };
  }
  let skeleton = zhangSuenThin(bitmap, width, height);
  skeleton = cleanJunctionClusters(skeleton, dt, width, height, zhangSuenThin);
  restoreErasedComponents(bitmap, skeleton, dt, width, height);
  const lines = traceAndSimplify(skeleton, width, height, 0.7);
  const strokes: Stroke[] = [];
  for (let line of lines) {
    if (!line.length) continue;
    // Prefer a top-left entry in board coordinates, not the font's inverted Y axis.
    if (
      line.length > 1 &&
      line[0].y + 0.35 * line[0].x >
        line[line.length - 1].y + 0.35 * line[line.length - 1].x
    ) line = [...line].reverse();
    // Subdivide long simplified segments to retain local width changes.
    const samples = [line[0]];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1],
        b = line[i],
        count = Math.max(1, Math.ceil(distance(a, b) / 8));
      for (let j = 1; j <= count; j++) {
        samples.push({
          x: a.x + (b.x - a.x) * j / count,
          y: a.y + (b.y - a.y) * j / count,
        });
      }
    }
    const points = samples.map((p) => ({
      x: (p.x + 0.5) / transform.scaleX + transform.offsetX,
      y: (p.y + 0.5) / transform.scaleY + transform.offsetY,
      width:
        (getStrokeWidth(p.x, p.y, dt, width) * 1.12 + 2) / transform.scaleX +
        (style.stroke !== "none" ? style.strokeWidth * matrixScale : 0),
    }));
    strokes.push({
      points,
      length: Math.max(pathLength(points), points[0].width * 0.5),
    });
  }
  // Top-to-bottom for disconnected bars, left-to-right for comparable starts.
  strokes.sort((a, b) =>
    a.points[0].y - b.points[0].y || a.points[0].x - b.points[0].x
  );
  return strokes.length
    ? { kind: "skeleton", strokes }
    : { kind: "wipe", strokes: [], fallback: "no-centerline" };
}

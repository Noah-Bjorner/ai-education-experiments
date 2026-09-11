import type { Shape } from "./shapes.ts";

type Point = { x: number; y: number };
type FillShape = Exclude<Shape, { type: "line" }>;
/** Clockwise SVG angles in radians; end must be after start, at most one turn. */
export type FillSector = { startAngle: number; endAngle: number };
export type HatchStroke = { start: Point; c1: Point; c2: Point; end: Point };
const TAU = Math.PI * 2;
const EPSILON = 1e-8;
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;

function inSector(angle: number, sector: FillSector): boolean {
  const relative = ((angle - sector.startAngle) % TAU + TAU) % TAU;
  return relative <= sector.endAngle - sector.startAngle + EPSILON;
}

/** Intersect an infinite line (unit direction) with the nominal shape before adding pen wobble.
 * A sector over 180 degrees can produce two separate visible segments.
 */
export function hatchIntervals(
  shape: FillShape,
  origin: Point,
  direction: Point,
  sector?: FillSector,
): [number, number][] {
  if (shape.type === "rectangle") {
    let low = -Infinity;
    let high = Infinity;
    for (
      const [start, delta, min, max] of [
        [origin.x, direction.x, shape.x, shape.x + shape.width],
        [origin.y, direction.y, shape.y, shape.y + shape.height],
      ]
    ) {
      if (Math.abs(delta) < EPSILON) {
        if (start < min || start > max) return [];
      } else {
        const a = (min - start) / delta;
        const b = (max - start) / delta;
        low = Math.max(low, Math.min(a, b));
        high = Math.min(high, Math.max(a, b));
      }
    }
    return high - low > EPSILON ? [[low, high]] : [];
  }

  if (shape.type === "ellipse") {
    const x = (origin.x - shape.cx) / shape.rx,
      y = (origin.y - shape.cy) / shape.ry;
    const dx = direction.x / shape.rx, dy = direction.y / shape.ry;
    const a = dx * dx + dy * dy, b = x * dx + y * dy;
    const discriminant = b * b - a * (x * x + y * y - 1);
    if (discriminant <= 0) return [];
    return [[
      (-b - Math.sqrt(discriminant)) / a,
      (-b + Math.sqrt(discriminant)) / a,
    ]];
  }
  const local = { x: origin.x - shape.cx, y: origin.y - shape.cy };
  const along = dot(local, direction);
  const discriminant = along * along - dot(local, local) + shape.r ** 2;
  if (discriminant <= EPSILON) return [];
  const low = -along - Math.sqrt(discriminant);
  const high = -along + Math.sqrt(discriminant);
  if (!sector) return [[low, high]];

  // Split the circle chord wherever it crosses either radial edge. Testing the
  // midpoint of each interval also handles major slices and wrapped angles.
  const cuts = [low, high];
  for (const angle of [sector.startAngle, sector.endAngle]) {
    const ray = { x: Math.cos(angle), y: Math.sin(angle) };
    const cross = direction.x * ray.y - direction.y * ray.x;
    if (Math.abs(cross) < EPSILON) continue;
    const t = (local.y * ray.x - local.x * ray.y) / cross;
    const radial = dot({
      x: local.x + direction.x * t,
      y: local.y + direction.y * t,
    }, ray);
    if (
      t > low && t < high && radial >= -EPSILON && radial <= shape.r + EPSILON
    ) {
      cuts.push(t);
    }
  }
  cuts.sort((a, b) => a - b);
  const intervals: [number, number][] = [];
  for (let i = 1; i < cuts.length; i++) {
    const a = cuts[i - 1];
    const b = cuts[i];
    if (b - a <= EPSILON) continue;
    const mid = (a + b) / 2;
    if (
      inSector(
        Math.atan2(local.y + direction.y * mid, local.x + direction.x * mid),
        sector,
      )
    ) {
      intervals.push([a, b]);
    }
  }
  return intervals;
}

/** Generate only the strokes intersecting this region, with independently
 * shortened ends. SVG clipping remains a guard for curves near rough borders.
 */
export function hatchStrokes(
  shape: FillShape,
  roughness: number,
  gap: number,
  random: () => number,
  sector?: FillSector,
): HatchStroke[] {
  if (
    sector && (shape.type !== "circle" ||
      !Number.isFinite(sector.startAngle) ||
      !Number.isFinite(sector.endAngle) ||
      sector.endAngle <= sector.startAngle ||
      sector.endAngle - sector.startAngle > TAU + EPSILON)
  ) {
    throw new Error(
      "Fill sectors require a circle and a positive angle span of at most one turn.",
    );
  }
  // Continuous from zero: the default 1.5 gives ±5.7 degrees and ±15% spacing.
  // Cap broad variation for loose sketches so strokes cannot bunch excessively.
  const variation = Math.min(roughness / 1.5, 2);
  const angle = -Math.PI / 4 + (random() * 2 - 1) * 0.1 * variation;
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const normal = { x: -direction.y, y: direction.x };
  const center = shape.type !== "rectangle"
    ? { x: shape.cx, y: shape.cy }
    : { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
  let projections: number[];
  if (shape.type === "rectangle") {
    projections = [-1, 1].flatMap((x) =>
      [-1, 1].map((y) =>
        x * normal.x * shape.width / 2 + y * normal.y * shape.height / 2
      )
    );
  } else if (shape.type === "ellipse") {
    const extent = Math.hypot(shape.rx * normal.x, shape.ry * normal.y);
    projections = [-extent, extent];
  } else if (sector) {
    const normalAngle = Math.atan2(normal.y, normal.x);
    const angles = [
      sector.startAngle,
      sector.endAngle,
      ...[normalAngle, normalAngle + Math.PI].filter((a) =>
        inSector(a, sector)
      ),
    ];
    projections = [
      0,
      ...angles.map((a) => shape.r * Math.cos(a - normalAngle)),
    ];
  } else {
    projections = [-shape.r, shape.r];
  }
  const min = Math.min(...projections);
  const max = Math.max(...projections);
  const strokes: HatchStroke[] = [];
  for (
    let distance = min + gap / 2 +
      (random() - 0.5) * gap * Math.min(variation, 1);
    distance < max;
    distance += gap * (1 + (random() * 2 - 1) * 0.15 * variation)
  ) {
    const origin = {
      x: center.x + normal.x * distance,
      y: center.y + normal.y * distance,
    };
    const at = (t: number): Point => ({
      x: origin.x + direction.x * t,
      y: origin.y + direction.y * t,
    });
    for (
      const [low, high] of hatchIntervals(shape, origin, direction, sector)
    ) {
      const length = high - low;
      // Cap each inset at 20% of the segment so tiny regions keep their strokes.
      const inset = () =>
        Math.min(length * 0.2, roughness * (0.25 + random() * 2));
      const start = at(low + inset());
      const end = at(high - inset());
      const control = (fraction: number): Point => {
        const bend = (random() * 2 - 1) * Math.min(roughness, length * 0.1);
        return {
          x: start.x + (end.x - start.x) * fraction + normal.x * bend,
          y: start.y + (end.y - start.y) * fraction + normal.y * bend,
        };
      };
      strokes.push({ start, c1: control(1 / 3), c2: control(2 / 3), end });
    }
  }
  return strokes;
}

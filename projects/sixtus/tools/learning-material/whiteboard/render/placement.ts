import { type Bounds, type Point } from "./bounds.ts";
import type { RenderObstacle } from "./targets.ts";

export const center = (b: Bounds): Point => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const inflate = (b: Bounds, n: number): Bounds => ({
  x: b.x - n,
  y: b.y - n,
  width: b.width + 2 * n,
  height: b.height + 2 * n,
});
export const overlaps = (a: Bounds, b: Bounds) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height &&
  a.y + a.height > b.y;
export const contains = (b: Bounds, p: Point) =>
  p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height;

/** Segment/rectangle intersection, including horizontal and vertical segments. */
export function segmentHitsBox(a: Point, b: Point, box: Bounds): boolean {
  let lo = 0, hi = 1;
  for (
    const [origin, delta, min, max] of [
      [a.x, b.x - a.x, box.x, box.x + box.width],
      [a.y, b.y - a.y, box.y, box.y + box.height],
    ]
  ) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < min || origin > max) return false;
    } else {
      const t1 = (min - origin) / delta, t2 = (max - origin) / delta;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
      if (lo > hi) return false;
    }
  }
  return true;
}

function pointSegmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function segmentsDistance(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c),
    abD = cross(a, b, d),
    cdA = cross(c, d, a),
    cdB = cross(c, d, b);
  if (
    ((abC < 0 && abD > 0) || (abC > 0 && abD < 0)) &&
    ((cdA < 0 && cdB > 0) || (cdA > 0 && cdB < 0))
  ) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

export function obstacleHitsBox(
  o: RenderObstacle,
  box: Bounds,
  clearance = 0,
): boolean {
  const b = inflate(box, clearance);
  if (o.segment) return segmentHitsBox(o.segment.a, o.segment.b, b);
  if (o.circle) {
    const { cx, cy, r } = o.circle;
    const x = Math.max(b.x, Math.min(cx, b.x + b.width));
    const y = Math.max(b.y, Math.min(cy, b.y + b.height));
    return Math.hypot(x - cx, y - cy) < r;
  }
  return overlaps(o.bounds, b);
}

export function segmentHitsObstacle(
  a: Point,
  b: Point,
  o: RenderObstacle,
  clearance: number,
): boolean {
  if (o.segment) {
    return segmentsDistance(a, b, o.segment.a, o.segment.b) < clearance;
  }
  if (o.circle) {
    return pointSegmentDistance({ x: o.circle.cx, y: o.circle.cy }, a, b) <
      o.circle.r + clearance;
  }
  return segmentHitsBox(a, b, inflate(o.bounds, clearance));
}

/** A point outside the box on the ray toward another point. */
export function port(box: Bounds, toward: Point, gap: number): Point {
  const c = center(box), dx = toward.x - c.x, dy = toward.y - c.y;
  const length = Math.hypot(dx, dy) || 1;
  const t = Math.min(
    dx ? box.width / 2 / Math.abs(dx) : Infinity,
    dy ? box.height / 2 / Math.abs(dy) : Infinity,
  );
  if (!Number.isFinite(t)) return { x: c.x + box.width / 2 + gap, y: c.y };
  return {
    x: c.x + dx * t + dx / length * gap,
    y: c.y + dy * t + dy / length * gap,
  };
}

export const routeLength = (points: Point[]) =>
  points.slice(1).reduce((total, p, i) => total + distance(points[i], p), 0);
export function simplifyRoute(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const p of points) {
    if (result.length && distance(result.at(-1)!, p) < 0.01) continue;
    while (result.length > 1) {
      const a = result.at(-2)!, b = result.at(-1)!;
      const cross = (b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x);
      if (
        Math.abs(cross) > 0.01 ||
        (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y) < 0
      ) break;
      result.pop();
    }
    result.push(p);
  }
  return result;
}

export function clearRoute(
  points: Point[],
  obstacles: RenderObstacle[],
  clearance: number,
): boolean {
  return points.slice(1).every((p, i) =>
    obstacles.every((o) => !segmentHitsObstacle(points[i], p, o, clearance))
  );
}

export function routeScore(
  points: Point[],
  soft: RenderObstacle[],
  clearance: number,
) {
  return routeLength(points) + Math.max(0, points.length - 2) * 24 +
    points.slice(1).reduce(
      (sum, p, i) =>
        sum +
        soft.filter((o) => segmentHitsObstacle(points[i], p, o, clearance))
            .length * 160,
      0,
    );
}

/** Prefer direct or one-bend routes. Visibility routing is the bounded fallback. */
export function routeConnector(
  start: Point,
  end: Point,
  hard: RenderObstacle[],
  soft: RenderObstacle[],
  clearance: number,
  detailed = false,
): Point[] | null {
  const candidates = [
    [start, end],
    [start, { x: start.x, y: end.y }, end],
    [start, { x: end.x, y: start.y }, end],
  ].map(simplifyRoute).filter((p) => clearRoute(p, hard, clearance));
  if (candidates.length) {
    return candidates.sort((a, b) =>
      routeScore(a, soft, clearance) - routeScore(b, soft, clearance)
    )[0];
  }
  if (!detailed) return null;

  // Corners of nearby obstacles form a visibility graph. Keep all obstacles in
  // collision checks even when their corners are outside this search window.
  const search: Bounds = inflate({
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y),
  }, 160);
  const nearby = hard.filter((o) => overlaps(o.bounds, search)).sort((a, b) =>
    distance(center(a.bounds), start) - distance(center(b.bounds), start)
  ).slice(0, 48);
  const vertices: Point[] = [start, end];
  for (const obstacle of nearby) {
    const b = inflate(obstacle.bounds, clearance + 2);
    for (
      const p of [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y }, {
        x: b.x,
        y: b.y + b.height,
      }, { x: b.x + b.width, y: b.y + b.height }]
    ) {
      if (!hard.some((o) => segmentHitsObstacle(p, p, o, clearance))) {
        vertices.push(p);
      }
    }
  }
  const costs = vertices.map(() => Infinity),
    previous = vertices.map(() => -1),
    visited = new Set<number>();
  costs[0] = 0;
  while (visited.size < vertices.length) {
    let current = -1;
    for (let i = 0; i < vertices.length; i++) {
      if (
        !visited.has(i) && Number.isFinite(costs[i]) &&
        (current < 0 || costs[i] < costs[current])
      ) current = i;
    }
    if (current < 0) break;
    if (current === 1) {
      const path: Point[] = [];
      for (let i = 1; i >= 0; i = previous[i]) path.unshift(vertices[i]);
      return simplifyRoute(path);
    }
    visited.add(current);
    for (let next = 0; next < vertices.length; next++) {
      if (visited.has(next) || next === current) continue;
      const segment = [vertices[current], vertices[next]];
      const cost = costs[current] + routeScore(segment, soft, clearance) +
        (current ? 24 : 0);
      if (cost >= costs[next] || !clearRoute(segment, hard, clearance)) {
        continue;
      }
      costs[next] = cost;
      previous[next] = current;
    }
  }
  return null;
}

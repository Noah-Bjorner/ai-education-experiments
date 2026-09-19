import type { Bounds, Point } from "./bounds.ts";

export type MarkerCurve = [Point, Point, Point, Point];
const format = (p: Point) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;

/** One ink silhouette around the original gesture; never a second pen pass. */
export function markerOutline(
  curves: MarkerCurve[],
  closed: boolean,
  width: number,
  roughness: number,
  seed: number,
): { d: string; bounds: Bounds; brushWidth: number } {
  const samples: Point[] = [];
  for (const [a, b, c, d] of curves) {
    const length = Math.hypot(b.x - a.x, b.y - a.y) +
      Math.hypot(c.x - b.x, c.y - b.y) + Math.hypot(d.x - c.x, d.y - c.y);
    const count = Math.max(4, Math.min(512, Math.ceil(length / 3)));
    if (!samples.length) samples.push(a);
    for (let i = 1; i <= count; i++) {
      const t = i / count, u = 1 - t;
      const p = {
        x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x +
          t ** 3 * d.x,
        y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y +
          t ** 3 * d.y,
      };
      const previous = samples.at(-1)!;
      if (Math.hypot(p.x - previous.x, p.y - previous.y) > 1e-6) {
        samples.push(p);
      }
    }
  }
  if (closed && samples.length > 1) samples.pop();
  const lengths = [0];
  for (let i = 1; i < samples.length; i++) {
    lengths.push(
      lengths[i - 1] + Math.hypot(
        samples[i].x - samples[i - 1].x,
        samples[i].y - samples[i - 1].y,
      ),
    );
  }
  const first = samples[0], last = samples.at(-1)!;
  const total = lengths.at(-1)! +
    (closed ? Math.hypot(last.x - first.x, last.y - first.y) : 0);
  // Low-frequency variation belongs to distance along the gesture, not vertices
  // or frames. Periodic waves meet seamlessly on closed shapes.
  // Mix adjacent seeds so neighboring marks do not share the same width pattern.
  let mixed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  const phase = ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296 * Math.PI * 2;
  const variation = Math.min(0.22, roughness * 0.065);
  const radii = lengths.map((length) => {
    const t = total ? length / total : 0;
    const drift = 0.65 * Math.sin(t * Math.PI * 4 + phase) +
      0.35 * Math.sin(t * Math.PI * 6 + phase * 1.7);
    const contact = closed
      ? 0
      : 0.3 * Math.exp(-t / 0.06) - 0.35 * Math.exp(-(1 - t) / 0.08);
    return width / 2 * (1 + variation * (drift + contact));
  });
  const left: Point[] = [], right: Point[] = [];
  let maxRadius = 0;
  const normal = (a: Point, b: Point) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  };
  samples.forEach((p, i) => {
    const previous = samples[i - 1] ?? (closed ? last : p);
    const next = samples[i + 1] ?? (closed ? first : p);
    const incoming = i === 0 && !closed ? normal(p, next) : normal(previous, p);
    const outgoing = i === samples.length - 1 && !closed
      ? incoming
      : normal(p, next);
    const sum = { x: incoming.x + outgoing.x, y: incoming.y + outgoing.y };
    const magnitude = Math.hypot(sum.x, sum.y) || 1;
    const n = { x: sum.x / magnitude, y: sum.y / magnitude };
    // A bounded join keeps corners full without sharp miter spikes.
    const radius = radii[i] /
      Math.max(0.72, n.x * outgoing.x + n.y * outgoing.y);
    maxRadius = Math.max(maxRadius, radius);
    left.push({ x: p.x + n.x * radius, y: p.y + n.y * radius });
    right.push({ x: p.x - n.x * radius, y: p.y - n.y * radius });
  });
  const cap = (p: Point, from: Point, radius: number) => {
    const angle = Math.atan2(from.y - p.y, from.x - p.x);
    return Array.from({ length: 10 }, (_, i) => {
      const t = angle - (i + 1) / 10 * Math.PI;
      return { x: p.x + Math.cos(t) * radius, y: p.y + Math.sin(t) * radius };
    });
  };
  const path = (points: Point[]) => `M ${points.map(format).join(" L ")} Z`;
  const outline = closed ? [...left, ...right] : [
    ...left,
    ...cap(last, left.at(-1)!, radii.at(-1)!),
    ...right.toReversed(),
    ...cap(first, right[0], radii[0]),
  ];
  const xs = outline.map((p) => Number(p.x.toFixed(2)));
  const ys = outline.map((p) => Number(p.y.toFixed(2)));
  const x = Math.min(...xs), y = Math.min(...ys);
  return {
    d: closed ? `${path(left)} ${path(right.toReversed())}` : path(outline),
    bounds: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y },
    brushWidth: maxRadius * 2 + 0.6,
  };
}

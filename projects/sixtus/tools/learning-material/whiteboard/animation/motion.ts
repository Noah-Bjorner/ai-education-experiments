import { distance, type Point } from "./geometry.ts";
import type { Stroke } from "./stroke-plan.ts";

export type MarkMotion = "natural" | "linear";

/** Weight in the scheduler's 100 units/second scale. Long gestures move faster. */
export function markWeight(length: number): number {
  return 8 + 38 * Math.sqrt(Math.max(0, length) / 100);
}

/** Repositioning is bounded so distant marks do not create long dead time. */
export function penLift(base: number, from?: Point, to?: Point): number {
  return from && to
    ? base * (1 + Math.min(3, Math.sqrt(distance(from, to) / 40)))
    : base;
}

export type MotionProfile = { positions: number[]; times: number[] };

/**
 * A distance-to-time map, sampled by arc length rather than SVG vertex count.
 * Slow gently at contact/lift and around turns. No randomness or frame state:
 * the same artwork and seek time always produce the same ink.
 */
export function strokeMotion(stroke: Stroke): MotionProfile {
  const points = stroke.points;
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
  }
  const total = lengths.at(-1)!;
  if (!total) return { positions: [0, 1], times: [0, 1] };
  const count = 64;
  const samples: Point[] = [];
  let segment = 1;
  for (let i = 0; i <= count; i++) {
    const at = total * i / count;
    while (segment < points.length - 1 && lengths[segment] < at) segment++;
    const a = points[segment - 1], b = points[segment];
    const span = lengths[segment] - lengths[segment - 1];
    const t = span ? (at - lengths[segment - 1]) / span : 0;
    samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  const turns = samples.map((p, i) => {
    if (!i || i === count) return 0;
    const a = samples[i - 1], b = samples[i + 1];
    const denominator = distance(a, p) * distance(p, b);
    return denominator > 1e-10
      ? Math.max(
        0,
        1 - ((p.x - a.x) * (b.x - p.x) +
              (p.y - a.y) * (b.y - p.y)) / denominator,
      )
      : 0;
  });
  const cost = samples.map((_, i) => {
    const u = i / count;
    const turn = turns[i] + 0.6 * ((turns[i - 1] ?? 0) + (turns[i + 1] ?? 0));
    return 1 + 1.6 * Math.exp(-u / 0.065) +
      1.3 * Math.exp(-(1 - u) / 0.085) + 3 * turn;
  });
  const elapsed = [0];
  for (let i = 1; i <= count; i++) {
    elapsed.push(elapsed[i - 1] + (cost[i - 1] + cost[i]) / 2);
  }
  const duration = elapsed.at(-1)!;
  return {
    positions: samples.map((_, i) => i / count),
    times: elapsed.map((t) => t / duration),
  };
}

export function timeAt(profile: MotionProfile, position: number): number {
  const index = Math.min(
    profile.positions.length - 2,
    Math.max(0, Math.floor(position * (profile.positions.length - 1))),
  );
  const a = profile.positions[index], b = profile.positions[index + 1];
  return profile.times[index] +
    (profile.times[index + 1] - profile.times[index]) *
      (position - a) / (b - a);
}

/** Slice one continuous motion profile for the variable-width skeleton brushes. */
export function motionSlice(profile: MotionProfile, from: number, to: number) {
  const start = timeAt(profile, from), end = timeAt(profile, to);
  const positions = [
    from,
    ...profile.positions.filter((p) => p > from && p < to),
    to,
  ];
  return {
    start,
    duration: end - start,
    values: positions.map((p) => 1 - (p - from) / (to - from)),
    times: positions.map((p) => (timeAt(profile, p) - start) / (end - start)),
  };
}

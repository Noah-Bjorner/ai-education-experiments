import {
  type CoordinateExpression,
  parseCoordinateExpression,
} from "../figures/coordinate-expression.ts";
import type { Bounds, Point } from "./bounds.ts";

/** Compile the validated AST to closures, never to JavaScript source. */
export function compileCoordinateExpression(
  source: string,
): (x: number) => number {
  function compile(node: CoordinateExpression): (x: number) => number {
    switch (node.type) {
      case "number":
        return () => node.value;
      case "symbol":
        return node.name === "x"
          ? (x) => x
          : () => node.name === "pi" ? Math.PI : Math.E;
      case "unary": {
        const f = compile(node.operand);
        return node.operator === "-" ? (x) => -f(x) : f;
      }
      case "binary": {
        const a = compile(node.left), b = compile(node.right);
        return (x) => {
          const left = a(x), right = b(x);
          // JavaScript makes NaN**0 and Infinity**0 equal 1. In a plot,
          // an undefined subexpression must never regain a real value.
          if (!Number.isFinite(left) || !Number.isFinite(right)) return NaN;
          switch (node.operator) {
            case "+":
              return left + right;
            case "-":
              return left - right;
            case "*":
              return left * right;
            case "/":
              return right === 0 ? NaN : left / right;
            case "^":
              return left === 0 && right === 0 ? NaN : left ** right;
          }
        };
      }
      case "call": {
        const functions: Record<string, (x: number) => number> = {
          sqrt: Math.sqrt,
          abs: Math.abs,
          sin: Math.sin,
          cos: Math.cos,
          tan: (x) => Math.abs(Math.cos(x)) < 1e-15 ? NaN : Math.tan(x),
          exp: Math.exp,
          ln: Math.log,
          log10: Math.log10,
        };
        const f = functions[node.name], argument = compile(node.argument);
        if (!f) {
          throw new Error(`Unsupported coordinate function '${node.name}'.`);
        }
        return (x) => {
          const value = argument(x);
          return Number.isFinite(value) ? f(value) : NaN;
        };
      }
    }
    throw new Error("Unsupported coordinate expression.");
  }
  return compile(parseCoordinateExpression(source));
}

/** Parametric slab clipping handles vertical/horizontal segments, rays, and lines. */
export function clipCoordinateLine(
  a: Point,
  b: Point,
  box: Bounds,
  extend = "neither",
): [Point, Point] | null {
  let lo = extend === "start" || extend === "both" ? -Infinity : 0;
  let hi = extend === "end" || extend === "both" ? Infinity : 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  if (![a.x, a.y, b.x, b.y, dx, dy].every(Number.isFinite)) return null;
  for (
    const [origin, delta, min, max] of [
      [a.x, dx, box.x, box.x + box.width],
      [a.y, dy, box.y, box.y + box.height],
    ]
  ) {
    if (delta === 0) {
      if (origin < min || origin > max) return null;
    } else {
      const t1 = (min - origin) / delta, t2 = (max - origin) / delta;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
      if (lo > hi) return null;
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return [{ x: a.x + lo * dx, y: a.y + lo * dy }, {
    x: a.x + hi * dx,
    y: a.y + hi * dy,
  }];
}

/** Adaptive, bounded screen-space sampling. Unresolved intervals become gaps.
 * Quarter-point probes reduce aliasing; this is numerical plotting, not a
 * symbolic proof of continuity or a guarantee to find arbitrarily tiny features.
 */
export function sampleCoordinateFunction(
  f: (x: number) => number,
  min: number,
  max: number,
  project: (x: number, y: number) => Point,
  box: Bounds,
): [Point, Point][] {
  const segments: [Point, Point][] = [];
  let evaluations = 0;
  const at = (x: number) => {
    if (++evaluations > 80000) {
      throw new Error(
        "Function sampling budget exceeded; narrow the coordinate window or simplify the expression.",
      );
    }
    return project(x, f(x));
  };
  const finite = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);
  function visit(x0: number, x1: number, a: Point, b: Point, depth: number) {
    const xs = [x0 + (x1 - x0) / 4, x0 + (x1 - x0) / 2, x0 + 3 * (x1 - x0) / 4];
    const probes = xs.map(at);
    const points = [a, ...probes, b];
    if (points.every((p) => !finite(p))) return;
    // Do not spend the budget resolving an asymptote entirely beyond the window.
    if (
      points.every((p) => finite(p) && p.y < box.y - box.height) ||
      points.every((p) => finite(p) && p.y > box.y + 2 * box.height)
    ) return;
    const error = points.every(finite)
      ? Math.max(
        ...probes.map((p, i) =>
          Math.abs(p.y - (a.y + (b.y - a.y) * (i + 1) / 4))
        ),
      )
      : Infinity;
    if (error <= 0.3) {
      const clipped = clipCoordinateLine(a, b, box);
      if (clipped) segments.push(clipped);
    } else if (depth < 10 && xs[1] !== x0 && xs[1] !== x1) {
      visit(x0, xs[1], a, probes[1], depth + 1);
      visit(xs[1], x1, probes[1], b, depth + 1);
    }
  }
  if (!(min < max)) return segments;
  const count = Math.max(128, Math.ceil(box.width / 2));
  let x0 = min, a = at(min);
  for (let i = 1; i <= count; i++) {
    const x1 = i === count ? max : min + (max - min) * i / count;
    const b = at(x1);
    visit(x0, x1, a, b, 0);
    x0 = x1;
    a = b;
  }
  return segments;
}

/** Estimate a finite one-sided limit from inside the specified interval.
 * An endpoint value alone is insufficient: sqrt(-x) exists at zero but has
 * no real right-hand branch. Avoid drawing a ghost open marker in that case.
 */
export function coordinateEndpointValue(
  f: (x: number) => number,
  x: number,
  direction: number,
  span: number,
  tolerance: number,
): number | null {
  if (!(span > 0) || !Number.isFinite(span)) return null;
  const values = [1e-5, 1e-6, 1e-7].map((step) =>
    f(x + direction * span * step)
  );
  if (!values.every(Number.isFinite)) return null;
  const exact = f(x);
  // Supported primitives are continuous at their defined real values. Checking
  // the inside probes first rules out an endpoint with no real inside branch,
  // while retaining steep continuous endpoints such as sqrt(x) at zero.
  if (Number.isFinite(exact)) return exact;
  if (
    Math.abs(values[2] - values[1]) > tolerance ||
    Math.abs(values[1] - values[0]) > tolerance * 10
  ) return null;
  return values[2];
}

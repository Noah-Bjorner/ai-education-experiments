/** Visible bounds in the same coordinate system as the SVG markup. */
export type Bounds = { x: number; y: number; width: number; height: number };
export type Drawing = { markup: string; bounds: Bounds | null };
export type Point = { x: number; y: number };

/** Null represents no painted content, such as a definition or empty text. */
export function unionBounds(items: (Bounds | null)[]): Bounds | null {
  const visible = items.filter((b): b is Bounds => b !== null);
  if (!visible.length) return null;
  const x = Math.min(...visible.map((b) => b.x));
  const y = Math.min(...visible.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...visible.map((b) => b.x + b.width)) - x,
    height: Math.max(...visible.map((b) => b.y + b.height)) - y,
  };
}

export function expandBounds(b: Bounds | null, amount: number): Bounds | null {
  return b &&
    {
      x: b.x - amount,
      y: b.y - amount,
      width: b.width + 2 * amount,
      height: b.height + 2 * amount,
    };
}

/** Round outward at subpixel precision, without adding presentation padding. */
export function exportBounds(b: Bounds | null): Bounds {
  if (
    !b || !Object.values(b).every(Number.isFinite) || b.width <= 0 ||
    b.height <= 0
  ) {
    throw new Error("Cannot export empty or invalid drawing bounds.");
  }
  const x = Math.floor(b.x * 1000) / 1000;
  const y = Math.floor(b.y * 1000) / 1000;
  const right = Math.ceil((b.x + b.width) * 1000) / 1000;
  const bottom = Math.ceil((b.y + b.height) * 1000) / 1000;
  return {
    x,
    y,
    width: Number((right - x).toFixed(3)),
    height: Number((bottom - y).toFixed(3)),
  };
}

/** Match SVG transform="translate(x y) rotate(-90)" for vertical labels. */
export function rotateLabel(drawing: Drawing, x: number, y: number): Drawing {
  const b = drawing.bounds;
  return {
    markup:
      `<g transform="translate(${x} ${y}) rotate(-90)">${drawing.markup}</g>`,
    bounds: b &&
      { x: x + b.y, y: y - b.x - b.width, width: b.height, height: b.width },
  };
}

/** Cubic Bezier extrema come from its derivative, not its control-point box. */
export function cubicBounds(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
): Bounds {
  const values = (v0: number, v1: number, v2: number, v3: number) => {
    const a = -v0 + 3 * v1 - 3 * v2 + v3;
    const b = 2 * (v0 - 2 * v1 + v2);
    const c = v1 - v0;
    const roots: number[] = [];
    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) >= 1e-12) roots.push(-c / b);
    } else {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        roots.push(
          (-b + Math.sqrt(discriminant)) / (2 * a),
          (-b - Math.sqrt(discriminant)) / (2 * a),
        );
      }
    }
    return [
      v0,
      v3,
      ...roots.filter((t) => t > 0 && t < 1).map((t) =>
        (1 - t) ** 3 * v0 + 3 * (1 - t) ** 2 * t * v1 +
        3 * (1 - t) * t ** 2 * v2 + t ** 3 * v3
      ),
    ];
  };
  const xs = values(p0.x, p1.x, p2.x, p3.x);
  const ys = values(p0.y, p1.y, p2.y, p3.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

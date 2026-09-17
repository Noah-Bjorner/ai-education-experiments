// deno-lint-ignore no-import-prefix
import svgpath from "npm:svgpath@2.6.0";

export type Point = { x: number; y: number };
export type BBox = { x1: number; y1: number; x2: number; y2: number };
export type Box = { x: number; y: number; width: number; height: number };
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const pathLength = (points: Point[]) =>
  points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
export const pathData = (points: Point[]) =>
  points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(4)} ${p.y.toFixed(4)}`)
    .join("");
export const transformPoint = (p: Point, m: DOMMatrix): Point => ({
  x: m.a * p.x + m.c * p.y + m.e,
  y: m.b * p.x + m.d * p.y + m.f,
});

/** Convert supported SVG primitives to equivalent path geometry, leaving artwork intact. */
export function elementPath(element: Element): string {
  const n = (key: string, fallback = 0) =>
    Number(element.getAttribute(key) ?? fallback);
  switch (element.localName) {
    case "path":
      return element.getAttribute("d") ?? "";
    case "line":
      return `M${n("x1")} ${n("y1")}L${n("x2")} ${n("y2")}`;
    case "circle":
    case "ellipse": {
      const rx = n(element.localName === "circle" ? "r" : "rx"),
        ry = n(element.localName === "circle" ? "r" : "ry");
      if (rx <= 0 || ry <= 0) return "";
      return `M${n("cx")} ${n("cy") - ry}a${rx} ${ry} 0 1 1 0 ${
        2 * ry
      }a${rx} ${ry} 0 1 1 0 ${-2 * ry}Z`;
    }
    case "rect": {
      const x = n("x"), y = n("y"), w = n("width"), h = n("height");
      if (w <= 0 || h <= 0) return "";
      const rx = Math.min(w / 2, Math.max(0, n("rx", n("ry")))),
        ry = Math.min(h / 2, Math.max(0, n("ry", n("rx"))));
      if (!rx || !ry) return `M${x} ${y}h${w}v${h}h${-w}Z`;
      return `M${x + rx} ${y}h${w - 2 * rx}a${rx} ${ry} 0 0 1 ${rx} ${ry}v${
        h - 2 * ry
      }a${rx} ${ry} 0 0 1 ${-rx} ${ry}h${
        2 * rx - w
      }a${rx} ${ry} 0 0 1 ${-rx} ${-ry}v${
        2 * ry - h
      }a${rx} ${ry} 0 0 1 ${rx} ${-ry}Z`;
    }
    case "polyline":
    case "polygon": {
      const points = element.getAttribute("points")?.trim();
      return points
        ? `M${points}${element.localName === "polygon" ? "Z" : ""}`
        : "";
    }
    default:
      return "";
  }
}

/** Flatten in local coordinates. Control-polygon flatness handles S-curves. */
export function flatten(d: string, tolerance: number): Point[][] {
  const parsed = svgpath(d).abs().unshort().unarc() as
    & ReturnType<typeof svgpath>
    & { err: string };
  if (parsed.err) throw new Error(`Invalid SVG path: ${parsed.err}`);
  const paths: Point[][] = [];
  let points: Point[] = [], cursor = { x: 0, y: 0 }, start = cursor;
  const mid = (a: Point, b: Point): Point => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  function curve(p: Point[], depth = 0) {
    const first = p[0], last = p[p.length - 1];
    if (
      depth >= 16 || pathLength(p) - distance(first, last) <= tolerance * 0.25
    ) {
      points.push(last);
      return;
    }
    const left = [first], right = [last];
    let row = p;
    while (row.length > 1) {
      row = row.slice(1).map((v, i) => mid(row[i], v));
      left.push(row[0]);
      right.unshift(row[row.length - 1]);
    }
    curve(left, depth + 1);
    curve(right, depth + 1);
  }
  parsed.iterate((segment) => {
    const [command, ...values] = segment;
    const v = values as number[];
    const end = { x: v[v.length - 2], y: v[v.length - 1] };
    switch (command) {
      case "M":
        if (points.length) paths.push(points);
        points = [end];
        start = end;
        cursor = end;
        break;
      case "L":
        points.push(end);
        cursor = end;
        break;
      case "H":
        cursor = { x: v[0], y: cursor.y };
        points.push(cursor);
        break;
      case "V":
        cursor = { x: cursor.x, y: v[0] };
        points.push(cursor);
        break;
      case "Q":
        curve([cursor, { x: v[0], y: v[1] }, end]);
        cursor = end;
        break;
      case "C":
        curve([cursor, { x: v[0], y: v[1] }, { x: v[2], y: v[3] }, end]);
        cursor = end;
        break;
      case "Z":
        points.push(start);
        cursor = start;
        break;
      default:
        throw new Error(`Unsupported path command: ${command}`);
    }
  });
  if (points.length) paths.push(points);
  if (
    paths.some((p) =>
      p.some((v) => !Number.isFinite(v.x) || !Number.isFinite(v.y))
    )
  ) throw new Error("Non-finite SVG geometry");
  return paths;
}

import { type Geometry, geometrySchema } from "../children/geometry.ts";
import {
  type GeometryPoint,
  resolveGeometry,
} from "../children/geometry-resolver.ts";
import {
  type Bounds,
  type Drawing,
  expandBounds,
  type Point,
  unionBounds,
} from "./bounds.ts";
import {
  fitGraphText,
  GRAPH_FONT_STYLE,
  graphTextBounds,
  measureGraphText,
} from "./font.ts";
import type { GraphOptions } from "./graphs.ts";
import { renderHandwritten } from "./handwritten.ts";
import { renderMathLatex } from "./latex.ts";
import { center, distance, obstacleHitsBox } from "./placement.ts";
import { escapeXml } from "./svg.ts";
import {
  registerTarget,
  type RenderObstacle,
  type RenderTarget,
  type ScenePart,
  type TargetedDrawing,
} from "./targets.ts";
import { COLORS, SERIES_COLORS } from "./theme.ts";

const TAU = 2 * Math.PI;
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
const unit = (v: Point) => mul(v, 1 / (Math.hypot(v.x, v.y) || 1));
const polar = (angle: number): Point => ({
  x: Math.cos(angle),
  y: Math.sin(angle),
});
const box = (ps: Point[]): Bounds => ({
  x: Math.min(...ps.map((p) => p.x)),
  y: Math.min(...ps.map((p) => p.y)),
  width: Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x)),
  height: Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y)),
});
const combine = (parts: ScenePart[]): ScenePart => ({
  markup: parts.map((p) => p.markup).join(""),
  bounds: unionBounds(parts.map((p) => p.bounds)),
  obstacles: parts.flatMap((p) => p.obstacles ?? []),
});
function path(ps: Point[], closed = false, dashed = false): ScenePart {
  const bounds = expandBounds(box(ps), 1)!;
  const edges = ps.slice(1).map((b, i) => ({ a: ps[i], b }));
  if (closed) edges.push({ a: ps.at(-1)!, b: ps[0] });
  return {
    markup: `<path d="M ${ps.map((p) => `${p.x} ${p.y}`).join(" L ")}${
      closed ? " Z" : ""
    }" fill="none" stroke="${COLORS.ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${
      dashed ? ' stroke-dasharray="7 5"' : ""
    }/>`,
    bounds,
    obstacles: edges.map((segment) => ({
      bounds: expandBounds(box([segment.a, segment.b]), 1)!,
      kind: "stroke",
      segment,
    })),
  };
}
function arrow(tip: Point, direction: Point): ScenePart {
  const back = mul(unit(direction), -9),
    normal = { x: -back.y * 0.45, y: back.x * 0.45 };
  return path([add(add(tip, back), normal), tip, sub(add(tip, back), normal)]);
}
function arc(c: Point, r: number, start: number, sweep: number): ScenePart {
  const a = add(c, mul(polar(start), r)),
    b = add(c, mul(polar(start + sweep), r));
  const samples = [a, b];
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2;
    const relative = ((Math.sign(sweep) * (angle - start)) % TAU + TAU) % TAU;
    if (relative <= Math.abs(sweep) + 1e-10) {
      samples.push(add(c, mul(polar(angle), r)));
    }
  }
  // Fine chords provide routing obstacles; analytic extrema determine painted bounds.
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) * r / 6));
  const ps = Array.from(
    { length: steps + 1 },
    (_, i) => add(c, mul(polar(start + sweep * i / steps), r)),
  );
  return {
    markup: `<path d="M ${a.x} ${a.y} A ${r} ${r} 0 ${
      Math.abs(sweep) > Math.PI ? 1 : 0
    } ${
      sweep > 0 ? 1 : 0
    } ${b.x} ${b.y}" fill="none" stroke="${COLORS.ink}" stroke-width="2" stroke-linecap="round"/>`,
    bounds: expandBounds(box(samples), 1),
    obstacles: path(ps).obstacles,
  };
}
function plain(value: string, size: number): Drawing {
  return {
    markup: `<text font-size="${size}" fill="${COLORS.ink}">${
      escapeXml(value)
    }</text>`,
    bounds: graphTextBounds(value, size, 0, 0),
  };
}
function translate(drawing: Drawing, x: number, y: number): Drawing {
  return {
    markup: `<g transform="translate(${x} ${y})">${drawing.markup}</g>`,
    bounds: drawing.bounds &&
      { ...drawing.bounds, x: drawing.bounds.x + x, y: drawing.bounds.y + y },
  };
}
type LabelJob = {
  id: string;
  drawing: Drawing;
  anchor: Point;
  directions: Point[];
  radialOnly?: boolean;
};

/** Exact mathematical outlines, shared handwritten fills, and measured labels.
 * No browser, mutation, network calls, or external assets are needed.
 */
export function renderGeometryDrawing(
  input: Geometry,
  options: GraphOptions,
): TargetedDrawing {
  const spec = geometrySchema.parse(input);
  const width = options.width ?? 800, height = options.height ?? 520;
  const roughness = options.roughness ?? 1.5,
    hatchGap = options.hatchGap ?? 9,
    seed = options.seed ?? 10;
  if (
    !/^[a-zA-Z][\w-]*$/.test(options.id) ||
    ![width, height, roughness, hatchGap, seed].every(Number.isFinite) ||
    width < 320 || height < 280 || roughness < 0 || hatchGap < 2
  ) {
    throw new Error(
      "Geometry needs a simple SVG id, dimensions at least 320 × 280, finite options, roughness >= 0, and hatchGap >= 2.",
    );
  }
  const resolved = resolveGeometry(spec), namespace = spec.id ?? options.id;
  const targets = new Map<string, RenderTarget>(), parts: ScenePart[] = [];
  const jobs: LabelJob[] = [];
  const addPart = (
    id: string,
    drawing: ScenePart,
    kind: "text" | "mark" = "mark",
  ) => {
    const part = registerTarget(targets, `${namespace}.${id}`, drawing, kind);
    parts.push(part);
    return part;
  };
  const title = fitGraphText(spec.title, 25, width - 32);
  addPart("title", {
    ...translate(
      plain(title, 25),
      (width - measureGraphText(title, 25)) / 2,
      38,
    ),
    markup: `<title>${escapeXml(spec.title)}</title>${
      translate(plain(title, 25), (width - measureGraphText(title, 25)) / 2, 38)
        .markup
    }`,
  }, "text");

  const extents = [...resolved.points.values()].map(([x, y]) => ({ x, y }));
  for (const o of resolved.objects.values()) {
    if (o.kind === "circle") {
      extents.push({ x: o.center[0] - o.radius, y: o.center[1] - o.radius }, {
        x: o.center[0] + o.radius,
        y: o.center[1] + o.radius,
      });
    }
  }
  const world = box(extents);
  const viewport: Bounds = {
    x: 64,
    y: 100,
    width: width - 128,
    height: height - 180,
  };
  const span = Math.max(world.width, world.height);
  const sx = viewport.width / (world.width || span || 1),
    sy = viewport.height / (world.height || span || 1);
  const scale = Math.min(sx, sy);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error("Geometry coordinate range cannot be displayed.");
  }
  const project = (p: GeometryPoint): Point => ({
    x: viewport.x + viewport.width / 2 +
      ((p[0] - world.x) - world.width / 2) * scale,
    y: viewport.y + viewport.height / 2 -
      ((p[1] - world.y) - world.height / 2) * scale,
  });
  const points = new Map(
    [...resolved.points].map(([id, p]) => [id, project(p)]),
  );
  const point = (id: string) => points.get(id)!;
  const centroid = center(viewport);
  const anchors = new Map<string, { anchor: Point; directions: Point[] }>();
  const radial = (a: Point) => {
    const v = unit(sub(a, centroid));
    return Math.hypot(v.x, v.y) ? v : { x: 0, y: -1 };
  };
  const sideAnchor = (a: Point, b: Point) => {
    const anchor = mul(add(a, b), 0.5), tangent = unit(sub(b, a));
    let n = { x: -tangent.y, y: tangent.x };
    if (n.x * (anchor.x - centroid.x) + n.y * (anchor.y - centroid.y) < 0) {
      n = mul(n, -1);
    }
    return { anchor, directions: [n, mul(n, -1)] };
  };
  const straightEnds = new Map<string, [Point, Point]>();
  for (const o of spec.objects) {
    const r = resolved.objects.get(o.id)!;
    const local: ScenePart[] = [];
    if (r.kind === "segment" || r.kind === "line" || r.kind === "ray") {
      let a = project(r.a), b = project(r.b);
      if (r.kind !== "segment") {
        const v = sub(b, a);
        let lo = r.kind === "ray" ? 0 : -Infinity, hi = Infinity;
        for (
          const [origin, delta, min, max] of [[
            a.x,
            v.x,
            viewport.x,
            viewport.x + viewport.width,
          ], [a.y, v.y, viewport.y, viewport.y + viewport.height]]
        ) {
          if (Math.abs(delta) < 1e-12) continue;
          const t1 = (min - origin) / delta, t2 = (max - origin) / delta;
          lo = Math.max(lo, Math.min(t1, t2));
          hi = Math.min(hi, Math.max(t1, t2));
        }
        b = add(a, mul(v, hi));
        a = add(a, mul(v, lo));
        local.push(arrow(b, v));
        if (r.kind === "line") local.push(arrow(a, mul(v, -1)));
      }
      local.unshift(path([a, b], false, o.dashed));
      straightEnds.set(o.id, [a, b]);
      anchors.set(o.id, sideAnchor(a, b));
    } else if (r.kind === "polygon" || r.kind === "circle") {
      let clip: string, bounds: Bounds;
      if (r.kind === "polygon") {
        const ps = r.points.map(project);
        bounds = box(ps);
        clip = `<polygon points="${
          ps.map((p) => `${p.x},${p.y}`).join(" ")
        }"/>`;
        local.push(path(ps, true, o.dashed));
        const anchor = { x: bounds.x + bounds.width / 2, y: bounds.y };
        anchors.set(o.id, {
          anchor,
          directions: [{ x: 0, y: -1 }, { x: 1, y: 0 }],
        });
      } else {
        const c = project(r.center), radius = r.radius * scale;
        bounds = {
          x: c.x - radius,
          y: c.y - radius,
          width: radius * 2,
          height: radius * 2,
        };
        clip = `<circle cx="${c.x}" cy="${c.y}" r="${radius}"/>`;
        local.push({
          markup:
            `<circle cx="${c.x}" cy="${c.y}" r="${radius}" fill="none" stroke="${COLORS.ink}" stroke-width="2"${
              o.dashed ? ' stroke-dasharray="7 5"' : ""
            }/>`,
          bounds: expandBounds(bounds, 1),
          obstacles: path(Array.from({ length: 181 }, (_, i) =>
            add(c, mul(polar(i * TAU / 180), radius)))).obstacles,
        });
        anchors.set(o.id, {
          anchor: { x: c.x + radius, y: c.y },
          directions: [{ x: 1, y: 0 }, { x: 1, y: -1 }],
        });
      }
      if ("fill" in o && o.fill) {
        const clipId = `${options.id}-${o.id}-region`;
        const fill = renderHandwritten(
          r.kind === "circle"
            ? {
              type: "circle",
              cx: bounds.x + bounds.width / 2,
              cy: bounds.y + bounds.height / 2,
              r: bounds.width / 2,
            }
            : { type: "rectangle", ...bounds },
          {
            id: `${options.id}-${o.id}-hatch`,
            seed,
            roughness,
            hatchGap,
            stroke: "none",
            fill: SERIES_COLORS[0],
          },
        );
        local.unshift({
          markup:
            `<defs><clipPath id="${clipId}">${clip}</clipPath></defs><g clip-path="url(#${clipId})">${fill.markup}</g>`,
          bounds,
          obstacles: [{ kind: "area", bounds }],
        });
      }
    } else if (r.kind === "arc") {
      const c = project(r.circle.center), radius = r.circle.radius * scale;
      const start = -r.startAngle * Math.PI / 180,
        sweep = -r.sweep * Math.PI / 180;
      const drawing = arc(c, radius, start, sweep);
      if (o.dashed) {
        drawing.markup = `<g stroke-dasharray="7 5">${drawing.markup}</g>`;
      }
      local.push(drawing);
      const direction = polar(start + sweep / 2);
      anchors.set(o.id, {
        anchor: add(c, mul(direction, radius)),
        directions: [direction],
      });
    }
    addPart(`${o.id}.mark`, combine(local));
  }
  for (const [id, p] of points) {
    addPart(`${id}.mark`, {
      markup: `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${COLORS.ink}"/>`,
      bounds: { x: p.x - 3, y: p.y - 3, width: 6, height: 6 },
    });
    anchors.set(id, { anchor: p, directions: [radial(p)] });
  }
  // Connected equality/parallel groups share a style, including overlapping declarations.
  function groupStyles(kind: "equal-length" | "parallel") {
    const groups: Set<string>[] = [];
    for (const m of spec.markings) {
      if (m.kind === kind) {
        const merged = new Set(m.objects);
        for (let i = groups.length - 1; i >= 0; i--) {
          if ([...groups[i]].some((id) => merged.has(id))) {
            groups[i].forEach((id) => merged.add(id));
            groups.splice(i, 1);
          }
        }
        groups.push(merged);
      }
    }
    return new Map(
      groups.flatMap((g, i) => [...g].map((id) => [id, i + 1] as const)),
    );
  }
  const equalStyles = groupStyles("equal-length"),
    parallelStyles = groupStyles("parallel");
  const angleStyles = new Map<string, number>();
  for (const m of spec.markings) {
    if (m.kind === "angle" && m.group && !angleStyles.has(m.group)) {
      angleStyles.set(m.group, angleStyles.size + 1);
    }
  }
  for (const m of spec.markings) {
    const local: ScenePart[] = [];
    if (m.kind === "right-angle" || m.kind === "angle") {
      const a = point(m.points[0]),
        v = point(m.points[1]),
        b = point(m.points[2]);
      const u = unit(sub(a, v)), w = unit(sub(b, v));
      const available = Math.min(distance(a, v), distance(b, v));
      const radius = Math.min(
        m.kind === "right-angle" ? 14 : 26,
        available * 0.28,
      );
      if (radius < 5) {
        throw new Error(
          `Marking '${m.id}' is too small to display; increase the board size or simplify the figure.`,
        );
      }
      if (m.kind === "right-angle") {
        local.push(
          path([
            add(v, mul(u, radius)),
            add(v, mul(add(u, w), radius)),
            add(v, mul(w, radius)),
          ]),
        );
        const direction = unit(add(u, w));
        anchors.set(m.id, {
          anchor: add(v, mul(direction, radius * Math.SQRT2)),
          directions: [direction],
        });
      } else {
        const start = Math.atan2(u.y, u.x);
        let sweep = ((Math.atan2(w.y, w.x) - start) % TAU + TAU) % TAU;
        if (sweep > Math.PI) sweep -= TAU;
        if (m.sweep === "reflex") sweep += sweep > 0 ? -TAU : TAU;
        const count = m.group ? angleStyles.get(m.group)! : 1;
        for (let i = 0; i < count; i++) {
          local.push(arc(v, radius + i * 4, start, sweep));
        }
        const direction = polar(start + sweep / 2);
        const placement = {
          anchor: add(v, mul(direction, radius + (count - 1) * 4)),
          directions: [direction],
        };
        anchors.set(m.id, placement);
        if (m.latex) {
          jobs.push({
            id: `${m.id}.label`,
            drawing: math(m.latex, m.id),
            radialOnly: true,
            ...placement,
          });
        }
      }
    } else {
      for (const id of m.objects) {
        const [a, b] = straightEnds.get(id)!;
        let tangent = unit(sub(b, a));
        if (tangent.x < 0 || (Math.abs(tangent.x) < 1e-10 && tangent.y < 0)) {
          tangent = mul(tangent, -1);
        }
        const normal = { x: -tangent.y, y: tangent.x },
          midpoint = add(
            a,
            mul(
              sub(b, a),
              m.kind === "parallel" && equalStyles.has(id) ? 0.65 : 0.5,
            ),
          );
        const count = (m.kind === "equal-length" ? equalStyles : parallelStyles)
          .get(id)!;
        if ((count - 1) * 5 + 14 > distance(a, b)) {
          throw new Error(`Marking '${m.id}' does not fit its segment.`);
        }
        for (let i = 0; i < count; i++) {
          const p = add(midpoint, mul(tangent, (i - (count - 1) / 2) * 5));
          local.push(
            m.kind === "equal-length"
              ? path([add(p, mul(normal, -6)), add(p, mul(normal, 6))])
              : path([
                add(sub(p, mul(tangent, 5)), mul(normal, -5)),
                p,
                add(sub(p, mul(tangent, 5)), mul(normal, 5)),
              ]),
          );
        }
      }
      const first = straightEnds.get(m.objects[0])!;
      anchors.set(m.id, sideAnchor(...first));
    }
    addPart(`${m.id}.mark`, combine(local));
  }
  function math(latex: string, id: string): Drawing {
    try {
      return renderMathLatex(latex, 22);
    } catch (error) {
      throw new Error(
        `Geometry label '${id}': ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
  for (const label of spec.labels) {
    let drawing: Drawing, placement: { anchor: Point; directions: Point[] };
    if (label.kind === "length") {
      placement = sideAnchor(point(label.points[0]), point(label.points[1]));
      if (label.latex) drawing = math(label.latex, label.id);
      else {
        const a = resolved.points.get(label.points[0])!,
          b = resolved.points.get(label.points[1])!;
        const value = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const rounded = Number(value.toFixed(2));
        if (!Number.isFinite(value) || rounded === 0) {
          throw new Error(
            `Length label '${label.id}' cannot be represented at two decimal places; use explicit LaTeX.`,
          );
        }
        drawing = plain(`${rounded}${spec.unit ? ` ${spec.unit}` : ""}`, 22);
      }
    } else {
      placement = anchors.get(label.target)!;
      drawing = math(label.latex, label.id);
    }
    jobs.push({ id: `${label.id}.label`, drawing, ...placement });
  }
  const contentBounds = unionBounds(parts.slice(1).map((p) => p.bounds))!;
  const obstacles: RenderObstacle[] = parts.flatMap((p) => p.obstacles ?? []);
  // Search nearby measured candidates; never hide collisions with an opaque backing.
  for (const job of jobs) {
    const ink = job.drawing.bounds;
    if (!ink) {
      throw new Error(`Geometry label '${job.id}' has no visible content.`);
    }
    const directions = [
      ...job.directions.map(unit),
      ...Array.from(
        { length: job.radialOnly ? 0 : 8 },
        (_, i) => polar(-Math.PI / 2 + i * Math.PI / 4),
      ),
    ];
    let placement: Bounds | undefined;
    outer: for (const gap of [10, 18, 28, 42, 60]) {
      for (const direction of directions) {
        const offset = Math.abs(direction.x) * ink.width / 2 +
          Math.abs(direction.y) * ink.height / 2 + gap;
        const c = add(job.anchor, mul(direction, offset));
        const candidate = {
          x: c.x - ink.width / 2,
          y: c.y - ink.height / 2,
          width: ink.width,
          height: ink.height,
        };
        if (
          candidate.x < 8 || candidate.y < 62 ||
          candidate.x + candidate.width > width - 8 ||
          candidate.y + candidate.height > height - 8
        ) {
          continue;
        }
        if (
          obstacles.some((o) =>
            o.kind !== "area" && obstacleHitsBox(o, candidate, 3)
          )
        ) continue;
        placement = candidate;
        break outer;
      }
    }
    if (!placement) {
      throw new Error(
        `Geometry label '${job.id}' does not fit without overlap; increase the board size, shorten labels, or split the diagram.`,
      );
    }
    const part = addPart(
      job.id,
      translate(job.drawing, placement.x - ink.x, placement.y - ink.y),
      "text",
    );
    obstacles.push(...part.obstacles ?? []);
  }
  const bounds = unionBounds(parts.map((p) => p.bounds))!;
  if (!Object.values(bounds).every(Number.isFinite)) {
    throw new Error("Geometry produced nonfinite drawing bounds.");
  }
  return {
    markup: `<g style="${GRAPH_FONT_STYLE};color:${COLORS.ink}">${
      parts.map((p) => p.markup).join("")
    }</g>`,
    bounds,
    targets,
    obstacles,
    focusBounds: contentBounds,
  };
}

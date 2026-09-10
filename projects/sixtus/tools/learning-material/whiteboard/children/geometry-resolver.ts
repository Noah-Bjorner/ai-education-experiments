import type { Geometry } from "./geometry.ts";

export type GeometryPoint = readonly [number, number];
type Straight = {
  kind: "segment" | "line" | "ray";
  a: GeometryPoint;
  b: GeometryPoint;
};
type Circle = { kind: "circle"; center: GeometryPoint; radius: number };
export type ResolvedGeometryObject = Straight | Circle | {
  kind: "polygon";
  points: GeometryPoint[];
} | { kind: "arc"; circle: Circle; startAngle: number; sweep: number };
const EPS = 1e-8;
const sub = (
  a: GeometryPoint,
  b: GeometryPoint,
): GeometryPoint => [a[0] - b[0], a[1] - b[1]];
const add = (
  a: GeometryPoint,
  b: GeometryPoint,
): GeometryPoint => [a[0] + b[0], a[1] + b[1]];
const mul = (
  a: GeometryPoint,
  t: number,
): GeometryPoint => [a[0] * t, a[1] * t];
const dot = (a: GeometryPoint, b: GeometryPoint) => a[0] * b[0] + a[1] * b[1];
const cross = (a: GeometryPoint, b: GeometryPoint) => a[0] * b[1] - a[1] * b[0];
const norm = (a: GeometryPoint) => Math.hypot(...a);
const near = (a: number, b: number) =>
  Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));
const degrees = (n: number) => ((n % 360) + 360) % 360;
function require(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function straight(o: ResolvedGeometryObject): asserts o is Straight {
  require(
    o.kind === "line" || o.kind === "segment" || o.kind === "ray",
    "Expected a segment, line, or ray.",
  );
}
function domain(o: Straight, t: number) {
  return o.kind === "line" || (t >= -EPS && (o.kind === "ray" || t <= 1 + EPS));
}
function intersections(
  a: Straight | Circle,
  b: Straight | Circle,
): GeometryPoint[] {
  if (a.kind === "circle" && b.kind === "circle") {
    const delta = sub(b.center, a.center), d = norm(delta);
    if (d < EPS) return [];
    const x = (a.radius ** 2 - b.radius ** 2 + d ** 2) / (2 * d);
    const h2 = a.radius ** 2 - x ** 2;
    if (
      h2 < -EPS || d > a.radius + b.radius + EPS ||
      d < Math.abs(a.radius - b.radius) - EPS
    ) return [];
    const u = mul(delta, 1 / d), base = add(a.center, mul(u, x));
    const v = mul([-u[1], u[0]], Math.sqrt(Math.max(0, h2)));
    return norm(v) < EPS ? [base] : [add(base, v), sub(base, v)];
  }
  if (a.kind === "circle") return intersections(b, a);
  const u = sub(a.b, a.a);
  if (b.kind === "circle") {
    const w = sub(a.a, b.center), aa = dot(u, u), bb = 2 * dot(w, u);
    const cc = dot(w, w) - b.radius ** 2, disc = bb ** 2 - 4 * aa * cc;
    if (disc < -EPS) return [];
    const root = Math.sqrt(Math.max(0, disc));
    const ts = root < EPS
      ? [-bb / (2 * aa)]
      : [(-bb - root) / (2 * aa), (-bb + root) / (2 * aa)];
    return ts.filter((t) => domain(a, t)).map((t) => add(a.a, mul(u, t)));
  }
  const v = sub(b.b, b.a), w = sub(b.a, a.a), determinant = cross(u, v);
  if (Math.abs(determinant) <= EPS * norm(u) * norm(v)) return [];
  const t = cross(w, v) / determinant, s = cross(w, u) / determinant;
  return domain(a, t) && domain(b, s) ? [add(a.a, mul(u, t))] : [];
}

/** Pure construction/validation, shared by schema parsing and a future renderer.
 * References may be forward; DFS rejects cycles across both points and objects.
 * This does not parse the schema: callers accepting unknown input use geometrySchema.
 */
export function resolveGeometry(spec: Geometry) {
  const all = [
    ...spec.points,
    ...spec.objects,
    ...spec.labels,
    ...spec.markings,
  ];
  require(
    new Set(all.map((e) => e.id)).size === all.length,
    "Geometry element IDs must be unique across points, objects, labels, and markings.",
  );
  const pointSpecs = new Map(spec.points.map((p) => [p.id, p]));
  const objectSpecs = new Map(spec.objects.map((o) => [o.id, o]));
  const points = new Map<string, GeometryPoint>();
  const objects = new Map<string, ResolvedGeometryObject>();
  const active = new Set<string>();
  function enter(id: string) {
    require(!active.has(id), `Cyclic geometry dependency at '${id}'.`);
    active.add(id);
  }
  function pair(
    ids: readonly string[],
  ): [GeometryPoint, GeometryPoint] {
    const a = point(ids[0]), b = point(ids[1]);
    require(
      norm(sub(a, b)) > EPS,
      `Points '${ids[0]}' and '${ids[1]}' must be distinct positions.`,
    );
    return [a, b];
  }
  function circle(id: string): Circle {
    const o = object(id);
    require(o.kind === "circle", `'${id}' must reference a circle.`);
    return o;
  }
  function point(id: string): GeometryPoint {
    const cached = points.get(id);
    if (cached) return cached;
    const p = pointSpecs.get(id);
    require(!!p, `Unknown point '${id}'.`);
    enter(id);
    let result: GeometryPoint;
    switch (p.kind) {
      case "position":
        result = [p.at[0], p.at[1]];
        break;
      case "along": {
        const [a, b] = pair(p.points);
        result = add(a, mul(sub(b, a), p.fraction));
        break;
      }
      case "projection": {
        const [a, b] = pair(p.onto), v = sub(b, a);
        result = add(a, mul(v, dot(sub(point(p.point), a), v) / dot(v, v)));
        break;
      }
      case "on-circle": {
        const c = circle(p.circle), radians = degrees(p.angle) * Math.PI / 180;
        result = add(
          c.center,
          mul([Math.cos(radians), Math.sin(radians)], c.radius),
        );
        break;
      }
      case "intersection": {
        const a = object(p.objects[0]), b = object(p.objects[1]);
        require(
          a.kind !== "arc" && a.kind !== "polygon" && b.kind !== "arc" &&
            b.kind !== "polygon",
          "Intersections require straight objects or circles.",
        );
        const solutions = intersections(a, b).sort((a, b) =>
          a[0] - b[0] || a[1] - b[1]
        );
        const selected = solutions[p.solution === "first" ? 0 : 1];
        require(
          !!selected,
          `Intersection '${id}' has no '${p.solution}' isolated solution.`,
        );
        result = selected;
        break;
      }
    }
    require(
      result.every(Number.isFinite),
      `Point '${id}' resolved to nonfinite coordinates.`,
    );
    active.delete(id);
    points.set(id, result);
    return result;
  }
  function object(id: string): ResolvedGeometryObject {
    const cached = objects.get(id);
    if (cached) return cached;
    const o = objectSpecs.get(id);
    require(!!o, `Unknown object '${id}'.`);
    enter(id);
    let result: ResolvedGeometryObject;
    switch (o.kind) {
      case "segment":
      case "line":
      case "ray": {
        const [a, b] = pair(o.points);
        result = { kind: o.kind, a, b };
        break;
      }
      case "circle": {
        const center = point(o.center);
        const radius = typeof o.radius === "number"
          ? o.radius
          : norm(sub(point(o.radius.through), center));
        require(
          Number.isFinite(radius) && radius > EPS,
          `Circle '${id}' needs a positive finite radius.`,
        );
        result = { kind: "circle", center, radius };
        break;
      }
      case "arc": {
        const c = circle(o.circle);
        const sweep = degrees(
          o.direction === "counterclockwise"
            ? degrees(o.endAngle) - degrees(o.startAngle)
            : degrees(o.startAngle) - degrees(o.endAngle),
        );
        require(
          sweep > EPS,
          `Arc '${id}' must have a nonzero, non-full-turn sweep.`,
        );
        result = {
          kind: "arc",
          circle: c,
          startAngle: degrees(o.startAngle),
          sweep: o.direction === "clockwise" ? -sweep : sweep,
        };
        break;
      }
      case "polygon": {
        const ps = o.points.map(point);
        for (let i = 0; i < ps.length; i++) {
          for (let j = i + 1; j < ps.length; j++) {
            require(
              norm(sub(ps[i], ps[j])) > EPS,
              `Polygon '${id}' has repeated vertices.`,
            );
          }
        }
        const edges = ps.map((a, i): Straight => ({
          kind: "segment",
          a,
          b: ps[(i + 1) % ps.length],
        }));
        const area = edges.reduce(
          (sum, e) => sum + cross(sub(e.a, ps[0]), sub(e.b, ps[0])),
          0,
        );
        require(
          Number.isFinite(area) && Math.abs(area) > EPS,
          `Polygon '${id}' has zero or nonfinite area.`,
        );
        const onSegment = (p: GeometryPoint, e: Straight) => {
          const v = sub(e.b, e.a), w = sub(p, e.a);
          return Math.abs(cross(v, w)) <= EPS * norm(v) && dot(w, v) >= -EPS &&
            dot(w, v) <= dot(v, v) + EPS;
        };
        for (let i = 0; i < edges.length; i++) {
          const previous = ps[(i + ps.length - 1) % ps.length];
          const u = sub(previous, ps[i]),
            v = sub(ps[(i + 1) % ps.length], ps[i]);
          require(
            !(Math.abs(cross(u, v)) <= EPS * norm(u) * norm(v) &&
              dot(u, v) > 0),
            `Polygon '${id}' has overlapping adjacent edges.`,
          );
          for (let j = i + 1; j < edges.length; j++) {
            if (j === i + 1 || (i === 0 && j === edges.length - 1)) continue;
            require(
              intersections(edges[i], edges[j]).length === 0 &&
                !onSegment(edges[i].a, edges[j]) &&
                !onSegment(edges[i].b, edges[j]) &&
                !onSegment(edges[j].a, edges[i]) &&
                !onSegment(edges[j].b, edges[i]),
              `Polygon '${id}' has intersecting edges.`,
            );
          }
        }
        result = { kind: "polygon", points: ps };
        break;
      }
    }
    active.delete(id);
    objects.set(id, result);
    return result;
  }
  spec.points.forEach((p) => point(p.id));
  spec.objects.forEach((o) => object(o.id));
  const angleGroups = new Map<string, number>();
  for (const m of spec.markings) {
    if (m.kind === "angle" || m.kind === "right-angle") {
      const [a, vertex] = pair([m.points[0], m.points[1]]);
      const [, b] = pair([m.points[1], m.points[2]]);
      const u = mul(sub(a, vertex), 1 / norm(sub(a, vertex)));
      const v = mul(sub(b, vertex), 1 / norm(sub(b, vertex)));
      const minor = Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180 /
        Math.PI;
      require(minor > EPS, `Angle '${m.id}' has coincident arms.`);
      if (m.kind === "right-angle") {
        require(
          near(minor, 90),
          `Marking '${m.id}' does not describe a right angle.`,
        );
      } else if (m.group) {
        const angle = m.sweep === "minor" ? minor : 360 - minor;
        const previous = angleGroups.get(m.group);
        require(
          previous === undefined || near(previous, angle),
          `Angle group '${m.group}' contains unequal angles.`,
        );
        angleGroups.set(m.group, angle);
      }
    } else {
      require(
        new Set(m.objects).size === m.objects.length,
        `Marking '${m.id}' repeats an object.`,
      );
      const directions = m.objects.map((id) => {
        const o = object(id);
        straight(o);
        require(
          m.kind !== "equal-length" || o.kind === "segment",
          "Equal-length markings require segments.",
        );
        return sub(o.b, o.a);
      });
      for (const v of directions.slice(1)) {
        require(
          m.kind === "equal-length"
            ? near(norm(v), norm(directions[0]))
            : Math.abs(
              cross(
                mul(v, 1 / norm(v)),
                mul(directions[0], 1 / norm(directions[0])),
              ),
            ) <= EPS,
          `Marking '${m.id}' contradicts the constructed geometry.`,
        );
      }
    }
  }
  const markIds = new Set(spec.markings.map((m) => m.id));
  for (const label of spec.labels) {
    if (label.kind === "length") pair(label.points);
    else {require(
        points.has(label.target) || objects.has(label.target) ||
          markIds.has(label.target),
        `Label '${label.id}' has unknown target '${label.target}'.`,
      );}
  }
  if (spec.annotations?.length) {
    require(!!spec.id, "Geometry annotations require an explicit child ID.");
    const targets = new Map<string, boolean>([[`${spec.id}.title`, true]]);
    [...spec.points, ...spec.objects, ...spec.markings].forEach((e) =>
      targets.set(`${spec.id}.${e.id}.mark`, false)
    );
    spec.labels.forEach((e) => targets.set(`${spec.id}.${e.id}.label`, true));
    spec.markings.forEach((e) => {
      if (e.kind === "angle" && e.latex) {
        targets.set(`${spec.id}.${e.id}.label`, true);
      }
    });
    for (const annotation of spec.annotations) {
      for (const target of annotation.targetIds) {
        require(
          targets.has(target),
          `Unknown geometry annotation target '${target}'.`,
        );
        require(
          !["underline", "strikethrough"].includes(annotation.type) ||
            targets.get(target) === true,
          `Annotation '${annotation.type}' requires a text target.`,
        );
      }
    }
  }
  return { points, objects };
}

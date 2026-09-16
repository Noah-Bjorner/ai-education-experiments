import { renderError } from "./issues.ts";
import { escapeXml } from "./svg.ts";
import type { Bounds, Drawing, Point } from "./bounds.ts";

export type Segment = { a: Point; b: Point };
export type Attachment =
  | { type: "bounds" }
  | { type: "segments"; segments: Segment[] }
  | { type: "anchor"; point: Point; direction: Point };
export type ContainerGeometry =
  | { type: "rectangle"; bounds: Bounds }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { type: "polygon"; points: Point[] };
export type RenderObstacle = {
  bounds: Bounds;
  kind: "text" | "shape" | "stroke" | "annotation" | "area";
  ownerId?: string;
  segment?: Segment;
  circle?: { cx: number; cy: number; r: number };
  /** Only connectors to these targets may cross this obstacle; labels may not. */
  connectorPassThroughFor?: string[];
};
export type ScenePart = Drawing & {
  obstacles?: RenderObstacle[];
  /** Produced directly from primitive geometry, independently of obstacles. */
  attachment?: Attachment;
  container?: ContainerGeometry;
  targetId?: string;
};

/** All geometry is measured in figure-local coordinates. */
export type RenderTarget =
  & {
    bounds: Bounds;
    attachment: Attachment;
  }
  & (
    | {
      kind: "text";
      decorations: { underline: Segment; strikethrough: Segment };
    }
    | { kind: "mark" }
  );
export type TargetedDrawing = Drawing & {
  targets: Map<string, RenderTarget>;
  obstacles: RenderObstacle[];
  focusBounds: Bounds;
};

export function segmentsAttachment(segments: Segment[]): Attachment {
  const visible = segments.filter(({ a, b }) => a.x !== b.x || a.y !== b.y);
  return visible.length
    ? { type: "segments", segments: visible }
    : { type: "bounds" };
}

export function textDecorations(b: Bounds, rotation: 0 | -90 = 0) {
  const segment = (fraction: number, gap = 0): Segment =>
    rotation === -90
      ? {
        a: { x: b.x + b.width * fraction + gap, y: b.y },
        b: { x: b.x + b.width * fraction + gap, y: b.y + b.height },
      }
      : {
        a: { x: b.x, y: b.y + b.height * fraction + gap },
        b: { x: b.x + b.width, y: b.y + b.height * fraction + gap },
      };
  return { underline: segment(1, 3), strikethrough: segment(0.5) };
}

const finitePoint = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);
export function validateTarget(target: RenderTarget, id: string) {
  const b = target.bounds, attachment = target.attachment;
  const finiteSegment = (s: Segment) => finitePoint(s.a) && finitePoint(s.b);
  if (
    ![b.x, b.y, b.width, b.height, b.x + b.width, b.y + b.height].every(
      Number.isFinite,
    ) || b.width < 0 || b.height < 0 ||
    !attachment ||
    (attachment.type === "anchor" &&
      (!finitePoint(attachment.point) || !finitePoint(attachment.direction) ||
        (Math.hypot(attachment.direction.x, attachment.direction.y) === 0 ||
          !Number.isFinite(
            Math.hypot(attachment.direction.x, attachment.direction.y),
          )))) ||
    (attachment.type === "segments" &&
      (!attachment.segments.length ||
        !attachment.segments.every((s) =>
          finiteSegment(s) && (s.a.x !== s.b.x || s.a.y !== s.b.y)
        ))) ||
    (target.kind === "text" &&
      (!target.decorations || !finiteSegment(target.decorations.underline) ||
        !finiteSegment(target.decorations.strikethrough)))
  ) {
    throw renderError(
      "INTERNAL_RENDER_ERROR",
      `Invalid render target geometry '${id}'.`,
    );
  }
}

/** Register a complete target; primitive helpers supply geometry, not collision inference. */
export function registerTarget(options: {
  targets: Map<string, RenderTarget>;
  id: string | undefined;
  drawing: ScenePart;
  kind: RenderTarget["kind"];
  textRotation?: 0 | -90;
  bounds?: Bounds | null;
  attachment?: Attachment;
}): ScenePart {
  const { targets, id, drawing, kind, textRotation = 0 } = options;
  const bounds = options.bounds === undefined ? drawing.bounds : options.bounds;
  if (!id || !bounds) return drawing;
  if (targets.has(id)) {
    throw renderError("DUPLICATE_TARGET", `Duplicate render target '${id}'.`);
  }
  const target: RenderTarget = {
    bounds: { ...bounds },
    attachment: options.attachment ?? drawing.attachment ?? { type: "bounds" },
    ...(kind === "text"
      ? { kind, decorations: textDecorations(bounds, textRotation) }
      : { kind }),
  };
  validateTarget(target, id);
  targets.set(id, target);
  return {
    ...drawing,
    targetId: id,
    obstacles: (drawing.obstacles ??
      [{ bounds, kind: kind === "text" ? "text" : "shape" }]).map((o) => ({
        ...o,
        ownerId: id,
      })),
    markup: `<g id="${escapeXml(id)}">${drawing.markup}</g>`,
  };
}

export type FigureTransform = { x: number; y: number; scale: number };
export const transformPoint = (p: Point, t: FigureTransform): Point => ({
  x: t.x + p.x * t.scale,
  y: t.y + p.y * t.scale,
});
export const transformBounds = (b: Bounds, t: FigureTransform): Bounds => ({
  ...transformPoint(b, t),
  width: b.width * t.scale,
  height: b.height * t.scale,
});
const transformSegment = (s: Segment, t: FigureTransform): Segment => ({
  a: transformPoint(s.a, t),
  b: transformPoint(s.b, t),
});
export function transformTarget(
  target: RenderTarget,
  t: FigureTransform,
): RenderTarget {
  if (![t.x, t.y, t.scale].every(Number.isFinite) || t.scale <= 0) {
    throw new Error("Invalid figure transform.");
  }
  const a = target.attachment;
  return {
    bounds: transformBounds(target.bounds, t),
    attachment: a.type === "anchor"
      ? { ...a, point: transformPoint(a.point, t) }
      : a.type === "segments"
      ? { ...a, segments: a.segments.map((s) => transformSegment(s, t)) }
      : a,
    ...(target.kind === "text"
      ? {
        kind: target.kind,
        decorations: {
          underline: transformSegment(target.decorations.underline, t),
          strikethrough: transformSegment(target.decorations.strikethrough, t),
        },
      }
      : { kind: target.kind }),
  };
}
export function transformObstacle(
  o: RenderObstacle,
  t: FigureTransform,
): RenderObstacle {
  return {
    ...o,
    bounds: transformBounds(o.bounds, t),
    segment: o.segment && transformSegment(o.segment, t),
    circle: o.circle &&
      {
        cx: t.x + o.circle.cx * t.scale,
        cy: t.y + o.circle.cy * t.scale,
        r: o.circle.r * t.scale,
      },
  };
}

/** Strict containment: boundaries and concave polygon cutouts are outside. */
export function containerContains(g: ContainerGeometry, p: Point): boolean {
  if (g.type === "rectangle") {
    const b = g.bounds;
    return p.x > b.x && p.x < b.x + b.width && p.y > b.y &&
      p.y < b.y + b.height;
  }
  if (g.type === "ellipse") {
    return g.rx > 0 && g.ry > 0 &&
      ((p.x - g.cx) / g.rx) ** 2 + ((p.y - g.cy) / g.ry) ** 2 < 1 - 1e-10;
  }
  let inside = false;
  for (let i = 0, j = g.points.length - 1; i < g.points.length; j = i++) {
    const a = g.points[j], b = g.points[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (
      Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) <=
        1e-9 * Math.max(1, length) &&
      p.x >= Math.min(a.x, b.x) - 1e-9 && p.x <= Math.max(a.x, b.x) + 1e-9 &&
      p.y >= Math.min(a.y, b.y) - 1e-9 && p.y <= Math.max(a.y, b.y) + 1e-9
    ) return false;
    if (
      (a.y > p.y) !== (b.y > p.y) &&
      p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x
    ) inside = !inside;
  }
  return inside;
}

/** Only explicitly closed scene parts can grant connector passage. */
export function allowContainerConnections(
  targets: Map<string, RenderTarget>,
  obstacles: RenderObstacle[],
  parts: ScenePart[],
): RenderObstacle[] {
  const permissions = new Map<string, string[]>();
  for (const part of parts) {
    if (!part.container || !part.targetId) continue;
    permissions.set(
      part.targetId,
      [...targets].filter(([id, t]) =>
        id !== part.targetId &&
        containerContains(part.container!, {
          x: t.bounds.x + t.bounds.width / 2,
          y: t.bounds.y + t.bounds.height / 2,
        })
      ).map(([id]) => id),
    );
  }
  return obstacles.map((o) =>
    o.ownerId && permissions.has(o.ownerId)
      ? {
        ...o,
        connectorPassThroughFor: [
          ...new Set([
            ...(o.connectorPassThroughFor ?? []),
            ...permissions.get(o.ownerId)!,
          ]),
        ],
      }
      : o
  );
}

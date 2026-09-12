import {
  type Freeform,
  type FreeformElement,
  freeformSchema,
} from "../figures/freeform.ts";
import {
  type Bounds,
  expandBounds,
  type Point,
  unionBounds,
} from "./bounds.ts";
import { GRAPH_FONT_STYLE } from "./font.ts";
import type { GraphOptions } from "./graphs.ts";
import { renderHandwritten } from "./handwritten.ts";
import { center, obstacleHitsBox } from "./placement.ts";
import {
  COLORS,
  LINE_HEIGHT,
  SERIES_COLORS,
  SPACING,
  TYPE_SCALE,
} from "./theme.ts";
import {
  registerTarget,
  type RenderObstacle,
  type RenderTarget,
  type ScenePart,
  type TargetedDrawing,
} from "./targets.ts";
import { textBlock } from "./text-block.ts";
import { withFigureTitle } from "./titles.ts";

type ShapeElement = Extract<
  FreeformElement,
  { type: "rectangle" | "ellipse" | "marker" }
>;
const roles = { small: "label", normal: "body", large: "prominent" } as const;
const SCENE_WIDTH = 800;
const SCENE_HEIGHT = 440;
const MAX_EXTENT = 10_000;
const palette = (color: FreeformElement["color"]) =>
  !color || color === "ink"
    ? COLORS.ink
    : SERIES_COLORS[Number(color.slice(-1)) - 1];
const shapeBounds = (e: ShapeElement): Bounds =>
  e.type === "rectangle"
    ? { x: e.x, y: e.y, width: e.width, height: e.height }
    : {
      x: e.x - (e.type === "ellipse" ? e.rx : e.radius),
      y: e.y - (e.type === "ellipse" ? e.ry : e.radius),
      width: 2 * (e.type === "ellipse" ? e.rx : e.radius),
      height: 2 * (e.type === "ellipse" ? e.ry : e.radius),
    };
const finiteBounds = (b: Bounds | null | undefined): b is Bounds =>
  !!b && Object.values(b).every(Number.isFinite);
const withinExtent = (b: Bounds) =>
  [b.x, b.y, b.x + b.width, b.y + b.height, b.width, b.height]
    .every((v) => Math.abs(v) <= MAX_EXTENT);
const segment = (a: Point, b: Point): RenderObstacle => ({
  kind: "stroke",
  bounds: expandBounds({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }, 1)!,
  segment: { a, b },
});

export { wrapGraphText as wrapFreeformText } from "./font.ts";

/** Intersection of a center ray with the actual primitive boundary. */
function boundary(e: ShapeElement, toward: Point): Point {
  const b = shapeBounds(e),
    c = center(b),
    dx = toward.x - c.x,
    dy = toward.y - c.y;
  if (Math.hypot(dx, dy) < 1e-8) {
    throw new Error(`Cannot attach toward the center of '${e.id}'`);
  }
  let t: number;
  if (e.type === "rectangle") {
    t = Math.min(
      dx ? b.width / 2 / Math.abs(dx) : Infinity,
      dy ? b.height / 2 / Math.abs(dy) : Infinity,
    );
  } else if (e.type === "marker" && e.variant === "x") {
    // X uses two round-capped 2-unit strokes: intersect ray with their capsules.
    const length = Math.hypot(dx, dy), ux = dx / length, uy = dy / length;
    let extent = 0;
    for (const sign of [-1, 1]) {
      const vx = Math.SQRT1_2, vy = sign * Math.SQRT1_2;
      const along = ux * vx + uy * vy,
        across = ux * (-vy) + uy * vx,
        half = e.radius * Math.SQRT2;
      const side = Math.abs(across) > 1e-10 ? 1 / Math.abs(across) : Infinity;
      if (Math.abs(side * along) <= half) extent = Math.max(extent, side);
      for (const end of [-1, 1]) {
        const projection = end * half * along;
        const discriminant = 1 - half * half + projection * projection;
        if (discriminant >= 0) {
          extent = Math.max(extent, projection + Math.sqrt(discriminant));
        }
      }
    }
    t = extent / length;
  } else t = 1 / Math.hypot(dx / (b.width / 2), dy / (b.height / 2));
  return { x: c.x + dx * t, y: c.y + dy * t };
}

export function renderFreeformDrawing(
  input: Freeform,
  options: GraphOptions,
): TargetedDrawing {
  const parsed = freeformSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Freeform '${input.id}': ${parsed.error.message}`,
    );
  }
  const figure = parsed.data, namespace = figure.id ?? options.id;
  const width = options.width ?? 800, height = options.height ?? 520;
  if (
    !/^[a-zA-Z][\w-]*$/.test(options.id) ||
    ![
      width,
      height,
      options.seed ?? 10,
      options.roughness ?? 1.5,
      options.hatchGap ?? 9,
    ].every(Number.isFinite) || width <= 0 || height <= 80 ||
    (options.roughness ?? 1.5) < 0 || (options.hatchGap ?? 9) < 2
  ) throw new Error(`Freeform '${namespace}': invalid render options`);
  const scale = Math.min(width / SCENE_WIDTH, (height - 80) / SCENE_HEIGHT),
    tx = (width - SCENE_WIDTH * scale) / 2;
  const shapes = new Map(
    figure.elements.filter((e): e is ShapeElement =>
      ["rectangle", "ellipse", "marker"].includes(e.type)
    ).map((e) => [e.id, e]),
  );
  // Bound geometry before fill generation or reference resolution does any work.
  const skipped = new Set<string>();
  for (const e of shapes.values()) {
    const b = shapeBounds(e);
    if (!finiteBounds(b) || !withinExtent(b)) {
      console.warn(
        `Freeform '${namespace}', element '${e.id}': Shape geometry is invalid or too large`,
      );
      skipped.add(e.id);
    }
  }
  const parts: ScenePart[] = [];
  const localTargets = new Map<string, RenderTarget>();
  for (const e of figure.elements) {
    if (skipped.has(e.id)) continue;
    try {
      const ink = palette(e.color);
      let part: ScenePart;
      if (e.type === "text") {
        // Compensate for the scene transform: text keeps its board-space role size.
        const role = roles[e.size];
        const text = textBlock(
          e.content,
          e.width,
          TYPE_SCALE[role] / scale,
          LINE_HEIGHT[role] / scale,
          0,
          0,
          ink,
          e.align,
        );
        let x: number, y: number;
        if ("x" in e.position) {
          x = e.position.x;
          y = e.position.y;
        } else {
          const b = shapeBounds(shapes.get(e.position.target)!),
            gap = (e.position.gap ?? SPACING.labelGap) / scale;
          x = b.x + (b.width - e.width) / 2;
          y = b.y + (b.height - text.height) / 2;
          if (e.position.side === "left") x = b.x - gap - e.width;
          if (e.position.side === "right") x = b.x + b.width + gap;
          if (e.position.side === "top") y = b.y - gap - text.height;
          if (e.position.side === "bottom") y = b.y + b.height + gap;
        }
        part = {
          markup:
            `<g fill="${ink}" transform="translate(${x} ${y})">${text.markup}</g>`,
          bounds: {
            ...text.bounds!,
            x: text.bounds!.x + x,
            y: text.bounds!.y + y,
          },
        };
      } else if (e.type === "line" || e.type === "arrow") {
        const start = "target" in e.from
          ? center(shapeBounds(shapes.get(e.from.target)!))
          : e.from;
        const end = "target" in e.to
          ? center(shapeBounds(shapes.get(e.to.target)!))
          : e.to;
        const a = "target" in e.from
          ? boundary(shapes.get(e.from.target)!, end)
          : start;
        const b = "target" in e.to
          ? boundary(shapes.get(e.to.target)!, start)
          : end;
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (
          length < 1e-8 ||
          (b.x - a.x) * (end.x - start.x) + (b.y - a.y) * (end.y - start.y) <= 0
        ) throw new Error("Zero-length or overlapping attached connector");
        const obstacles = [segment(a, b)];
        let markup = `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" ${
          e.dashed ? 'stroke-dasharray="8 6"' : ""
        }/>`;
        if (e.type === "arrow") {
          const ux = (b.x - a.x) / length,
            uy = (b.y - a.y) / length,
            head = Math.min(10, length / 3);
          const l = {
            x: b.x - head * ux + head * .45 * uy,
            y: b.y - head * uy - head * .45 * ux,
          };
          const r = {
            x: b.x - head * ux - head * .45 * uy,
            y: b.y - head * uy + head * .45 * ux,
          };
          obstacles.push(segment(l, b), segment(b, r));
          markup +=
            `<path d="M ${l.x} ${l.y} L ${b.x} ${b.y} L ${r.x} ${r.y}"/>`;
        }
        part = {
          markup:
            `<g fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${markup}</g>`,
          bounds: unionBounds(obstacles.map((o) => o.bounds)),
          obstacles,
        };
      } else {
        const b = shapeBounds(e), obstacles: RenderObstacle[] = [];
        if (e.type === "marker" && e.variant === "x") {
          obstacles.push(
            segment({ x: b.x, y: b.y }, {
              x: b.x + b.width,
              y: b.y + b.height,
            }),
            segment({ x: b.x, y: b.y + b.height }, {
              x: b.x + b.width,
              y: b.y,
            }),
          );
          part = {
            markup:
              `<g stroke="${ink}" stroke-width="2" stroke-linecap="round">${
                obstacles.map((o) =>
                  `<path d="M ${o.segment!.a.x} ${o.segment!.a.y} L ${
                    o.segment!.b.x
                  } ${o.segment!.b.y}"/>`
                ).join("")
              }</g>`,
            bounds: expandBounds(b, 1),
            obstacles,
          };
        } else {
          if (e.type === "rectangle") {
            const p = [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y }, {
              x: b.x + b.width,
              y: b.y + b.height,
            }, { x: b.x, y: b.y + b.height }];
            for (let i = 0; i < 4; i++) {
              obstacles.push(segment(p[i], p[(i + 1) % 4]));
            }
          } else {
            // Fine polygonal outline keeps empty ellipse interiors available for callouts.
            for (let i = 0; i < 256; i++) {
              const p = (t: number) => ({
                x: e.x + b.width / 2 * Math.cos(t),
                y: e.y + b.height / 2 * Math.sin(t),
              });
              obstacles.push(
                segment(p(i * Math.PI / 128), p((i + 1) * Math.PI / 128)),
              );
            }
          }
          if (e.type === "marker" && e.variant === "dot") {
            part = {
              markup:
                `<circle cx="${e.x}" cy="${e.y}" r="${e.radius}" fill="${ink}"/>`,
              bounds: b,
              obstacles: [{
                kind: "shape",
                bounds: b,
                circle: { cx: e.x, cy: e.y, r: e.radius },
              }],
            };
          } else {
            const shape = e.type === "rectangle"
              ? { type: "rectangle" as const, ...b }
              : {
                type: "ellipse" as const,
                cx: e.x,
                cy: e.y,
                rx: b.width / 2,
                ry: b.height / 2,
              };
            // Exact outlines keep attachments and meaningful spatial relations stable.
            const drawing = renderHandwritten(shape, {
              id: `${options.id}-${e.id}`,
              seed: options.seed ?? 10,
              roughness: 0,
              hatchGap: options.hatchGap ?? 9,
              stroke: ink,
              fill: "fill" in e && e.fill ? ink : "none",
            });
            part = { ...drawing, obstacles };
          }
        }
      }
      const b = part.bounds;
      if (!finiteBounds(b) || !withinExtent(b)) {
        throw new Error("Painted content is invalid or too large");
      }
      parts.push(
        registerTarget(
          localTargets,
          `${namespace}.${e.id}.${e.type === "text" ? "label" : "mark"}`,
          part,
          e.type === "text" ? "text" : "mark",
        ),
      );
    } catch (error) {
      console.warn(
        `Freeform '${namespace}', element '${e.id}': ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
  const localObstacles = parts.flatMap((p) => p.obstacles ?? []);
  const containers = new Set(
    figure.elements.filter((e) =>
      e.type === "rectangle" || e.type === "ellipse"
    )
      .map((e) => `${namespace}.${e.id}.mark`),
  );
  for (const [id, target] of localTargets) {
    if (target.kind === "text") {
      for (const obstacle of localObstacles) {
        if (
          obstacle.ownerId !== id &&
          !containers.has(obstacle.ownerId ?? "") &&
          obstacleHitsBox(obstacle, target.bounds, 1.1)
        ) {
          console.warn(
            `Freeform '${namespace}': text '${id}' overlaps '${obstacle.ownerId}'`,
          );
        }
      }
    }
  }
  const sceneBounds = unionBounds(parts.map((p) => p.bounds)) ??
    { x: 0, y: 0, width: SCENE_WIDTH, height: SCENE_HEIGHT };
  const ty = 64 + Math.max(0, -sceneBounds.y) * scale;
  const transformBounds = (b: Bounds): Bounds => ({
    x: tx + b.x * scale,
    y: ty + b.y * scale,
    width: b.width * scale,
    height: b.height * scale,
  });
  const transformPoint = (p: Point): Point => ({
    x: tx + p.x * scale,
    y: ty + p.y * scale,
  });
  const targets = new Map<string, RenderTarget>();
  for (const [id, t] of localTargets) {
    targets.set(id, {
      ...t,
      bounds: transformBounds(t.bounds),
      outline: t.outline?.map((s) => ({
        a: transformPoint(s.a),
        b: transformPoint(s.b),
      })),
    });
  }
  const obstacles: RenderObstacle[] = localObstacles.map((o) => ({
    ...o,
    bounds: transformBounds(o.bounds),
    segment: o.segment &&
      { a: transformPoint(o.segment.a), b: transformPoint(o.segment.b) },
    circle: o.circle &&
      {
        cx: tx + o.circle.cx * scale,
        cy: ty + o.circle.cy * scale,
        r: o.circle.r * scale,
      },
  }));
  const focusBounds = transformBounds(sceneBounds);
  return withFigureTitle(
    {
      markup:
        `<g style="${GRAPH_FONT_STYLE}"><g transform="translate(${tx} ${ty}) scale(${scale})">${
          parts.map((p) => p.markup).join("")
        }</g></g>`,
      bounds: focusBounds,
      focusBounds,
      targets,
      obstacles,
    },
    figure.title,
    namespace,
    options,
  );
}

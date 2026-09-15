import {
  type Bounds,
  type Drawing,
  type Point,
  unionBounds,
} from "./bounds.ts";
import {
  registerTarget,
  type RenderObstacle,
  type RenderTarget,
  type ScenePart,
  type TargetedDrawing,
  transformObstacle,
  transformTarget,
  validateTarget,
} from "./targets.ts";
import { renderError } from "./issues.ts";

export function assertBounds(bounds: Bounds | null): void {
  if (
    bounds &&
    (!Object.values(bounds).every(Number.isFinite) || bounds.width < 0 ||
      bounds.height < 0 || !Number.isFinite(bounds.x + bounds.width) ||
      !Number.isFinite(bounds.y + bounds.height))
  ) {
    throw renderError(
      "INTERNAL_RENDER_ERROR",
      "Drawing contains invalid measured bounds.",
    );
  }
}

function assertPoint(point: Point): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw renderError(
      "INTERNAL_RENDER_ERROR",
      "Drawing contains an invalid attachment point.",
    );
  }
}

export function assertScenePart(part: ScenePart): void {
  assertBounds(part.bounds);
  for (const obstacle of part.obstacles ?? []) {
    assertBounds(obstacle.bounds);
    if (obstacle.segment) {
      assertPoint(obstacle.segment.a);
      assertPoint(obstacle.segment.b);
    }
    if (
      obstacle.circle &&
      (![obstacle.circle.cx, obstacle.circle.cy, obstacle.circle.r].every(
        Number.isFinite,
      ) || obstacle.circle.r <= 0)
    ) {
      throw renderError(
        "INTERNAL_RENDER_ERROR",
        "Drawing contains an invalid circular obstacle.",
      );
    }
  }
}

export function assertTargetedDrawing(drawing: TargetedDrawing): void {
  assertScenePart(drawing);
  assertBounds(drawing.focusBounds);
  if (
    !drawing.bounds || drawing.bounds.width <= 0 ||
    drawing.bounds.height <= 0 || !drawing.markup.trim()
  ) throw renderError("INVALID_GEOMETRY", "The figure has no visible content.");
  for (const [id, target] of drawing.targets) validateTarget(target, id);
}

/** Small accumulator: registration and measured parts cannot get out of step. */
export function drawingBuilder(targets = new Map<string, RenderTarget>()) {
  const parts: ScenePart[] = [];
  return {
    targets,
    parts,
    add(options: Omit<Parameters<typeof registerTarget>[0], "targets">): ScenePart {
      assertScenePart(options.drawing);
      assertBounds(options.bounds === undefined ? options.drawing.bounds : options.bounds);
      const registered = registerTarget({ ...options, targets });
      parts.push(registered);
      return registered;
    },
    finish(
      focusBounds: Bounds,
      markup = parts.map((part) => part.markup).join(""),
    ): TargetedDrawing {
      const drawing = {
        markup,
        bounds: unionBounds(parts.map((part) => part.bounds)),
        targets,
        focusBounds,
        obstacles: parts.flatMap((part) => part.obstacles ?? []),
      };
      assertTargetedDrawing(drawing);
      return drawing;
    },
  };
}

/** Positive uniform scale preserves circles, direction vectors, and vertical labels. */
export function transformDrawing<T extends Drawing>(
  drawing: T,
  x: number,
  y: number,
  scale = 1,
): T {
  if (![x, y, scale].every(Number.isFinite) || scale <= 0) {
    throw renderError(
      "INVALID_OPTIONS",
      "Drawing transforms require finite translation and positive scale.",
    );
  }
  const point = (p: Point): Point => ({
    x: x + p.x * scale,
    y: y + p.y * scale,
  });
  const bounds = (b: Bounds): Bounds => ({
    ...point(b),
    width: b.width * scale,
    height: b.height * scale,
  });
  const transform = { x, y, scale };
  const scene = drawing as T & Partial<TargetedDrawing>;
  const result = {
    ...drawing,
    markup: `<g transform="translate(${x} ${y})${
      scale === 1 ? "" : ` scale(${scale})`
    }">${drawing.markup}</g>`,
    bounds: drawing.bounds && bounds(drawing.bounds),
    ...(scene.obstacles
      ? {
        obstacles: scene.obstacles.map((o) => transformObstacle(o, transform)),
      }
      : {}),
    ...(scene.focusBounds ? { focusBounds: bounds(scene.focusBounds) } : {}),
    ...(scene.targets
      ? {
        targets: new Map(
          [...scene.targets].map((
            [id, target],
          ) => [id, transformTarget(target, transform)]),
        ),
      }
      : {}),
  };
  assertScenePart(result);
  return result;
}

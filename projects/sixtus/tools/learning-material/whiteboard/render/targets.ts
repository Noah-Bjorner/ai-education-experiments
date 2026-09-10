import { escapeXml } from "../../static/shared/svg.ts";
import type { Bounds, Drawing, Point } from "./bounds.ts";

export type RenderObstacle = {
  bounds: Bounds;
  kind: "text" | "shape" | "stroke" | "annotation" | "area";
  ownerId?: string;
  segment?: { a: Point; b: Point };
  circle?: { cx: number; cy: number; r: number };
};
export type ScenePart = Drawing & { obstacles?: RenderObstacle[] };

/** Geometry is local to the child, before the board's placement transform. */
export type RenderTarget = {
  bounds: Bounds;
  kind: "text" | "mark";
  /** Current Y-axis labels are rotated -90 degrees. */
  vertical?: boolean;
  /** Explicit boundary anchor and outward direction, for shapes such as wedges. */
  anchor?: { point: Point; direction: Point };
};

export type TargetedDrawing = Drawing & {
  targets: Map<string, RenderTarget>;
  obstacles: RenderObstacle[];
  focusBounds: Bounds;
};

/** Retain measured geometry and expose the same semantic ID in the base SVG. */
export function registerTarget(
  targets: Map<string, RenderTarget>,
  id: string | undefined,
  drawing: ScenePart,
  kind: RenderTarget["kind"],
  vertical = false,
  bounds = drawing.bounds,
): ScenePart {
  if (!id || !bounds) return drawing;
  if (targets.has(id)) throw new Error(`Duplicate render target '${id}'.`);
  targets.set(id, { bounds: { ...bounds }, kind, vertical });
  return {
    ...drawing,
    obstacles: (drawing.obstacles ??
      [{ bounds, kind: kind === "text" ? "text" : "shape" }]).map((o) => ({
        ...o,
        ownerId: id,
      })),
    markup: `<g id="${escapeXml(id)}">${drawing.markup}</g>`,
  };
}

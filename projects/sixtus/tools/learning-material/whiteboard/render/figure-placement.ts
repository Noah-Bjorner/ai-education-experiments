import { SPACING } from "./theme.ts";
import type { WhiteboardSpec } from "../schema.ts";
import { type Bounds, type Drawing, exportBounds } from "./bounds.ts";

export type PlacementOptions = {
  /** Allocation per figure; exports trim to the complete painted bounds. */
  width?: number;
  height?: number;
  /** Minimum spacing between complete figures. Defaults to 32. */
  gap?: number;
};

/** x/y translate figure-local SVG coordinates; width/height are measured extents. */
export type FigurePlacement = Bounds & { figureIndex: number };

export function figureAllocation(options: PlacementOptions = {}) {
  const { width = 800, height = 520, gap = SPACING.figureGap } = options;
  if (
    ![width, height, gap].every(Number.isFinite) ||
    width <= 0 || height <= 0 || gap < 0
  ) {
    throw new Error(
      "Figure placement needs finite positive allocations and a nonnegative gap.",
    );
  }
  return { width, height, gap };
}

/** Place in dependency order using base + emphasis + callout bounds. */
export function placeFigures(
  spec: WhiteboardSpec,
  drawings: Drawing[],
  options: PlacementOptions = {},
): FigurePlacement[] {
  const { gap } = figureAllocation(options);
  if (drawings.length !== spec.figures.length) {
    throw new Error("Each figure needs a complete drawing before placement.");
  }
  const placed = new Map<string, Bounds>();
  return spec.figures.map((figure, figureIndex) => {
    const local = exportBounds(drawings[figureIndex].bounds);
    const box = { ...local };
    if (figure.anchor !== null) {
      const anchor = placed.get(figure.anchor);
      if (!anchor || figure.side === null) {
        throw new Error("Placement requires an earlier anchor and a side.");
      }
      box.x = anchor.x + (anchor.width - box.width) / 2;
      box.y = anchor.y + (anchor.height - box.height) / 2;
      switch (figure.side) {
        case "top":
          box.y = anchor.y - gap - box.height;
          break;
        case "bottom":
          box.y = anchor.y + anchor.height + gap;
          break;
        case "left":
          box.x = anchor.x - gap - box.width;
          break;
        case "right":
          box.x = anchor.x + anchor.width + gap;
          break;
      }
      // Push only along the requested side axis. Recheck earlier figures after
      // each push: clearing a sibling can move this figure into a cousin.
      // Movement is monotonic, so every collision clears a previous figure for good.
      for (;;) {
        const collisions = [...placed.values()].filter((other) =>
          box.x < other.x + other.width + gap - 1e-7 &&
          box.x + box.width > other.x - gap + 1e-7 &&
          box.y < other.y + other.height + gap - 1e-7 &&
          box.y + box.height > other.y - gap + 1e-7
        );
        if (!collisions.length) break;
        switch (figure.side) {
          case "top":
            box.y = Math.min(...collisions.map((b) => b.y - gap - box.height));
            break;
          case "bottom":
            box.y = Math.max(...collisions.map((b) => b.y + b.height + gap));
            break;
          case "left":
            box.x = Math.min(...collisions.map((b) => b.x - gap - box.width));
            break;
          case "right":
            box.x = Math.max(...collisions.map((b) => b.x + b.width + gap));
            break;
        }
      }
    }
    placed.set(figure.id, box);
    return {
      figureIndex,
      x: box.x - local.x,
      y: box.y - local.y,
      width: local.width,
      height: local.height,
    };
  });
}

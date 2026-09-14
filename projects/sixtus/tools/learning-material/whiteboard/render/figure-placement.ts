import { SPACING } from "./theme.ts";
import type { WhiteboardOrientation, WhiteboardSpec } from "../schema.ts";
import { type Bounds, type Drawing, exportBounds } from "./bounds.ts";

/** Visualizations per landscape row. Text figures always occupy their own row. */
export const LANDSCAPE_ROW_SIZE = 3;

export type PlacementOptions = {
  /** Allocation per figure; exports trim to the complete painted bounds. */
  width?: number;
  height?: number;
  /** Minimum spacing between complete figures. Defaults to 32. */
  gap?: number;
  /**
   * When set, ignore spec sides and pack by orientation: portrait is one
   * column; landscape wraps after {@link LANDSCAPE_ROW_SIZE} visualizations.
   */
  orientation?: WhiteboardOrientation;
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
  if (drawings.length !== spec.figures.length) {
    throw new Error("Each figure needs a complete drawing before placement.");
  }
  if (options.orientation != null) {
    return packFigures(spec, drawings, options, options.orientation);
  }
  return placeAnchoredFigures(spec, drawings, options);
}

function orientationRows(
  spec: WhiteboardSpec,
  orientation: WhiteboardOrientation,
): number[][] {
  if (orientation === "portrait") {
    return spec.figures.map((_, i) => [i]);
  }
  const rows: number[][] = [];
  let current: number[] = [];
  const flush = () => {
    if (current.length > 0) {
      rows.push(current);
      current = [];
    }
  };
  for (const [i, figure] of spec.figures.entries()) {
    if (figure.type === "text") {
      flush();
      rows.push([i]);
      continue;
    }
    if (current.length >= LANDSCAPE_ROW_SIZE) flush();
    current.push(i);
  }
  flush();
  return rows;
}

function packFigures(
  spec: WhiteboardSpec,
  drawings: Drawing[],
  options: PlacementOptions,
  orientation: WhiteboardOrientation,
): FigurePlacement[] {
  const { gap } = figureAllocation(options);
  const rows = orientationRows(spec, orientation);
  const boxes: Bounds[] = new Array(spec.figures.length);
  let rowBottom = -Infinity;
  for (const [rowIndex, row] of rows.entries()) {
    let rowTop = 0;
    for (const [col, figureIndex] of row.entries()) {
      const local = exportBounds(drawings[figureIndex].bounds);
      const box = {
        x: local.x,
        y: local.y,
        width: local.width,
        height: local.height,
      };
      if (rowIndex > 0 || col > 0) {
        if (col === 0) {
          const origin = boxes[0];
          box.x = orientation === "portrait"
            ? origin.x + (origin.width - box.width) / 2
            : origin.x;
          box.y = rowBottom + gap;
        } else {
          const prev = boxes[row[col - 1]];
          box.x = prev.x + prev.width + gap;
          box.y = rowTop;
        }
      }
      if (col === 0) rowTop = box.y;
      boxes[figureIndex] = box;
    }
    rowBottom = Math.max(...row.map((i) => boxes[i].y + boxes[i].height));
  }
  return spec.figures.map((_, figureIndex) => {
    const local = exportBounds(drawings[figureIndex].bounds);
    const box = boxes[figureIndex];
    return {
      figureIndex,
      x: box.x - local.x,
      y: box.y - local.y,
      width: local.width,
      height: local.height,
    };
  });
}

function placeAnchoredFigures(
  spec: WhiteboardSpec,
  drawings: Drawing[],
  options: PlacementOptions,
): FigurePlacement[] {
  const { gap } = figureAllocation(options);
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

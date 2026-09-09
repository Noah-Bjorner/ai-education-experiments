import type { WhiteboardSpec } from "../schema.ts";
import type { Bounds } from "./bounds.ts";

export type LayoutOptions = {
  /** Total board allocation; final exports trim to painted bounds. */
  width?: number;
  height?: number;
  gap?: number;
};

/** Allocate equal child rectangles; each renderer owns its internal layout. */
export function layoutWhiteboard(
  spec: WhiteboardSpec,
  options: LayoutOptions = {},
) {
  const count = spec.children.length;
  if (
    (spec.layout === "single" && count !== 1) ||
    (spec.layout === "split" && count !== 2) ||
    (spec.layout === "stack" && count < 2)
  ) {
    throw new Error(
      `Layout '${spec.layout}' does not support ${count} children.`,
    );
  }
  const columns = spec.layout === "split" ? 2 : 1;
  const rows = spec.layout === "stack" ? count : 1;
  const gap = options.gap ?? 32;
  const width = options.width ?? columns * 800 + (columns - 1) * gap;
  const height = options.height ?? rows * 520 + (rows - 1) * gap;
  const childWidth = (width - (columns - 1) * gap) / columns;
  const childHeight = (height - (rows - 1) * gap) / rows;
  if (
    ![gap, width, height, childWidth, childHeight].every(Number.isFinite) ||
    gap < 0 || childWidth <= 0 || childHeight <= 0
  ) {
    throw new Error(
      "Board layout needs finite positive allocations and a nonnegative gap.",
    );
  }
  const children: (Bounds & { childIndex: number })[] = spec.children.map((
    _,
    i,
  ) => ({
    childIndex: i,
    x: (i % columns) * (childWidth + gap),
    y: Math.floor(i / columns) * (childHeight + gap),
    width: childWidth,
    height: childHeight,
  }));
  return { children };
}

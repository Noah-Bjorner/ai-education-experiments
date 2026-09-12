import type { WhiteboardFigureContent, WhiteboardSpec } from "../schema.ts";

/** Give standalone test/gallery figures a sequential board placement. */
export function boardExample(
  figures: WhiteboardFigureContent[],
  side: NonNullable<WhiteboardSpec["figures"][number]["side"]> = "bottom",
): WhiteboardSpec {
  const ids = figures.map((figure, i) => figure.id ?? `figure-${i + 1}`);
  return {
    title: null,
    figures: figures.map((figure, i) => ({
      ...figure,
      id: ids[i],
      anchor: i === 0 ? null : ids[i - 1],
      side: i === 0 ? null : side,
    })),
  };
}

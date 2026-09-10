import { escapeXml } from "./svg.ts";
import { COLORS } from "./theme.ts";

/** The same geometry feeds the regular and handwritten renderers. */
export type Shape =
  | { type: "circle"; cx: number; cy: number; r: number }
  | { type: "rectangle"; x: number; y: number; width: number; height: number }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number };

export function renderShape(
  shape: Shape,
  fill = "none",
  stroke: string = COLORS.ink,
): string {
  const style = `fill="${escapeXml(fill)}" stroke="${
    escapeXml(stroke)
  }" stroke-width="2"`;
  switch (shape.type) {
    case "circle":
      return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" ${style}/>`;
    case "rectangle":
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" ${style}/>`;
    case "line":
      return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" ${style}/>`;
  }
}

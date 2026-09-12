import { type Bounds, unionBounds } from "./bounds.ts";
import { graphTextBounds, wrapGraphText } from "./font.ts";
import { escapeXml } from "./svg.ts";
import type { ScenePart } from "./targets.ts";

/** Wrap complete text, including glyph overhang, and locate its ink within the box. */
export function textBlock(
  value: string,
  width: number,
  size: number,
  lineHeight: number,
  x: number,
  y: number,
  color: string,
  align: "left" | "center" | "right" = "left",
): ScenePart & { height: number } {
  if (
    ![width, size, lineHeight, x, y].every(Number.isFinite) ||
    width <= 0 || size <= 0 || lineHeight < size
  ) {
    throw new Error(
      "Text blocks need positive finite dimensions and line height >= font size.",
    );
  }
  const anchor = align === "left"
    ? "start"
    : align === "center"
    ? "middle"
    : "end";
  const anchorX = align === "left" ? 0 : align === "center" ? width / 2 : width;
  let wrapWidth = width;
  let lines: string[];
  let bounds: Bounds | null;
  for (;;) {
    lines = wrapGraphText(value.replace(/\r\n?/g, "\n"), size, wrapWidth);
    bounds = unionBounds(
      lines.map((line, i) =>
        graphTextBounds(line, size, anchorX, i * lineHeight, anchor)
      ),
    );
    if (!bounds) throw new Error("Text blocks require visible text.");
    if (bounds.width <= width) break;
    // Advance widths and ink widths differ for overhanging glyphs. Reflow at
    // the measured excess rather than allowing that ink to cross the border.
    wrapWidth -= Math.max(1, bounds.width - width);
    if (wrapWidth <= 0) {
      throw new Error("Text block is too narrow for its glyphs.");
    }
  }
  const left = align === "left" ? x - bounds.x : x;
  const top = y - Math.min(-size, bounds.y);
  return {
    markup: lines.map((line, i) =>
      `<text x="${left + anchorX}" y="${
        top + i * lineHeight
      }" text-anchor="${anchor}" font-size="${size}" fill="${
        escapeXml(color)
      }" xml:space="preserve">${escapeXml(line)}</text>`
    ).join(""),
    bounds: { ...bounds, x: left + bounds.x, y: top + bounds.y },
    height: Math.max(
      lines.length * lineHeight,
      top - y + bounds.y + bounds.height,
    ),
  };
}

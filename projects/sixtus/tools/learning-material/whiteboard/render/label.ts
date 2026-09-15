import { fitGraphText, graphTextBounds } from "./font.ts";
import type { ScenePart } from "./targets.ts";
import { escapeXml } from "./svg.ts";
import { COLORS, TYPE_SCALE } from "./theme.ts";

/** Draw exactly the normalized/truncated string that was measured. */
export function textLabel(value: string, x: number, y: number, size: number = TYPE_SCALE.label, anchor = "start", color: string = COLORS.ink, maxWidth = Infinity): ScenePart {
  const visible = fitGraphText(value, size, maxWidth);
  const bounds = graphTextBounds(visible, size, x, y, anchor);
  return {
    markup: `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${escapeXml(color)}"><title>${escapeXml(value)}</title>${escapeXml(visible)}</text>`,
    bounds,
    obstacles: bounds ? [{ bounds, kind: "text" }] : [],
  };
}

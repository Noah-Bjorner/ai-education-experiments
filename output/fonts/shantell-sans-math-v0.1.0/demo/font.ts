// Demo-only snapshot of the project font loader with the extended font assets.
// Selected by this demo import map; application files are not modified.
import { escapeXml } from "../../../../projects/sixtus/tools/learning-material/visualization/static/shared/svg.ts";
import metrics from "../shantell-sans-math-metrics.json" with { type: "json" };
import {
  type Bounds,
  unionBounds,
} from "../../../../projects/sixtus/tools/learning-material/whiteboard/render/bounds.ts";

export const GRAPH_FONT_FAMILY = "Shantell Sans Math";

// Module initialization runs once per server process/isolate. All graph renders
// reuse these bytes and the resulting markup; no network requests at runtime.
const [fontBytes, license] = await Promise.all([
  Deno.readFile(new URL("../ShantellSansMath-Medium.woff2", import.meta.url)),
  Deno.readTextFile(new URL("../OFL.txt", import.meta.url)),
]);
const base64 = btoa(
  Array.from(fontBytes, (byte) => String.fromCharCode(byte)).join(""),
);

/** Embed once in the root SVG, even if that SVG contains several graph groups. */
export const GRAPH_FONT_DEFS = `<defs>
  <style>@font-face {
    font-family: "${GRAPH_FONT_FAMILY}";
    src: url("data:font/woff2;base64,${base64}") format("woff2");
    font-weight: 500;
    font-style: normal;
  }</style>
</defs>
<metadata>${escapeXml(license)}</metadata>`;

// Disable synthetic weights and optional shaping so measurements and browser
// text use the same simple character advances. This bundled file is Medium (500).
export const GRAPH_FONT_STYLE =
  `font-family:'${GRAPH_FONT_FAMILY}',sans-serif; font-weight:500; font-style:normal; font-synthesis:none; font-kerning:none; font-variant-ligatures:none`;

const advances: Record<string, number> = metrics.advances;
const glyphBounds: Record<string, number[] | null> = metrics.glyphBounds;

/** Painted letter extents, not advance widths (which also include whitespace). */
export function graphTextBounds(
  value: string,
  fontSize: number,
  x: number,
  y: number,
  anchor = "start",
): Bounds | null {
  const normalized = value.normalize("NFC");
  const width = measureGraphText(normalized, fontSize);
  const origin = x -
    (anchor === "middle" ? width / 2 : anchor === "end" ? width : 0);
  const scale = fontSize / metrics.unitsPerEm;
  const boxes: Bounds[] = [];
  let cursor = 0;
  for (const character of normalized) {
    const key = String(character.codePointAt(0));
    if (!(key in glyphBounds)) {
      // Unknown system fallback glyphs cannot be measured reliably on the server.
      throw new Error(
        `Shantell Sans has no glyph for '${character}'; provide font metrics before exporting tight bounds.`,
      );
    }
    const b = glyphBounds[key];
    if (b) {
      boxes.push({
        x: origin + (cursor + b[0]) * scale,
        y: y - b[3] * scale,
        width: (b[2] - b[0]) * scale,
        height: (b[3] - b[1]) * scale,
      });
    }
    cursor += advances[key];
  }
  return unionBounds(boxes);
}

/** Supported glyphs use real font advances. Other scripts use a fallback estimate. */
export function measureGraphText(value: string, fontSize: number): number {
  let width = 0;
  for (const character of value.normalize("NFC")) {
    width += advances[String(character.codePointAt(0))] ??
      metrics.fallbackAdvance;
  }
  return width / metrics.unitsPerEm * fontSize;
}

/** Truncate using font widths and Unicode characters, rather than string length. */
export function fitGraphText(
  value: string,
  fontSize: number,
  maxWidth: number,
): string {
  const normalized = value.normalize("NFC");
  if (measureGraphText(normalized, fontSize) <= maxWidth) return normalized;
  const ellipsis = "…";
  let width = measureGraphText(ellipsis, fontSize);
  if (width > maxWidth) return "";
  let result = "";
  for (const character of normalized) {
    const nextWidth = measureGraphText(character, fontSize);
    if (width + nextWidth > maxWidth) break;
    result += character;
    width += nextWidth;
  }
  return result + ellipsis;
}

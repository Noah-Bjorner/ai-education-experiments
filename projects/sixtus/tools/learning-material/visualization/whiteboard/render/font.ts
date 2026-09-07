import { escapeXml } from "../../static/shared/svg.ts";
import metrics from "./fonts/patrick-hand-metrics.json" with { type: "json" };

export const GRAPH_FONT_FAMILY = "Patrick Hand";

// Module initialization runs once per server process/isolate. All graph renders
// reuse these bytes and the resulting markup; no network requests at runtime.
const [fontBytes, license] = await Promise.all([
  Deno.readFile(new URL("./fonts/PatrickHand-Regular.woff2", import.meta.url)),
  Deno.readTextFile(new URL("./fonts/OFL.txt", import.meta.url)),
]);
const base64 = btoa(
  Array.from(fontBytes, (byte) => String.fromCharCode(byte)).join(""),
);

/** Embed once in the root SVG, even if that SVG contains several graph groups. */
export const GRAPH_FONT_DEFS = `<defs>
  <style>@font-face {
    font-family: "${GRAPH_FONT_FAMILY}";
    src: url("data:font/woff2;base64,${base64}") format("woff2");
    font-weight: 400;
    font-style: normal;
  }</style>
</defs>
<metadata>${escapeXml(license)}</metadata>`;

// Disable synthetic weights and optional shaping so measurements and browser
// text use the same simple character advances. Patrick Hand has one weight.
export const GRAPH_FONT_STYLE =
  `font-family:'${GRAPH_FONT_FAMILY}',sans-serif; font-weight:400; font-style:normal; font-synthesis:none; font-kerning:none; font-variant-ligatures:none`;

const advances: Record<string, number> = metrics.advances;

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

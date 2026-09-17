import type { WhiteboardFontMode } from "../schema.ts";
import { renderError } from "./issues.ts";
import { escapeXml } from "./svg.ts";
import metrics from "./fonts/shantell-sans-math-metrics.json" with {
  type: "json",
};
import { type Bounds, unionBounds } from "./bounds.ts";

export const GRAPH_FONT_FAMILY = "Shantell Sans Math";

// Module initialization runs once per server process/isolate. All graph renders
// reuse these bytes and the resulting markup; no network requests at runtime.
const [fontBytes, license] = await Promise.all([
  Deno.readFile(
    new URL("./fonts/ShantellSansMath-Medium.woff2", import.meta.url),
  ),
  Deno.readTextFile(new URL("./fonts/OFL.txt", import.meta.url)),
]);
const base64 = btoa(
  Array.from(fontBytes, (byte) => String.fromCharCode(byte)).join(""),
);

export const GRAPH_FONT_HOSTED_URL =
  "https://static.noahbjorner.com/sixtus/fonts/shantell-sans-math-medium.woff2";

function fontDefs(source: string): string {
  return `<defs>
  <style>@font-face {
    font-family: "${GRAPH_FONT_FAMILY}";
    src: url("${source}") format("woff2");
    font-weight: 500;
    font-style: normal;
  }</style>
</defs>`;
}

/** Include once in the root SVG, even with several graph groups. */
// Keep the license alongside font bytes distributed inside the SVG.
export const GRAPH_FONT_DEFS = fontDefs(`data:font/woff2;base64,${base64}`) +
  `\n<metadata>${escapeXml(license)}</metadata>`;
const HOSTED_FONT_DEFS = fontDefs(GRAPH_FONT_HOSTED_URL);

export function graphFontDefs(mode: WhiteboardFontMode = "embedded"): string {
  return mode === "hosted" ? HOSTED_FONT_DEFS : GRAPH_FONT_DEFS;
}

// Disable synthetic weights and optional shaping so measurements and browser
// text use the same simple character advances. This bundled file is Medium (500).
export const GRAPH_FONT_STYLE =
  `font-family:'${GRAPH_FONT_FAMILY}',sans-serif; font-weight:500; font-style:normal; font-synthesis:none; font-kerning:none; font-variant-ligatures:none`;

const advances: Record<string, number> = metrics.advances;
const glyphBounds: Record<string, number[] | null> = metrics.glyphBounds;

/** Combining accents MathJax already remaps; labels get the same spacing stand-ins. */
const GLYPH_ALIASES: Record<number, number> = {
  0x302: 94, // ̂ → ^
  0x303: 126, // ̃ → ~
  0x304: 175, // ̄ → ¯
  0x305: 175, // ̅ → ¯
  0x20d7: 0x2192, // ⃗ → →
};

function hasGlyph(code: number): boolean {
  return String(code) in glyphBounds;
}

/**
 * Keep NFC letters, replace a few math accents with painted stand-ins, and
 * drop other combining marks the font cannot measure.
 */
export function sanitizeGraphText(value: string): string {
  let result = "";
  for (const character of value.normalize("NFC")) {
    const code = character.codePointAt(0)!;
    if (hasGlyph(code)) {
      result += character;
      continue;
    }
    const aliased = GLYPH_ALIASES[code];
    if (aliased !== undefined && hasGlyph(aliased)) {
      result += String.fromCodePoint(aliased);
      continue;
    }
    if (/\p{M}/u.test(character)) continue;
    result += character;
  }
  return result;
}

/** Painted letter extents, not advance widths (which also include whitespace). */
export function graphTextBounds(
  value: string,
  fontSize: number,
  x: number,
  y: number,
  anchor = "start",
): Bounds | null {
  const normalized = sanitizeGraphText(value);
  const width = measureGraphText(normalized, fontSize);
  const origin = x -
    (anchor === "middle" ? width / 2 : anchor === "end" ? width : 0);
  const scale = fontSize / metrics.unitsPerEm;
  const boxes: Bounds[] = [];
  let cursor = 0;
  for (const character of normalized) {
    const key = String(character.codePointAt(0));
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

/** Use the same bundled glyph coverage for measurement and drawing. */
export function measureGraphText(value: string, fontSize: number): number {
  let width = 0;
  for (const character of sanitizeGraphText(value)) {
    const key = String(character.codePointAt(0));
    if (!(key in glyphBounds)) {
      throw renderError(
        "UNSUPPORTED_GLYPH",
        `${GRAPH_FONT_FAMILY} has no glyph for '${character}'; provide font metrics before exporting tight bounds.`,
      );
    }
    width += advances[key];
  }
  return width / metrics.unitsPerEm * fontSize;
}

/** Truncate using font widths and Unicode characters, rather than string length. */
export function fitGraphText(
  value: string,
  fontSize: number,
  maxWidth: number,
): string {
  const normalized = sanitizeGraphText(value);
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

/** Word wrapping retains whitespace and explicit blank lines; long tokens split by glyph. */
export function wrapGraphText(
  value: string,
  size: number,
  width: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of sanitizeGraphText(value).split("\n")) {
    let line = "";
    for (const token of paragraph.match(/\s+|\S+/g) ?? []) {
      if (measureGraphText(line + token, size) <= width) {
        line += token;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      for (const ch of token) {
        if (measureGraphText(ch, size) > width) {
          throw renderError(
            "CONTENT_DOES_NOT_FIT",
            "Text width is narrower than a glyph",
          );
        }
        if (measureGraphText(line + ch, size) > width) {
          lines.push(line);
          line = "";
        }
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

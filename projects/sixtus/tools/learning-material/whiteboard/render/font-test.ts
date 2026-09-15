import { assert, assertEquals, assertThrows } from "@std/assert";
import original from "./fonts/shantell-sans-metrics.json" with { type: "json" };
import extended from "./fonts/shantell-sans-math-metrics.json" with {
  type: "json",
};
import {
  fitGraphText,
  GRAPH_FONT_DEFS,
  GRAPH_FONT_FAMILY,
  graphTextBounds,
  sanitizeGraphText,
} from "./font.ts";
import { renderMathLatex } from "./latex.ts";

Deno.test("the extended whiteboard font preserves existing spacing and ink bounds", async () => {
  assertEquals(GRAPH_FONT_FAMILY, "Shantell Sans Math");
  assertEquals(extended.unitsPerEm, original.unitsPerEm);
  const advances: Record<string, number> = extended.advances;
  const bounds: Record<string, number[] | null> = extended.glyphBounds;
  for (const [code, advance] of Object.entries(original.advances)) {
    assertEquals(
      advances[code],
      advance,
      `Advance changed for U+${Number(code).toString(16)}`,
    );
    if (code === "8730") continue; // U+221A is inset to match letter weight.
    assertEquals(
      bounds[code],
      (original.glyphBounds as Record<string, unknown>)[code],
    );
  }
  const bytes = await Deno.readFile(
    new URL("./fonts/ShantellSansMath-Medium.woff2", import.meta.url),
  );
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  assertEquals(hash, extended.sourceSha256);
  const embedded = GRAPH_FONT_DEFS.match(/base64,([^"]+)/)![1];
  assertEquals(Uint8Array.from(atob(embedded), (c) => c.charCodeAt(0)), bytes);
});

Deno.test("all 93 added glyphs work in both whiteboard labels and math", () => {
  const additions = Object.keys(extended.advances).filter((code) =>
    !Object.hasOwn(original.advances, code)
  );
  assertEquals(additions.length, 93);
  for (const code of additions) {
    const character = String.fromCodePoint(Number(code));
    assert(graphTextBounds(character, 36, 0, 0), character);
    const math = renderMathLatex(`\\text{${character}}`);
    assert(math.markup.includes("<path"), character);
    assert(!math.markup.includes('d="MM'), character);
  }
});

Deno.test("plain text remaps or drops combining accents the font cannot paint", () => {
  assertEquals(sanitizeGraphText("v\u20D7"), "v→");
  assertEquals(fitGraphText("v\u20D7", 16, 200), "v→");
  assertEquals(
    graphTextBounds("v\u20D7", 16, 0, 0),
    graphTextBounds("v→", 16, 0, 0),
  );
  assertEquals(sanitizeGraphText("x\u0302"), "x\u0302");
  assert(graphTextBounds("x\u0302", 16, 0, 0));
  assertEquals(sanitizeGraphText("x\u0305"), "x¯");
  assertEquals(sanitizeGraphText("x\u20D6"), "x");
  assertThrows(
    () => graphTextBounds("🦄", 16, 0, 0),
    Error,
    "has no glyph",
  );
});

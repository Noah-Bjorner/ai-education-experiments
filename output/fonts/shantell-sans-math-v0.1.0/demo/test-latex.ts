/** Exercise the real whiteboard parser and renderer with the extended font. */
import { assert, assertEquals, assertThrows } from "@std/assert";
import { renderWhiteboardSvg } from "../../../../projects/sixtus/tools/learning-material/whiteboard/render/index.ts";
import { parseMathLatex } from "../../../../projects/sixtus/tools/learning-material/whiteboard/render/latex.ts";
import { GRAPH_FONT_FAMILY, graphTextBounds } from "./font.ts";
import oldMetrics from "../../../../projects/sixtus/tools/learning-material/whiteboard/render/fonts/shantell-sans-metrics.json" with {
  type: "json",
};
import metrics from "../shantell-sans-math-metrics.json" with { type: "json" };
import artwork from "../sources/artwork/manifest.json" with { type: "json" };

assertEquals(GRAPH_FONT_FAMILY, "Shantell Sans Math");
const advances: Record<string, number> = metrics.advances;
const bounds: Record<string, number[] | null> = metrics.glyphBounds;
for (const [cp, advance] of Object.entries(oldMetrics.advances)) {
  assertEquals(
    advances[cp],
    advance,
    `Original advance changed: U+${Number(cp).toString(16)}`,
  );
  assertEquals(
    bounds[cp],
    (oldMetrics.glyphBounds as Record<string, number[] | null>)[cp],
  );
}
assertEquals(artwork.glyphs.length, 93);
for (const glyph of artwork.glyphs) {
  assert(
    graphTextBounds(glyph.character, 36, 0, 0),
    `Missing glyph: ${glyph.unicode}`,
  );
  const one = renderWhiteboardSvg({
    layout: "single",
    children: [{
      type: "math_expressions",
      id: "glyph",
      title: glyph.unicode,
      expressions: [{ id: "sample", latex: `\\text{${glyph.character}}` }],
    }],
  });
  assert(
    one.svg.includes(glyph.character),
    `Glyph did not reach output: ${glyph.unicode}`,
  );
  assert(Number.isFinite(one.width) && Number.isFinite(one.height));
}

// Document the current parser boundary rather than silently rewriting commands.
assertThrows(
  () => parseMathLatex(String.raw`\alpha`),
  Error,
  "Unsupported command",
);
assertThrows(
  () => parseMathLatex(String.raw`\begin{matrix}1&2\end{matrix}`),
  Error,
);

const spec = {
  layout: "stack" as const,
  children: [
    {
      type: "math_expressions" as const,
      id: "algebra",
      title: "Fractions, roots, and powers",
      expressions: [
        {
          id: "quadratic",
          latex: String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
        },
        { id: "root", latex: String.raw`\sqrt[3]{8} = 2` },
        {
          id: "scripts",
          latex: String.raw`a_{i+1}^{2} \leq \left(\frac{b}{c}\right)^2`,
        },
      ],
    },
    {
      type: "math_expressions" as const,
      id: "greek",
      title: "Greek glyphs through text blocks",
      expressions: [
        {
          id: "triangle",
          latex: String.raw`\text{α}^2 + \text{β}^2 = \text{γ}^2`,
        },
        { id: "slope", latex: String.raw`\frac{\text{Δ}y}{\text{Δ}x} = m` },
        { id: "theta", latex: String.raw`\sin(\text{θ}) = \frac{a}{c}` },
      ],
    },
    {
      type: "math_expressions" as const,
      id: "symbols",
      title: "New symbols with baseline layout",
      expressions: [
        {
          id: "sets",
          latex: String.raw`x\,\text{∈}\,\text{ℝ} \quad A\,\text{⊆}\,B`,
        },
        { id: "logic", latex: String.raw`P\,\text{⇒}\,Q \quad a\,\text{⊥}\,b` },
        { id: "contour", latex: String.raw`\text{∮} f(z)\,dz = 0` },
      ],
    },
  ],
};
const rendered = renderWhiteboardSvg(spec);
assert(rendered.svg.includes("Shantell Sans Math"));
assertEquals([...rendered.svg.matchAll(/@font-face/g)].length, 1);
assert(!/NaN|Infinity/.test(rendered.svg));
const fontBytes = await Deno.readFile(
  new URL("../ShantellSansMath-Medium.woff2", import.meta.url),
);
const embedded = rendered.svg.match(/data:font\/woff2;base64,([^"\s]+)/)?.[1];
assert(embedded, "Missing embedded font");
assertEquals(
  Uint8Array.from(atob(embedded), (c) => c.charCodeAt(0)),
  fontBytes,
);
const output = new URL("./latex-preview.svg", import.meta.url);
await Deno.writeTextFile(output, rendered.svg);
await Deno.writeTextFile(
  new URL("./latex-examples.json", import.meta.url),
  JSON.stringify(spec, null, 2) + "\n",
);
console.log(
  `PASS: all ${artwork.glyphs.length} added glyphs render through the actual LaTeX/SVG pipeline.`,
);
console.log(
  `PASS: all ${
    Object.keys(oldMetrics.advances).length
  } original character advances and ink bounds are unchanged.`,
);
console.log("PASS: final SVG embeds the exact extended WOFF2 file.");
console.log(
  "Parser scope: use \\text{α} for the demo; \\alpha and matrix layouts remain unsupported.",
);
console.log(`Preview: ${output.pathname}`);

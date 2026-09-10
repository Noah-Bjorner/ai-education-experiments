# Shantell Sans Math Medium — v0.1.0

A custom upright Medium font based on the supplied Shantell Sans Medium, with all 93 reviewed mathematical glyph additions embedded as real Unicode characters. No manual FontForge import is needed.

## Use

- **ShantellSansMath-Medium.ttf** — desktop font, editable in FontForge and installable through your operating system's normal font tools.
- **ShantellSansMath-Medium.woff2** — compressed web font for the whiteboard or other web content.
- **shantell-sans-math-metrics.json** — glyph advances and ink bounds for the whiteboard's measured SVG renderer. Its hash identifies the WOFF2 file in this package.
- **preview.png** — rendered from the final TTF, including a 24-pixel text sample.
- **OFL.txt** — original copyright and SIL Open Font License, retained with this derivative.
- **build-info.json**, **validation.json** — provenance, checksums, and validation results.

CSS family: `Shantell Sans Math`. Weight: `500`. Style: `normal`. Some desktop applications display the face as `Shantell Sans Math Medium`.

```css
@font-face {
  font-family: "Shantell Sans Math";
  src: url("./ShantellSansMath-Medium.woff2") format("woff2");
  font-style: normal;
  font-weight: 500;
  font-display: swap;
}

.math {
  font-family: "Shantell Sans Math", sans-serif;
  font-weight: 500;
  font-style: normal;
}
```

The existing whiteboard's runtime font has not been replaced, and this package has not installed a system font. To adopt it in that renderer, load this WOFF2 and its matching metrics together, update the font family, and add the desired LaTeX command mappings/layout handling.

## Coverage and validation

- 655 original mapped characters plus 93 additions = **748 mapped characters**.
- All 1,123 original glyph outlines and horizontal/vertical metrics are preserved.
- Both TTF and WOFF2 tables parse successfully; Unicode assignments and renderer measurements match their exported font files.
- All added glyph bounds agree with the reviewed artwork to within 0.5 font unit after TrueType rounding, on a 1,000-unit em.
- Original Shantell Sans copyright, designer credits, and OFL license are retained. This is a custom derivative, not an official Shantell Sans release.

The font supplies the new symbol shapes. It does not include a TeX parser, an OpenType MATH table, extensible glyph assemblies, or italic/bold styles. Adding font characters alone does not enable new LaTeX commands in the current custom whiteboard parser.

## Rebuild

`sources/` contains the exact source WOFF2, the 93 SVG files, and their original manifest. `build_font.py` imports those outlines using the recorded baseline and advances; it does not require FontForge or Skia.

With Python and `fonttools[woff]` installed, run from this package directory:

```sh
python3 build_font.py --source sources/ShantellSans-Medium.woff2 --glyphs sources/artwork --output .
```

`verify_font.py` additionally requires Pillow. Its preview labels use the macOS Helvetica font:

```sh
python3 verify_font.py --source sources/ShantellSans-Medium.woff2 --glyphs sources/artwork --output .
```

## Test with the project's LaTeX renderer

From the **edu_experiments repository root**:

```sh
bash output/fonts/shantell-sans-math-v0.1.0/test-latex.sh
```

This type-checks and runs the real whiteboard parser and SVG renderer, using a demo-only import map to substitute the extended font loader. It does not replace the application's font or modify its parser. The demo font loader is a snapshot of `render/font.ts` with different asset paths/family; the remaining renderer modules are imported from the project.

The command checks all 93 added glyphs, checks exact agreement of all 655 original character advances/ink bounds, verifies the generated SVG contains the exact new WOFF2 bytes, and writes:

- `demo/latex-preview.svg`: fractions, roots, powers, Greek letters, sets, and symbols.
- `demo/latex-examples.json`: the corresponding editable whiteboard spec.

The current parser accepts `\text{α}`, but **still rejects `\alpha`**. The examples use text blocks for newly added characters; this is an honest test of glyph coverage within the currently supported syntax. Matrices and full integral/sum layout remain unsupported. The font itself does not provide those parser/layout features.

The demo must stay at its supplied location in this repository because it imports the project's renderer. The TTF/WOFF2 files and Python rebuild scripts can be used independently.

## Replacing the active whiteboard font

The project's active loader is `projects/sixtus/tools/learning-material/whiteboard/render/font.ts`. For adoption:

1. Copy `ShantellSansMath-Medium.woff2` and `shantell-sans-math-metrics.json` into the renderer's `fonts/` directory together.
2. Update the loader's WOFF2 path, metrics import, and `GRAPH_FONT_FAMILY` to `Shantell Sans Math`. Preserve its Medium/500 style and embedded license.
3. Restart the renderer process: the module reads and caches the font bytes at startup. Regenerate existing SVG exports if they should use the new font, because each exported SVG embeds its own font data.
4. Run the whiteboard tests and review representative chart/math outputs. Tests that deliberately expect newly supported glyphs such as Δ to fail will need new unsupported-character fixtures.

Verified compatibility: all original glyph outlines, horizontal and vertical metrics, and mapped-character ink bounds are preserved. The extended WOFF2 is 85,588 bytes versus 67,880 bytes for the original. This is a measured compatibility result, not a claim of complete LaTeX support or verification in every application.

## Name

The supplied source license contains no Reserved Font Name declaration. This package uses `Shantell Sans Math` to acknowledge its origin while distinguishing the custom extension from the original font. Original designer credits and copyright remain in the font and license. The prior package was named Whitespace Math simply to distinguish the derivative.

[OFL guidance on naming modified fonts](https://openfontlicense.org/ofl-faq/)

# Whitespace Math Medium — v0.1.0

A custom upright Medium font based on the supplied Shantell Sans Medium, with all 93 reviewed mathematical glyph additions embedded as real Unicode characters. No manual FontForge import is needed.

## Use

- **WhitespaceMath-Medium.ttf** — desktop font, editable in FontForge and installable through your operating system's normal font tools.
- **WhitespaceMath-Medium.woff2** — compressed web font for the whiteboard or other web content.
- **whitespace-math-metrics.json** — glyph advances and ink bounds for the whiteboard's measured SVG renderer. Its hash identifies the WOFF2 file in this package.
- **preview.png** — rendered from the final TTF, including a 24-pixel text sample.
- **OFL.txt** — original copyright and SIL Open Font License, retained with this derivative.
- **build-info.json**, **validation.json** — provenance, checksums, and validation results.

CSS family: `Whitespace Math`. Weight: `500`. Style: `normal`. Some desktop applications display the face as `Whitespace Math Medium`.

```css
@font-face {
  font-family: "Whitespace Math";
  src: url("./WhitespaceMath-Medium.woff2") format("woff2");
  font-style: normal;
  font-weight: 500;
  font-display: swap;
}

.math {
  font-family: "Whitespace Math", sans-serif;
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

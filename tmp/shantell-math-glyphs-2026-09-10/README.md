# Shantell Sans Medium — math glyph SVG drafts

93 individually defined math glyphs, designed against the supplied Shantell Sans Medium font. These are companion designs for review, not an official Shantell Sans release or complete mathematical font. The application's font was not changed and no fonts were installed.

## Files

- `svg/`: **the 93 files to import**, one symbol per file. Example: `greek-small-letter-alpha-u03b1.svg`.
- `manifest.csv`: Unicode assignments, advance widths, and font-coordinate bounds for manual import.
- `manifest.json`: the same information plus design notes and source component references.
- `previews/`: five labeled glyph proof sheets covering every new symbol, plus a mixed-text proof.
- `reference/`: four unchanged source glyph SVGs for import calibration, and the original font converted to TTF for reference rendering.
- `proof-only-not-installed.ttf`: an uninstalled proof font built by reading the exported SVG files and adding their outlines to a copy of the source font. Used to check rendering and Unicode mappings; not a production math font.
- `create_glyphs.py`: editable, individually authored construction definitions and exporter.
- `validate.py` and `validation.json`: structural and font-conversion checks.
- `OFL.txt`: the source font's copyright and license, retained for the reused and derived outlines.

Every glyph SVG contains black filled contours on a transparent canvas. There are no raster images, text elements, live strokes, masks, filters, or external assets. Stroke expansion and overlap removal were performed before export. Some shapes reuse suitable native outlines; new curved shapes follow the original's rounded terminals, approximately 100-unit strokes, 497-unit x-height, and 700-unit cap height.

## Coordinates and FontForge import

All SVGs use the **same 1400 × 1400 coordinate canvas**, with:

- 1 SVG coordinate unit = 1 intended font unit.
- Intended font em size: **1000**.
- SVG baseline: **y = 1020**.
- Conversion: `fontX = svgX`, `fontY = 1020 - svgY`.
- The larger canvas preserves tall glyphs, descenders, and the triple integral without clipping. **1400 is the artwork canvas, not the font em size or glyph advance.**

FontForge SVG import can apply scale and positioning changes. Calibrate once instead of guessing or individually fitting every glyph to its slot:

1. Open a copy of your Shantell Sans Medium font. Keep its existing 1000-unit em.
2. In a spare glyph slot, import `reference/reference-lowercase-o.svg` using **File → Import → SVG**.
3. Compare it with the existing lowercase o. Its intended bounds are **x = 51…569, y = -12…503** (width 518, height 515), and its advance is **621**.
4. If scaled, uniformly scale the import until those dimensions agree. If shifted, translate it until the bounds agree. Record the scale and translation. Because every SVG has the same canvas and origin, apply the same correction to the new imports. Do not crop each SVG to its artwork or auto-fit each glyph to a different size.
5. Open or create the Unicode slot specified in `manifest.csv`, import that symbol's SVG, and apply the calibrated correction.
6. Set its **advance width** to the manifest value. The outline already includes the intended left side bearing; do not center it by eye or use the 1400-unit canvas width as its advance.
7. Validate contours, correct direction/remove overlaps if FontForge reports a problem, and review the symbol alongside native letters. Save your editable font project before generating TTF/OTF.
8. Preserve the source copyright and OFL license. Use a distinct family name for your edited font, such as Whitespace Math.

These files were parsed, converted into TrueType glyphs, and visually reviewed in proof sheets. They have **not** been imported through FontForge itself, so the calibration step is intentional.

## Design and support scope

- All 93 entries in the prior missing-glyph checklist are included.
- Greek variants remain separate Unicode glyphs: ε/ϵ, θ/ϑ, κ/ϰ, φ/ϕ, ρ/ϱ, σ/ς, and π/ϖ.
- The new double/triple integrals reuse the font's native integral outline. Mathematical capitals whose shapes match Latin letters reuse suitable native outlines.
- Existing glyphs such as π, Ω, ∑, ∏, ∫, √, ∞, and ∂ remain unchanged.
- This is upright Medium artwork. Italic/bold styles, extensible glyph assemblies, kerning, and an OpenType MATH table are not supplied.
- Font glyph coverage does not add LaTeX parser or layout support. Those changes remain a separate renderer task.

## Rebuild

Use Python 3 with `fonttools[woff]`, `skia-python`, and `Pillow`. Run `create_glyphs.py`, then `validate.py`. The source-font location is declared near the top of the generator. No installation is needed to use the finished SVGs in FontForge.

Reference documentation:

- [FontForge: importing outline glyphs](https://fontforge.org/docs/tutorial/importexample.html)
- [Unicode Greek names and character assignments](https://www.unicode.org/charts/nameslist/n_0370.html)

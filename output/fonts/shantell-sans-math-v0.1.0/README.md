# Shantell Sans Math Medium — v0.1.0

The active whiteboard font: a custom upright Medium derivative of Shantell Sans.
It contains 748 mapped characters: the original 655 plus 93 math additions.
Original spacing is preserved. The square-root glyph (U+221A) is intentionally
thinned to match the letter weight; all other original outlines are preserved.

## Files

- `ShantellSansMath-Medium.ttf`: desktop font, editable in FontForge.
- `ShantellSansMath-Medium.woff2`: compressed web font.
- `shantell-sans-math-metrics.json`: advances, ink bounds, and WOFF2 checksum.
- `preview.png`: samples rendered from the verified TTF.
- `build-info.json` and `validation.json`: current provenance and verification results.
- `sources/`: original WOFF2, reviewed SVG artwork and manifest, and the approved
  radical outline fingerprint (`radical.json`). Keep these for rebuilding.
- `OFL.txt`: original copyright and SIL Open Font License.

Family: **Shantell Sans Math**. Weight: **500**. Style: **normal**.
This is a custom derivative, not an official Shantell Sans release.

## Whiteboard integration

The renderer in `projects/sixtus/tools/learning-material/whiteboard/render/`
loads the WOFF2 once and embeds it once per SVG, with its license. Ordinary labels
use SVG text; equations use MathJax with outlines from the same font.

Greek commands, fractions, roots, scripts, integrals, sums, matrices, cases, and
aligned equations are supported. Ordinary bold/italic math uses the Medium face.
Double-struck C/N/P/Q/R/Z use dedicated glyphs. Calligraphic/Fraktur alphabets and
unbundled symbols fail explicitly. The font has no OpenType MATH table; the
renderer supplies layout, enlarged operators, stretched delimiters, rounded
fraction bars, and the custom radical join/index placement.

## Rebuild everything

Install `fonttools[woff]`, `skia-pathops`, and `Pillow` in your Python environment.
The preview uses macOS Helvetica for captions. From the repository root:

```sh
python3 output/fonts/shantell-sans-math-v0.1.0/rebuild.py
deno test --allow-read projects/sixtus/tools/learning-material/whiteboard/render/*-test.ts
```

`rebuild.py` builds from the pristine source, applies the 14-unit radical inset
exactly once, verifies all glyphs against the source/artwork and the approved
radical fingerprint, refreshes the preview and reports, exports the matching
runtime WOFF2/metrics/outlines/layout data, and recreates the ZIP. Source timestamps
are retained so repeated builds produce identical font bytes. `thin_radical.py`
is an internal helper, not a post-processing command to run on an exported font.

The lower-level scripts remain available for building or inspecting the package
independently:

```sh
python3 build_font.py --source sources/ShantellSans-Medium.woff2 --glyphs sources/artwork --output .
python3 verify_font.py --source sources/ShantellSans-Medium.woff2 --glyphs sources/artwork --output .
```

Run those commands from this package directory. Run the repository-level rebuild
command after edits to synchronize the runtime and ZIP as well. An intentional
radical redesign requires reviewing the new outline and updating its fingerprint.

Restart a running renderer after rebuilding: it caches font bytes at module load.
Existing SVG exports keep their embedded font until regenerated. Browsers can
show the self-contained SVGs; converters that ignore embedded web fonts need the
font configured separately for text labels.

# Shantell Sans Math in whiteboard exports

All whiteboard text uses **Shantell Sans Math Medium (500)**, a custom derivative
of the supplied Shantell Sans Medium. It preserves all original 655 mapped
characters, outlines, advances, and vertical metrics, and adds 93 math glyphs
(748 mapped characters total). Original Swedish text and ordinary chart labels
retain their measurements. This is a custom extension, not an official release
of Shantell Sans. The original copyright and SIL OFL remain in `OFL.txt` and
are embedded in exported SVGs.

## Runtime assets

- `ShantellSansMath-Medium.woff2`: the extended font, 85,588 bytes.
- `shantell-sans-math-metrics.json`: advances, ink bounds, units per em, and
  SHA-256 of the bundled WOFF2.
- `shantell-sans-math-paths.json`: exact outlines extracted from this font for
  MathJax equation rendering. Ordinary whiteboard labels remain SVG text.
- `shantell-sans-math-layout.json`: enlarged display operators and long arrows,
  derived by scaling the same font outlines with corresponding layout metrics.
- `ShantellSans-Medium.woff2` and `shantell-sans-metrics.json`: original assets
  retained for regression checks and rollback; the runtime no longer loads them.

`../font.ts` loads the WOFF2 once at module startup and embeds it once per board.
Chart titles, axes, legends, annotations, and math titles share that loader.
Math uses `../math-font.ts` with MathJax's layout engine, drawing the font's own
outlines as paths. Delimiters stretch those outlines; fraction and radical bars
come from the layout engine. No browser fallback or runtime font downloads.

The extension is a single Medium face. Ordinary bold/italic math variants use
that face without synthetic styles. Calligraphic/Fraktur alphabets are rejected.
Double-struck C, N, P, Q, R, Z use the corresponding dedicated glyphs. Unbundled
symbols produce an explicit error; 93 additions do not cover all mathematics.

## Rebuilding

The editable glyph sources and font build are in the repository's
`output/fonts/shantell-sans-math-v0.1.0/` package. After changing that font,
regenerate the runtime assets together from the repository root:

```sh
python3 projects/sixtus/tools/learning-material/whiteboard/render/fonts/build.py output/fonts/shantell-sans-math-v0.1.0/ShantellSansMath-Medium.woff2
```

Requires FontTools with WOFF2 support in the development Python environment;
Python is not used by the application. Commit the generated font, metrics,
paths, and layout data together. The original font assets remain unchanged.

## Testing

From the repository root:

```sh
deno task whiteboard:math
deno test --allow-read projects/sixtus/tools/learning-material/whiteboard/render/*-test.ts projects/sixtus/tools/learning-material/whiteboard/math-local-test_test.ts
```

Open http://127.0.0.1:8787 to paste LaTeX, try examples, and save SVG or child
JSON. This uses the actual whiteboard renderer, without AI calls or uploads.

The extended WOFF2 adds about 24 KB of base64 markup per SVG compared with the
original font. Equation paths add content-dependent size. The SVG embeds its
font for browser `<img>` display; converters that ignore embedded web fonts
still need to load it explicitly for ordinary text labels.

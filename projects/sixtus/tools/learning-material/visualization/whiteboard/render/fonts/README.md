# Shantell Sans in exported SVGs

The graph renderer embeds Shantell Sans Medium (500) as a WOFF2 data URL. The
frontend can display the resulting file in an ordinary `<img>` without loading a
font stylesheet. Text remains SVG text, rather than outlined letter shapes.

## Assets and source

- `ShantellSans-Medium.woff2`: 67,880 bytes, containing all 655 mapped
  characters from the source font, including ÅÄÖåäö. No per-chart subsetting.
- `shantell-sans-metrics.json`: character advances and glyph ink bounds
  extracted from the same font, plus the SHA-256 of the uploaded WOFF2 for
  provenance.
- `OFL.txt`: the original copyright and SIL Open Font License. The license is
  also included in each exported SVG's metadata.
- `build.py`: optional development tool for preparing WOFF2 and metrics. The
  application does not depend on Python or FontTools.

The font was supplied as `ShantellSans-Medium-no-cyrillic.woff2`. This subset
removes Cyrillic characters and retains Swedish letters. It is stored
byte-for-byte under the stable runtime name `ShantellSans-Medium.woff2`, without
further subsetting or recompression, and uses the static Medium (500) weight.
Its embedded metadata credits The Shantell Sans Project Authors and identifies
the SIL Open Font License 1.1; `OFL.txt` carries that copyright and license
text.

To rebuild metrics, install `fonttools[woff]` in a development Python
environment and run
`python build.py /path/to/ShantellSans-Medium-no-cyrillic.woff2`. The script
copies WOFF2 bytes unchanged, or compresses a TTF/OTF input, and extracts
advances and ink bounds from that same source. Commit the font and metrics
together. The initial extraction used FontTools 4.64.0.

## Runtime and composition

`../font.ts` reads the local font and license asynchronously at module startup,
then caches the encoded markup through normal module caching. Rendering charts
does not fetch fonts or re-encode them. Keep these asset files available when
deploying or bundling the Deno application; Deno needs read permission for this
directory. The existing synchronous graph rendering API is unchanged.

`renderGraphSvg()` includes `GRAPH_FONT_DEFS` once in its root SVG. When
building a board from `renderXyGraph()` / `renderPieGraph()` groups, include
those same definitions once at the board root, not once per child. The board
compositor is still a scaffold.

From the parent `render` directory:

```sh
deno run --allow-read=fonts --allow-write=. graphs-test.ts
deno test --allow-read=fonts graphs-test.ts bounds-test.ts hatching-test.ts
```

## Trade-offs

Embedding this subset adds about 91 KB of base64 markup, plus its license, to an
uncompressed SVG, down from about 153 KB for the full Shantell Sans file. HTTP
compression can reduce transfer size. Each separate SVG repeats the font bytes.
A composed board can share one embedded copy; different SVG images cannot share
that copy through the browser's font-URL cache. Whole SVG files can still be
cached.

Using a fixed subset keeps exports simple and supports all its retained glyphs.
Subsetting to just the characters in a chart could reduce file size later, at
the cost of another generation step and more caching logic.

The uploaded file provides the Medium (500) weight. Synthetic bold and italic,
kerning, and optional ligatures are disabled so the simple advance-width
measurements match rendering. Text is normalized to NFC so decomposed Swedish
characters use the same glyphs. Tight graph exports reject visible characters
missing from the bundled subset, including Cyrillic and Greek Δ. A viewer's
fallback font has unknown painted bounds and could be clipped. Supporting more
scripts or mathematical typesetting requires an additional font with matching
metrics. Advance-only measurement remains an estimate for unsupported glyphs;
export-bound measurement fails explicitly.

Browser `<img>` display is the primary target and was visually verified. Some
SVG-to-PDF/image converters do not honor embedded web fonts; those tools must
load this font themselves or receive a separate export with text converted to
paths. Browser-specific rendering details can still vary slightly.

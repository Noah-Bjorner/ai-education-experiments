# Patrick Hand in exported SVGs

The graph renderer embeds Patrick Hand Regular (400) as a WOFF2 data URL. The
frontend can display the resulting file in an ordinary `<img>` without loading
a font stylesheet. Text remains SVG text, rather than outlined letter shapes.

## Assets and source

- `PatrickHand-Regular.woff2`: 62,688 bytes, containing all 515 mapped characters
  from the source font, including ÅÄÖåäö. No per-chart subsetting.
- `patrick-hand-metrics.json`: character advances extracted from the same font,
  plus the SHA-256 of the original TTF for provenance.
- `OFL.txt`: the original copyright and SIL Open Font License. The license is
  also included in each exported SVG's metadata.
- `build.py`: optional development tool for rebuilding WOFF2 and metrics. The
  application does not depend on Python or FontTools.

Sources downloaded from the official Google Fonts repository:

- [Font](https://github.com/google/fonts/blob/main/ofl/patrickhand/PatrickHand-Regular.ttf)
- [License](https://github.com/google/fonts/blob/main/ofl/patrickhand/OFL.txt)

To rebuild from an original TTF, install `fonttools[woff]` in a development Python
environment and run `python build.py /path/to/PatrickHand-Regular.ttf`. Commit the
WOFF2 and metrics together. The initial conversion used FontTools 4.64.0.

## Runtime and composition

`../font.ts` reads the local font and license asynchronously at module startup,
then caches the encoded markup through normal module caching. Rendering charts
does not fetch fonts or re-encode them. Keep these asset files available when
deploying or bundling the Deno application; Deno needs read permission for this
directory. The existing synchronous graph rendering API is unchanged.

`renderGraphSvg()` includes `GRAPH_FONT_DEFS` once in its root SVG. When building
a board from `renderXyGraph()` / `renderPieGraph()` groups, include those same
definitions once at the board root, not once per child. The board compositor is
still a scaffold.

From the parent `render` directory:

```sh
deno run --allow-read=fonts --allow-write=. graphs-test.ts
deno test --allow-read=fonts graphs-test.ts
```

## Trade-offs

Embedding adds about 88 KB of uncompressed SVG markup, including the font's
base64 encoding and license. In the two initial demos it added approximately
66 KB after gzip. These are local compression measurements, not a guarantee
of transfer size: serving the assets with HTTP compression is a separate step.
Each separate SVG repeats the font bytes. A board with multiple chart groups
can share one embedded copy; different SVG images cannot share that copy through
the browser's normal font-URL cache. Whole SVG files can still be cached.

Using the full font keeps exports simple and supports all its existing glyphs.
Subsetting to just the characters in a chart could reduce file size later, at
the cost of another generation step and more caching logic.

Patrick Hand provides one weight. Synthetic bold and italic, kerning, and optional
ligatures are disabled so the simple advance-width measurements match rendering.
Text is normalized to NFC so decomposed Swedish characters use the same glyphs.
Characters missing from Patrick Hand, such as Greek Δ and subscript ₂, can fall
back to the viewer's sans-serif font; their widths are only estimated. Supporting
more scripts or complex mathematical typesetting needs a broader font strategy.

Browser `<img>` display is the primary target and was visually verified. Some
SVG-to-PDF/image converters do not honor embedded web fonts; those tools must
load this font themselves or receive a separate export with text converted to
paths. Browser-specific rendering details can still vary slightly.

"""One-time asset preparation: python build.py /path/to/ShantellSansMath-Medium.woff2.

Requires fonttools[woff]. Not used by the application or chart rendering.
"""
import hashlib
import json
from pathlib import Path
import sys
import shutil

from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

source = Path(sys.argv[1])
destination = Path(__file__).parent
font = TTFont(source)
cmap = font.getBestCmap()
glyphs = font.getGlyphSet()

def glyph_bounds(name):
    pen = BoundsPen(glyphs)
    glyphs[name].draw(pen)
    return pen.bounds  # Font coordinates: y increases upward; spaces return None.

metrics = {
    "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "unitsPerEm": font["head"].unitsPerEm,
    "fallbackAdvance": font["hmtx"].metrics[".notdef"][0],
    "advances": {str(code): font["hmtx"].metrics[glyph][0]
                 for code, glyph in sorted(cmap.items())},
    "glyphBounds": {str(code): glyph_bounds(glyph)
                    for code, glyph in sorted(cmap.items())},
}
(destination / "shantell-sans-math-metrics.json").write_text(
    json.dumps(metrics, indent=2) + "\n"
)
# Preserve the uploaded WOFF2 byte-for-byte; only convert if given a TTF/OTF.
output = destination / "ShantellSansMath-Medium.woff2"
if source.suffix.lower() == ".woff2":
    if source.resolve() != output.resolve():
        shutil.copyfile(source, output)
else:
    font.flavor = "woff2"
    font.save(output)
# MathJax consumes paths in 1000-units-per-em font coordinates. Extract from
# the same exported font used by SVG text, with no alternate system font.
font = TTFont(output)
glyphs = font.getGlyphSet()
paths = {}
for code, name in sorted(font.getBestCmap().items()):
    pen = SVGPathPen(glyphs, ntos=lambda v: format(v, ".3f").rstrip("0").rstrip(".") if v else "0")
    scale = 1000 / font["head"].unitsPerEm
    glyphs[name].draw(TransformPen(pen, (scale, 0, 0, scale, 0, 0)))
    paths[str(code)] = pen.getCommands()
(destination / "shantell-sans-math-paths.json").write_text(json.dumps(paths, separators=(",", ":")) + "\n")
# Layout-sized versions of existing outlines, not additional font glyphs.
# MathJax's long-arrow commands and display operators need matching metrics.
layout_glyphs = {}
variants = [(str(dst), src, 1.65, 1) for dst, src in {
    0x27f5: 0x2190, 0x27f6: 0x2192, 0x27f7: 0x2194,
    0x27f8: 0x21d0, 0x27f9: 0x21d2, 0x27fa: 0x21d4, 0x27fc: 0x21a6,
}.items()]
variants += [(f"-largeop:{ord(c)}", ord(c), 1.35, 1.35) for c in "∑∏∫∬∭∮∪∩∧∨⊕⊗"]
for key, code, sx, sy in variants:
    name = font.getBestCmap()[code]
    pen = SVGPathPen(glyphs, ntos=lambda v: format(v, ".3f").rstrip("0").rstrip(".") if v else "0")
    glyphs[name].draw(TransformPen(pen, (sx, 0, 0, sy, 0, 0)))
    b = glyph_bounds(name)
    layout_glyphs[key] = [b[3]*sy/1000, -b[1]*sy/1000,
                         font["hmtx"].metrics[name][0]*sx/1000, {"p": pen.getCommands()[1:-1]}]
(destination / "shantell-sans-math-layout.json").write_text(json.dumps(layout_glyphs, separators=(",", ":")) + "\n")
# Keep the font's own copyright with the standard SIL license text.
license_path = destination / "OFL.txt"
license_text = license_path.read_text()
copyright = font["name"].getDebugName(0)
if not copyright:
    raise ValueError("Font must have a copyright notice")
license_path.write_text(copyright + "\n\n" + license_text.split("\n\n", 1)[1])
print("Wrote WOFF2, character advances, glyph bounds, and copyright to", destination)

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
# Keep the font's own copyright with the standard SIL license text.
license_path = destination / "OFL.txt"
license_text = license_path.read_text()
copyright = font["name"].getDebugName(0)
if not copyright:
    raise ValueError("Font must have a copyright notice")
license_path.write_text(copyright + "\n\n" + license_text.split("\n\n", 1)[1])
print("Wrote WOFF2, character advances, glyph bounds, and copyright to", destination)

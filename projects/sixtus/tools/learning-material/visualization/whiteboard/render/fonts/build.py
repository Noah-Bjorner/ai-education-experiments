"""One-time asset preparation: python build.py /path/to/PatrickHand-Regular.ttf.

Requires fonttools[woff]. Not used by the application or chart rendering.
"""
import hashlib
import json
from pathlib import Path
import sys

from fontTools.ttLib import TTFont

source = Path(sys.argv[1])
destination = Path(__file__).parent
font = TTFont(source)
cmap = font.getBestCmap()
metrics = {
    "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "unitsPerEm": font["head"].unitsPerEm,
    "fallbackAdvance": font["hmtx"].metrics[".notdef"][0],
    "advances": {str(code): font["hmtx"].metrics[glyph][0]
                 for code, glyph in sorted(cmap.items())},
}
(destination / "patrick-hand-metrics.json").write_text(
    json.dumps(metrics, indent=2) + "\n"
)
# Preserve all glyphs, naming, and license metadata. Only compress the container.
font.flavor = "woff2"
font.save(destination / "PatrickHand-Regular.woff2")
print("Wrote WOFF2 and character advances to", destination)

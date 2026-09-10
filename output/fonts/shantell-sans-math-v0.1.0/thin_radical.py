"""Inset U+221A so the radical matches letter weight more closely.

Build helper used by build_font.py; always derives from the pristine source.
Requires skia-pathops. Does not read or write exported font files.
"""
import pathops
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

INSET = 14


def erode(src: pathops.Path, inset: float) -> pathops.Path:
    fill = pathops.Path(src)
    rim = pathops.Path(src)
    rim.stroke(
        2 * inset,
        pathops.LineCap.ROUND_CAP,
        pathops.LineJoin.ROUND_JOIN,
        4,
    )
    rim.convertConicsToQuads()
    inner = pathops.op(fill, rim, pathops.PathOp.INTERSECTION, fix_winding=True)
    return pathops.op(fill, inner, pathops.PathOp.DIFFERENCE, fix_winding=True)


def apply_radical(font: TTFont, original: TTFont) -> None:
    glyf = font["glyf"]
    glyphs = original.getGlyphSet()
    name = font.getBestCmap()[0x221A]
    src = pathops.Path()
    glyphs[name].draw(src.getPen())
    # The original √ overlaps itself at the hook and the crotch. Inset of
    # that raw outline reverses those corners into holes; union first.
    src = pathops.op(src, src, pathops.PathOp.UNION, fix_winding=True)
    eroded = erode(src, INSET)
    contours = sorted(eroded.contours, key=lambda c: abs(c.area), reverse=True)
    if not contours:
        raise RuntimeError("Radical inset produced no contours")
    out = pathops.Path()
    out.addPath(contours[0])
    pen = TTGlyphPen(None)
    out.draw(Cu2QuPen(pen, max_err=0.6))
    glyph = pen.glyph()
    glyph.recalcBounds(glyf)
    glyf[name] = glyph
    advance, _ = font["hmtx"][name]
    font["hmtx"][name] = (advance, glyph.xMin)

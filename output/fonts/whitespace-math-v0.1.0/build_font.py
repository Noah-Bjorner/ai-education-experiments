"""Build Whitespace Math Medium from Shantell Sans and the reviewed SVG glyphs.
Usage: python build_font.py --source source.woff2 --glyphs glyph-folder --output out
Requires fonttools[woff]. SVG inputs and source font are never modified.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import parse_path


def build(source: Path, artwork: Path, output: Path):
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((artwork / 'manifest.json').read_text())
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    if source_hash != manifest['source_sha256']:
        raise ValueError('Source font differs from the font used to design these glyphs.')
    font = TTFont(source)
    font.ensureDecompiled()  # Materialize tables before extending the glyph count.
    font.flavor = None
    if font['head'].unitsPerEm != manifest['units_per_em']:
        raise ValueError('SVG artwork and source font must use the same em size.')
    original_order = list(font.getGlyphOrder())
    original_cmap = dict(font.getBestCmap())
    vmetrics = font['vmtx'].metrics if 'vmtx' in font else None
    order = original_order.copy()
    new_names = {}
    for entry in manifest['glyphs']:
        cp = int(entry['unicode'][2:], 16)
        if cp in original_cmap or cp in new_names:
            raise ValueError(f'Unexpected existing/duplicate character: {entry["unicode"]}')
        name = f'whitespace.uni{cp:04X}'
        if name in font['glyf']:
            raise ValueError(f'Existing glyph name: {name}')
        root = ET.parse(artwork / entry['svg']).getroot()
        paths = root.findall('{http://www.w3.org/2000/svg}path')
        if len(paths) != 1 or paths[0].attrib.get('stroke'):
            raise ValueError(f'Expected a single filled outline: {entry["svg"]}')
        pen = TTGlyphPen(None)
        mapped = TransformPen(Cu2QuPen(pen, max_err=0.6),
                              (1, 0, 0, -1, 0, manifest['svg_baseline_y']))
        parse_path(paths[0].attrib['d'], mapped)
        glyph = pen.glyph()
        glyph.recalcBounds(font['glyf'])
        font['glyf'][name] = glyph
        # TrueType bearings refer to the glyph control-point box, not ink extrema.
        font['hmtx'][name] = (entry['advance_width'], glyph.xMin)
        if vmetrics is not None:
            vmetrics[name] = (font['vhea'].ascent - font['vhea'].descent,
                              font['vhea'].ascent - glyph.yMax)
        order.append(name)
        new_names[cp] = name
        for table in font['cmap'].tables:
            if table.isUnicode():
                if table.format in (4, 6) and cp > 0xFFFF:
                    continue
                table.cmap[cp] = name
    font.setGlyphOrder(order)
    font['OS/2'].recalcUnicodeRanges(font)
    # Retain weight 500 and the source's Regular style-linking flags. Medium is
    # represented by typographic family/subfamily (IDs 16/17), as in the source.
    replacement = {
        1: 'Whitespace Math Medium', 2: 'Regular',
        3: '0.100;Whitespace;WhitespaceMath-Medium',
        4: 'Whitespace Math Medium', 5: 'Version 0.100',
        6: 'WhitespaceMath-Medium',
        10: 'Derived from Shantell Sans Medium. Adds 93 custom mathematical glyphs for Whitespace. '
            'Original font by The Shantell Sans Project Authors; see copyright, designer credits, and OFL license. '
            'Upright Medium; no OpenType MATH layout table.',
        16: 'Whitespace Math', 17: 'Medium',
        18: 'Whitespace Math Medium', 21: 'Whitespace Math', 22: 'Medium',
        25: 'WhitespaceMath',
    }
    # Replace across existing language records to avoid stale family identities.
    for name_id, value in replacement.items():
        font['name'].names = [n for n in font['name'].names if n.nameID != name_id]
        for platform, encoding, language in [(3, 1, 0x409), (1, 0, 0)]:
            font['name'].setName(value, name_id, platform, encoding, language)
    font['head'].fontRevision = 0.1
    if 'DSIG' in font:
        del font['DSIG']
    ttf = output / 'WhitespaceMath-Medium.ttf'
    woff = output / 'WhitespaceMath-Medium.woff2'
    font.save(ttf)
    webfont = TTFont(ttf)
    webfont.flavor = 'woff2'
    webfont.save(woff)
    final = TTFont(woff)
    glyphs = final.getGlyphSet()
    def bounds(name):
        pen = BoundsPen(glyphs)
        glyphs[name].draw(pen)
        return pen.bounds
    cmap = final.getBestCmap()
    metrics = {
        'sourceSha256': hashlib.sha256(woff.read_bytes()).hexdigest(),
        'unitsPerEm': final['head'].unitsPerEm,
        'fallbackAdvance': final['hmtx']['.notdef'][0],
        'advances': {str(cp): final['hmtx'][name][0] for cp, name in sorted(cmap.items())},
        'glyphBounds': {str(cp): bounds(name) for cp, name in sorted(cmap.items())},
    }
    (output / 'whitespace-math-metrics.json').write_text(json.dumps(metrics, indent=2) + '\n')
    shutil.copyfile(artwork / 'OFL.txt', output / 'OFL.txt')
    (output / 'build-info.json').write_text(json.dumps({
        'family': 'Whitespace Math', 'style': 'Medium', 'weight': 500,
        'version': '0.100', 'original_font_sha256': source_hash,
        'ttf_sha256': hashlib.sha256(ttf.read_bytes()).hexdigest(),
        'woff2_sha256': hashlib.sha256(woff.read_bytes()).hexdigest(),
        'original_character_count': len(original_cmap), 'added_character_count': len(new_names),
        'character_count': len(cmap), 'original_glyph_count': len(original_order),
        'glyph_count': len(order),
    }, indent=2) + '\n')
    print(f'Built {ttf.name} and {woff.name}: {len(cmap)} mapped characters, {len(new_names)} additions.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--glyphs', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path(__file__).parent)
    args = parser.parse_args()
    build(args.source, args.glyphs, args.output)

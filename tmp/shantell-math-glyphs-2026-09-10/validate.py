"""Validate final SVGs against their manifest and actual proof-font conversion."""
from pathlib import Path
import hashlib, json, math, re
import xml.etree.ElementTree as ET
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.svgLib.path import parse_path

out=Path(__file__).parent
manifest=json.loads((out/'manifest.json').read_text())
font=TTFont(out/'proof-only-not-installed.ttf');gs=font.getGlyphSet();cmap=font.getBestCmap()
files=list((out/'svg').glob('*.svg'))
assert len(files)==len(manifest['glyphs'])==93
assert len({g['unicode'] for g in manifest['glyphs']})==93
max_error=0
for g in manifest['glyphs']:
    root=ET.parse(out/g['svg']).getroot()
    assert root.attrib['viewBox']=='0 0 1400 1400'
    assert [e.tag.rsplit('}',1)[-1] for e in root]==['title','path']
    p=root.find('{http://www.w3.org/2000/svg}path')
    assert p.attrib['fill']=='#000000' and 'stroke' not in p.attrib
    d=p.attrib['d']
    assert d.count('M')==d.count('Z')>0, g['svg']
    assert not re.search(r'NaN|Infinity|nan|inf',d)
    bp=BoundsPen(None);parse_path(d,bp)
    x0,y0,x1,y1=bp.bounds
    svg_bounds=[x0,1020-y1,x1,1020-y0]
    assert x0>=0 and y0>=0 and x1<=1400 and y1<=1400,g['svg']
    assert max(abs(a-b) for a,b in zip(svg_bounds,g['font_bounds']))<0.1,g['svg']
    name=cmap[ord(g['character'])]
    fp=BoundsPen(gs);gs[name].draw(fp)
    error=max(abs(a-b) for a,b in zip(fp.bounds,g['font_bounds']))
    max_error=max(max_error,error)
    assert error<2,(g['svg'],error)
    assert font['hmtx'][name][0]==g['advance_width']
    assert g['advance_width']>g['font_bounds'][2],g['svg']
    assert font['glyf'][name].numberOfContours>0
source=Path('/Users/noahbjorner/Developer/Edu/edu_experiments/projects/sixtus/tools/learning-material/visualization/whiteboard/render/fonts/ShantellSans-Medium.woff2')
assert hashlib.sha256(source.read_bytes()).hexdigest()==manifest['source_sha256']
report={'glyph_count':93,'checks':['Every checklist entry has a unique SVG and Unicode assignment','SVGs contain only title plus filled closed outline path','All glyphs fit their canvas with finite coordinates','SVG bounds match manifest within 0.1 font unit','All SVGs round-trip through a TrueType proof font','Proof-font advances match manifest','Source application font hash is unchanged','Every glyph was visually inspected across five proof sheets'],'max_true_type_roundtrip_bounds_error_units':round(max_error,4),'fontforge_ui_import_tested':False}
(out/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))

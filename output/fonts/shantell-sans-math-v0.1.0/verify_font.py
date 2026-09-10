"""Check exported TTF/WOFF2 against source font and SVG manifest."""
import argparse, hashlib, json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.boundsPen import BoundsPen
from PIL import Image, ImageDraw, ImageFont

def verify(source, artwork, output):
    original = TTFont(source)
    original.ensureDecompiled()
    manifest = json.loads((artwork / 'manifest.json').read_text())
    metrics = json.loads((output / 'shantell-sans-math-metrics.json').read_text())
    radical = json.loads((artwork.parent / 'radical.json').read_text())
    radical_name = original.getBestCmap()[0x221A]
    original_order = original.getGlyphOrder()
    original_set = original.getGlyphSet()
    original_cmap = original.getBestCmap()
    added = {ord(entry['character']) for entry in manifest['glyphs']}
    outlines = {}
    for name in original_order:
        pen = RecordingPen(); original_set[name].draw(pen); outlines[name] = pen.value
    max_error = 0
    exports = {}
    for extension in ['ttf', 'woff2']:
        font_path = output / f'ShantellSansMath-Medium.{extension}'
        font = TTFont(font_path, checkChecksums=2)
        font.ensureDecompiled()
        assert font.getGlyphOrder()[:len(original_order)] == original_order
        assert len(font.getGlyphOrder()) == len(original_order) + 93
        cmap = font.getBestCmap()
        assert set(cmap) == set(original_cmap) | added
        assert len(cmap) == 748
        assert font['OS/2'].usWeightClass == 500
        assert font['head'].unitsPerEm == 1000
        assert font['name'].getDebugName(16) == 'Shantell Sans Math'
        assert font['name'].getDebugName(17) == 'Medium'
        assert font['name'].getDebugName(6) == 'ShantellSansMath-Medium'
        assert font['name'].getDebugName(0) == original['name'].getDebugName(0)
        assert font['name'].getDebugName(13) == original['name'].getDebugName(13)
        glyphs = font.getGlyphSet()
        for name in original_order:
            pen = RecordingPen(); glyphs[name].draw(pen)
            if name == radical_name:
                digest = hashlib.sha256(json.dumps(pen.value, separators=(',', ':')).encode()).hexdigest()
                assert digest == radical['outline_sha256'], 'Reviewed radical outline changed'
                assert list(font['hmtx'][name]) == radical['horizontal_metrics']
                assert font['hmtx'][name][0] == original['hmtx'][name][0]
            else:
                assert pen.value == outlines[name], f'Original outline changed: {name}'
                assert font['hmtx'][name] == original['hmtx'][name]
            assert font['vmtx'][name] == original['vmtx'][name]
        for entry in manifest['glyphs']:
            name = cmap[ord(entry['character'])]
            assert font['hmtx'][name][0] == entry['advance_width']
            pen = BoundsPen(glyphs); glyphs[name].draw(pen)
            error = max(abs(a-b) for a,b in zip(pen.bounds, entry['font_bounds']))
            max_error = max(max_error, error)
            assert error < 2, (entry['character'], error)
            assert font['glyf'][name].numberOfContours > 0
        for cp, name in cmap.items():
            pen = BoundsPen(glyphs); glyphs[name].draw(pen)
            assert metrics['advances'][str(cp)] == font['hmtx'][name][0]
            assert metrics['glyphBounds'][str(cp)] == (list(pen.bounds) if pen.bounds else None)
        exports[extension] = {'bytes': font_path.stat().st_size,
                              'sha256': hashlib.sha256(font_path.read_bytes()).hexdigest()}
    assert metrics['sourceSha256'] == exports['woff2']['sha256']
    assert hashlib.sha256(source.read_bytes()).hexdigest() == manifest['source_sha256']
    build_info = json.loads((output / 'build-info.json').read_text())
    for extension, export in exports.items():
        assert build_info[f'{extension}_sha256'] == export['sha256']
    # Inspect actual exported face at both large and body sizes without installing it.
    image = Image.new('RGB', (1500, 970), '#faf9f6')
    draw = ImageDraw.Draw(image)
    ttf = str(output / 'ShantellSansMath-Medium.ttf')
    caption = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)
    heading = ImageFont.truetype(ttf, 58)
    draw.text((42, 24), 'Shantell Sans Math Medium', font=heading, fill='#252726')
    rows = [
        ('Original Latin and Swedish characters', 'Aa Bb Cc Dd Ee Rr Xx — ÅÄÖ åäö 0123456789'),
        ('Greek alphabet and variants', 'α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω'),
        ('Capitals and variant forms', 'Γ Δ Θ Λ Ξ Π Σ Υ Φ Ψ Ω    ε ϵ   θ ϑ   φ ϕ   ρ ϱ'),
        ('Calculus and radical', '√x   ∇f   ∂f   ∫ f(x)   ∬ f(x,y)   ∭ f(x,y,z)   ∮ f(z)'),
        ('Sets and logic', 'x ∈ ℝ   A ⊆ B   A ∩ B = ∅   ∀x ∃y   P ⇒ Q'),
        ('Number sets and relations', 'ℝ ℕ ℤ ℚ ℂ ℙ ℵ   a ≃ b   a ≅ b   a ∝ b   a ⊥ b'),
    ]
    for index, (label, line) in enumerate(rows):
        y = 135 + index * 112
        draw.text((42, y), label, font=caption, fill='#707777')
        draw.text((42, y+74), line, font=ImageFont.truetype(ttf, 45), fill='#252726', anchor='ls')
    draw.text((42, 822), 'Smaller text — 24 px', font=caption, fill='#707777')
    draw.text((42, 871), 'αβγδεζηθικλμνξοπρστυφχψω  ∈∉⊆⊇  ⇐⇒⇔  ℝℕℤℚℂℙ',
              font=ImageFont.truetype(ttf, 24), fill='#252726', anchor='ls')
    image.save(output / 'preview.png')
    report = {'status': 'passed', 'mapped_characters': 748, 'added_characters': 93,
              'preserved_original_glyphs': len(original_order) - 1,
              'modified_original_characters': ['U+221A'],
              'reviewed_radical_verified': True,
              'other_original_outlines_and_metrics_preserved': True,
              'ttf_and_woff2_tables_decompile': True,
              'unicode_mappings_and_renderer_metrics_verified': True,
              'source_font_unchanged': True,
              'maximum_added_glyph_bounds_error': round(max_error, 4), 'exports': exports}
    (output / 'validation.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--glyphs', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path(__file__).parent)
    args=parser.parse_args();verify(args.source, args.glyphs, args.output)

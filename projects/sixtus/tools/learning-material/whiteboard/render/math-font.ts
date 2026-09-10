import type { LiteElement } from "@mathjax/src/js/adaptors/lite/Element.js";
import type { LiteText } from "@mathjax/src/js/adaptors/lite/Text.js";
import type { LiteDocument } from "@mathjax/src/js/adaptors/lite/Document.js";
import { DIRECTION, SvgFontData, type SvgCharData } from "@mathjax/src/js/output/svg/FontData.js";
import { SvgMo } from "@mathjax/src/js/output/svg/Wrappers/mo.js";
import { SvgWrapperFactory } from "@mathjax/src/js/output/svg/WrapperFactory.js";
import metrics from "./fonts/shantell-sans-math-metrics.json" with { type: "json" };
import paths from "./fonts/shantell-sans-math-paths.json" with { type: "json" };

const outlines: Record<string, string> = paths;
const advances: Record<string, number> = metrics.advances;
const bounds: Record<string, number[] | null> = metrics.glyphBounds;
const blackboard: Record<number, number> = {
  67: 0x2102, 78: 0x2115, 80: 0x2119, 81: 0x211a,
  82: 0x211d, 90: 0x2124,
};

/** MathJax does the layout; every visible glyph comes from our actual font. */
export class ShantellMathFont extends SvgFontData {
  static override VariantSmp = {};
  static override NAME = "Shantell Sans Math";
  static override defaultParams = {
    ...SvgFontData.defaultParams,
    x_height: 0.497, axis_height: 0.28, rule_thickness: 0.045,
    surd_height: 0.045,
  };
  protected static override defaultSizeVariants = ["normal"];
  protected static override defaultStretchVariants = ["normal"];

  constructor() {
    super();
    const delimiters: Record<number, { dir: string; sizes: number[]; stretch: number[]; HDW: number[] }> = {};
    for (const [chars, dir] of [
      ["()[]{}|∥⌈⌉⌊⌋√↑↓", DIRECTION.Vertical],
      ["←→↔⇐⇒⇔↦‾¯^~", DIRECTION.Horizontal],
    ]) {
      for (const char of chars) {
        const n = char.codePointAt(0)!;
        if (!Object.hasOwn(outlines, n)) continue;
        const [h, d, w] = this.getChar("normal", n);
        delimiters[n] = { dir, sizes: [dir === DIRECTION.Vertical ? h + d : w], stretch: [0, n, 0], HDW: [h, d, w] };
      }
    }
    this.defineDelimiters(delimiters);
  }

  override getChar(variant: string, n: number): SvgCharData {
    // TeX accents use combining codepoints; these share the font's spacing outlines.
    n = ({ 0x302: 94, 0x303: 126, 0x304: 175, 0x305: 175,
      0x20d7: 0x2192, 0x2016: 0x2225 } as Record<number, number>)[n] ?? n;
    if (variant === "double-struck" && n < 128) {
      if (!blackboard[n]) throw new Error(`Shantell Sans Math has no double-struck glyph for '${String.fromCodePoint(n)}'.`);
      n = blackboard[n];
    }
    if (variant.includes("fraktur") || variant.includes("calligraphic") || variant === "script" || variant === "bold-script") {
      throw new Error("Shantell Sans Math does not include calligraphic or Fraktur alphabets.");
    }
    if (!Object.hasOwn(outlines, n)) {
      throw new Error(`Shantell Sans Math has no glyph for '${String.fromCodePoint(n)}' (U+${n.toString(16).toUpperCase()}).`);
    }
    const b = bounds[n];
    return [b ? b[3] / 1000 : 0, b ? -b[1] / 1000 : 0, advances[n] / 1000,
      { p: outlines[n].slice(1, -1) }];
  }
}

/** Stretch the font's own outline instead of assembling pieces from a second font. */
// MathJax's mixin declaration exposes two equivalent constructor signatures.
// @ts-expect-error Same upstream generic mixin constructor mismatch as SvgMo itself.
class ShantellMo extends SvgMo {
  protected stretchSvg() {
    const n = this.stretch.c || this.getText().codePointAt(0)!;
    const [h, d, w, data] = this.font.getChar("normal", n);
    const b = this.getBBox();
    const vertical = this.stretch.dir === DIRECTION.Vertical;
    const sx = vertical ? 1 : b.w / w;
    const sy = vertical ? (b.h + b.d) / (h + d) : 1;
    const y = vertical ? b.h - h * sy : 0;
    for (const parent of this.dom) {
      if (parent) this.adaptor.append(parent, this.svg("path", {
        d: data!.p ? `M${data!.p}Z` : "", transform: `translate(0 ${y * 1000}) scale(${sx} ${sy})`,
      }));
    }
  }
}

export class ShantellWrapperFactory extends SvgWrapperFactory<LiteElement, LiteText, LiteDocument> {
  static override defaultNodes = { ...SvgWrapperFactory.defaultNodes, mo: ShantellMo };
}

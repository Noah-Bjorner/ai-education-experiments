import type { LiteElement } from "@mathjax/src/js/adaptors/lite/Element.js";
import type { LiteText } from "@mathjax/src/js/adaptors/lite/Text.js";
import type { LiteDocument } from "@mathjax/src/js/adaptors/lite/Document.js";
import {
  DIRECTION,
  type SvgCharData,
  SvgFontData,
} from "@mathjax/src/js/output/svg/FontData.js";
import { SvgMo } from "@mathjax/src/js/output/svg/Wrappers/mo.js";
import { SvgMfrac } from "@mathjax/src/js/output/svg/Wrappers/mfrac.js";
import { SvgMsqrt } from "@mathjax/src/js/output/svg/Wrappers/msqrt.js";
import { SvgMroot } from "@mathjax/src/js/output/svg/Wrappers/mroot.js";
import { CommonMrootMixin } from "@mathjax/src/js/output/common/Wrappers/mroot.js";
import { SvgWrapperFactory } from "@mathjax/src/js/output/svg/WrapperFactory.js";
import { BBox } from "@mathjax/src/js/util/BBox.js";
import metrics from "./fonts/shantell-sans-math-metrics.json" with {
  type: "json",
};
import paths from "./fonts/shantell-sans-math-paths.json" with { type: "json" };

import layoutGlyphs from "./fonts/shantell-sans-math-layout.json" with {
  type: "json",
};
const layoutVariants = layoutGlyphs as unknown as Record<string, SvgCharData>;

const outlines: Record<string, string> = paths;
const advances: Record<string, number> = metrics.advances;
const bounds: Record<string, number[] | null> = metrics.glyphBounds;

/** U+221A. Join/stem values are measured from this font's outline, not TeX. */
const SURD = 0x221a;
const surdInk = bounds[SURD]!;
const SURD_H = surdInk[3] / 1000;
const SURD_D = Math.max(0, -surdInk[1] / 1000);
const SURD_W = advances[SURD] / 1000;
/** Left edge of the overline, inside the top terminal. */
const SURD_JOIN_X = 0.56;
/** Clearance between radicand top and the underside of the overline. */
const SURD_GAP = 0.05;
/** Overline thickness at native √ size; matches the thinned stem, not the minus bbox. */
const SURD_STEM = 0.09;
/**
 * Index baseline as a fraction of the scaled √ height. MathJax/TeX uses 0.55,
 * which was tuned for Computer Modern's deep pocket. This glyph's notch is the
 * opening above the left hook (around 0.71 of the outline); 0.75 puts a
 * script-size digit in that corner without floating clear of the stroke.
 */
const SURD_INDEX_RAISE = 0.75;
const MINUS = 0x2212;
const minusInk = bounds[MINUS]!;
const MINUS_H = (minusInk[3] - minusInk[1]) / 1000;
const blackboard: Record<number, number> = {
  67: 0x2102,
  78: 0x2115,
  80: 0x2119,
  81: 0x211a,
  82: 0x211d,
  90: 0x2124,
};
/** MathJax math punctuation that shares an existing outline. */
const aliases: Record<number, number> = {
  0x302: 94,
  0x303: 126,
  0x304: 175,
  0x305: 175,
  0x20d7: 0x2192,
  0x22c5: 0x00b7,
  0x2016: 0x2225,
  0x2223: 0x7c,
  0x23d0: 0x7c,
  0x27c2: 0x22a5,
};
const EMPTY_GLYPH: SvgCharData = [0, 0, 0, { p: "" }];

/** MathJax does the layout; every visible glyph comes from our actual font. */
export class ShantellMathFont extends SvgFontData {
  static override VariantSmp = {};
  static override NAME = "Shantell Sans Math";
  static override defaultParams = {
    ...SvgFontData.defaultParams,
    x_height: 0.497,
    axis_height: 0.28,
    rule_thickness: 0.045,
    surd_height: 0.045,
  };
  protected static override defaultSizeVariants = ["normal"];
  protected static override defaultStretchVariants = ["normal"];

  constructor() {
    super();
    const delimiters: Record<
      number,
      { dir: string; sizes: number[]; stretch: number[]; HDW: number[] }
    > = {};
    for (
      const [chars, dir] of [
        ["()[]{}|∥⌈⌉⌊⌋↑↓", DIRECTION.Vertical],
        ["←→↔⇐⇒⇔↦‾¯^~", DIRECTION.Horizontal],
      ]
    ) {
      for (const char of chars) {
        const n = char.codePointAt(0)!;
        if (!Object.hasOwn(outlines, n)) continue;
        const [h, d, w] = this.getChar("normal", n);
        delimiters[n] = {
          dir,
          sizes: [dir === DIRECTION.Vertical ? h + d : w],
          stretch: [0, n, 0],
          HDW: [h, d, w],
        };
      }
    }
    this.defineDelimiters(delimiters);
  }

  override getChar(variant: string, n: number): SvgCharData {
    if (layoutVariants[`${variant}:${n}`]) {
      return layoutVariants[`${variant}:${n}`];
    }
    if (layoutVariants[n]) return layoutVariants[n];
    n = aliases[n] ?? n;
    if (variant === "double-struck" && n < 128) {
      if (!blackboard[n]) {
        throw new Error(
          `Shantell Sans Math has no double-struck glyph for '${
            String.fromCodePoint(n)
          }'.`,
        );
      }
      n = blackboard[n];
    }
    if (
      variant.includes("fraktur") || variant.includes("calligraphic") ||
      variant === "script" || variant === "bold-script"
    ) {
      throw new Error(
        "Shantell Sans Math does not include calligraphic or Fraktur alphabets.",
      );
    }
    const character = String.fromCodePoint(n);
    // Format/control codepoints (function application, invisible times, …)
    // are layout-only. MathJax's own font maps them to empty metrics.
    if (/\p{Cf}|\p{Cc}/u.test(character)) return EMPTY_GLYPH;
    if (!Object.hasOwn(outlines, n)) {
      throw new Error(
        `Shantell Sans Math has no glyph for '${character}' (U+${
          n.toString(16).toUpperCase()
        }).`,
      );
    }
    const b = bounds[n];
    return [b ? b[3] / 1000 : 0, b ? -b[1] / 1000 : 0, advances[n] / 1000, {
      p: outlines[n].slice(1, -1),
    }];
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
      if (parent) {
        this.adaptor.append(
          parent,
          this.svg("path", {
            d: data!.p ? `M${data!.p}Z` : "",
            transform: `translate(0 ${y * 1000}) scale(${sx} ${sy})`,
          }),
        );
      }
    }
  }
}

/** Capsule of even thickness; unlike a stretched minus, this holds up at any width. */
function stadiumPath(
  fixed: (n: number) => string,
  x0: number,
  y: number,
  x1: number,
  t: number,
): string {
  const r = t / 2;
  if (x1 - x0 < t) {
    const midX = (x0 + x1) / 2;
    x0 = midX - r;
    x1 = midX + r;
  }
  const k = 0.5522847498 * r;
  const top = y + t;
  const mid = y + r;
  const cx0 = x0 + r;
  const cx1 = x1 - r;
  const f = fixed;
  return `M${f(cx0)} ${f(top)}L${f(cx1)} ${f(top)}C${f(cx1 + k)} ${f(top)} ${
    f(x1)
  } ${f(mid + k)} ${f(x1)} ${f(mid)}C${f(x1)} ${f(mid - k)} ${f(cx1 + k)} ${
    f(y)
  } ${f(cx1)} ${f(y)}L${f(cx0)} ${f(y)}C${f(cx0 - k)} ${f(y)} ${f(x0)} ${
    f(mid - k)
  } ${f(x0)} ${f(mid)}C${f(x0)} ${f(mid + k)} ${f(cx0 - k)} ${f(top)} ${
    f(cx0)
  } ${f(top)}Z`;
}

/**
 * Replace only the TeX rule rectangle with a round-capped bar. Placement, atop
 * stacks, bevelled fractions, radicals, and rule_thickness stay on MathJax.
 * Thickness matches the minus glyph in display; tighter nested fractions scale
 * down just enough to stay inside the existing num/den clearance.
 */
// MathJax's mixin declaration exposes two equivalent constructor signatures.
// @ts-expect-error Same upstream generic mixin constructor mismatch as SvgMo itself.
class ShantellMfrac extends SvgMfrac {
  protected makeFraction(display: boolean, t: number) {
    const jax = this as any;
    const svg = jax.dom;
    const { numalign, denomalign } = jax.node.attributes.getList(
      "numalign",
      "denomalign",
    );
    const [num, den] = jax.childNodes;
    const nbox = num.getOuterBBox();
    const dbox = den.getOuterBBox();
    const tex = jax.font.params;
    const a = tex.axis_height;
    const d = 0.1;
    const pad = jax.node.getProperty("withDelims") ? 0 : tex.nulldelimiterspace;
    const W = Math.max(
      (nbox.L + nbox.w + nbox.R) * nbox.rscale,
      (dbox.L + dbox.w + dbox.R) * dbox.rscale,
    );
    const nx = jax.getAlignX(W, nbox, numalign) + d + pad;
    const dx = jax.getAlignX(W, dbox, denomalign) + d + pad;
    const { T, u, v } = jax.getTUV(display, t);
    num.toSVG(svg);
    num.place(nx, a + T + Math.max(nbox.d * nbox.rscale, u));
    den.toSVG(svg);
    den.place(dx, a - T - Math.max(dbox.h * dbox.rscale, v));
    const barT = Math.min(MINUS_H, 1.4 * T);
    jax.adaptor.append(
      svg[0],
      jax.svg("path", {
        d: stadiumPath(
          (n: number) => jax.fixed(n),
          pad,
          a - barT / 2,
          pad + W + 2 * d,
          barT,
        ),
      }),
    );
  }
}

type RadicalLayout = {
  scale: number;
  w: number;
  h: number;
  d: number;
  joinX: number;
};

function radicalLayout(baseH: number): RadicalLayout {
  // Keep the √ unstretched (no Y-only scale). Grow it uniformly so the
  // overline sits above the radicand. Bar thickness scales with the √ so a
  // short \sqrt{x} and a tall \sqrt{1-x^2} keep the same stroke.
  const scale = Math.max(1, (baseH + SURD_GAP) / (SURD_H - SURD_STEM));
  return {
    scale,
    w: SURD_W * scale,
    h: SURD_H * scale,
    d: SURD_D * scale,
    joinX: SURD_JOIN_X * scale,
  };
}

/** Draw √ as the font glyph plus a round-capped overline, not a TeX rule. */
// MathJax's mixin declaration exposes two equivalent constructor signatures.
// @ts-expect-error Same upstream generic mixin constructor mismatch as SvgMo itself.
class ShantellMsqrt extends SvgMsqrt {
  override getStretchedSurd() {}

  override computeBBox(bbox: BBox, recompute = false) {
    bbox.empty();
    const basebox = new BBox(this.childNodes[this.base].getOuterBBox());
    const layout = radicalLayout(basebox.h);
    const surdbox = new BBox({ h: layout.h, d: layout.d, w: layout.w });
    const [x] = this.getRootDimens(surdbox, layout.h);
    bbox.h = layout.h;
    this.combineRootBBox(bbox, surdbox, layout.h);
    bbox.combine(surdbox, x, 0);
    bbox.combine(basebox, x + layout.w, 0);
    bbox.clean();
    this.setChildPWidths(recompute);
  }

  override toSVG(parents: LiteElement[]) {
    const jax = this as any;
    const surd = jax.surd;
    const base = jax.childNodes[jax.base];
    const root = jax.root != null ? jax.childNodes[jax.root] : null;
    const basebox = base.getOuterBBox();
    const layout = radicalLayout(basebox.h);
    const sbox = new BBox({ h: layout.h, d: layout.d, w: layout.w });
    const SVG = jax.standardSvgNodes(parents);
    surd.toSVG(SVG);
    const dx = jax.addRoot(SVG, root, sbox, layout.h);
    const BASE = jax.adaptor.append(SVG[0], jax.svg("g"));
    base.toSVG([BASE]);
    jax.adaptor.setAttribute(
      surd.dom[0],
      "transform",
      `translate(${jax.fixed(dx)},0) scale(${
        jax.fixed(layout.scale / 1000, 3)
      })`,
    );
    base.place(dx + layout.w, 0);
    const barT = SURD_STEM * layout.scale;
    jax.adaptor.append(
      SVG[SVG.length - 1],
      jax.svg("path", {
        d: stadiumPath(
          (n: number) => jax.fixed(n),
          dx + layout.joinX,
          layout.h - barT,
          dx + layout.w + basebox.w,
          barT,
        ),
      }),
    );
  }
}

class ShantellMroot extends CommonMrootMixin(ShantellMsqrt) {
  static override kind = SvgMroot.kind;

  /** Ignore MathJax's 0.55/1.9 TeX table; this outline's pocket is higher. */
  rootHeight(rbox: BBox, sbox: BBox, _size: number, H: number) {
    const h = sbox.h + sbox.d;
    return SURD_INDEX_RAISE * h - (h - H) + Math.max(0, rbox.d * rbox.rscale);
  }

  addRoot(
    ROOT: LiteElement[],
    root: {
      toSVG: (nodes: LiteElement[]) => void;
      getOuterBBox: () => { rscale: number };
      place: (x: number, y: number) => void;
    },
    sbox: BBox,
    H: number,
  ) {
    root.toSVG(ROOT);
    const [x, h, dx] = (
      this as unknown as {
        getRootDimens: (sbox: BBox, H: number) => number[];
      }
    ).getRootDimens(sbox, H);
    const bbox = root.getOuterBBox();
    root.place(dx * bbox.rscale, h);
    return x;
  }
}

export class ShantellWrapperFactory
  extends SvgWrapperFactory<LiteElement, LiteText, LiteDocument> {
  static override defaultNodes = {
    ...SvgWrapperFactory.defaultNodes,
    mo: ShantellMo,
    [SvgMfrac.kind]: ShantellMfrac,
    [SvgMsqrt.kind]: ShantellMsqrt,
    [SvgMroot.kind]: ShantellMroot,
  };
}

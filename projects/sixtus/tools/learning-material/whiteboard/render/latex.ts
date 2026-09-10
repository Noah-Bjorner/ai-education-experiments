import { LiteElement } from "@mathjax/src/js/adaptors/lite/Element.js";
import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { SVG } from "@mathjax/src/js/output/svg.js";
import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/js/input/tex/textmacros/TextMacrosConfiguration.js";
import { ShantellMathFont, ShantellWrapperFactory } from "./math-font.ts";
import type { Drawing } from "./bounds.ts";
import { escapeXml } from "./svg.ts";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const output = new SVG({
  fontData: new ShantellMathFont(),
  wrapperFactory: new ShantellWrapperFactory(),
  fontCache: "none",
  blacker: 0,
  linebreaks: { inline: false },
});
const input = new TeX({
  packages: ["base", "ams", "textmacros"],
  maxBuffer: 4000,
  maxMacros: 1000,
  formatError: (_jax: unknown, error: Error) => {
    throw new Error(error.message);
  },
});
const document = mathjax.document("", { InputJax: input, OutputJax: output });

// LiteAdaptor serializes HTML, where '<' is allowed inside attributes. SVG
// exports are XML. Serialize the generated nodes with XML escaping, and leave
// source text/semantic IDs to the enclosing whiteboard row.
function svgMarkup(node: LiteElement): string {
  const kind = adaptor.kind(node);
  if (
    !["svg", "g", "path", "rect", "line", "polygon", "polyline"].includes(kind)
  ) {
    throw new Error(
      "The expression requires unsupported external content or font glyphs.",
    );
  }
  const attributes = adaptor.allAttributes(node).filter(({ name }) =>
    name !== "id" && !name.startsWith("data-latex")
  ).map(({ name, value }) => {
    if (/^(?:on|href|xlink:href)/i.test(name)) {
      throw new Error("External math content is unavailable.");
    }
    return ` ${name}="${escapeXml(String(value))}"`;
  }).join("");
  const children = adaptor.childNodes(node).map((child) => {
    if (child instanceof LiteElement) return svgMarkup(child);
    if (adaptor.value(child).trim()) {
      throw new Error("Math output must use the bundled font outlines.");
    }
    return "";
  }).join("");
  return `<${kind}${attributes}>${children}</${kind}>`;
}

/** Accept math-mode source or one conventional pair of paste delimiters. */
export function normalizeMathLatex(source: string): string {
  if (source.length > 2000) {
    throw new Error("Use at most 2000 characters per expression.");
  }
  let latex = source.trim();
  for (
    const [left, right] of [["$$", "$$"], ["\\[", "\\]"], ["\\(", "\\)"], [
      "$",
      "$",
    ]]
  ) {
    if (
      latex.startsWith(left) && latex.endsWith(right) &&
      latex.length >= left.length + right.length
    ) {
      latex = latex.slice(left.length, -right.length).trim();
      break;
    }
  }
  if (!latex) throw new Error("Enter a LaTeX math expression.");
  // Bound nesting independently of MathJax's macro-expansion limit.
  let depth = 0;
  for (let i = 0; i < latex.length; i++) {
    if (latex[i] === "\\") {
      i++;
      continue;
    }
    if (latex[i] === "{" && ++depth > 32) {
      throw new Error("Math expressions may nest at most 32 groups.");
    }
    if (latex[i] === "}") depth--;
  }
  return latex;
}

export type MathBox = Drawing & {
  width: number;
  ascent: number;
  descent: number;
};

/** Synchronous, deterministic SVG layout using only bundled Shantell outlines. */
export function renderMathLatex(source: string, size = 36): MathBox {
  const latex = normalizeMathLatex(source);
  input.reset(); // Equation labels and parser state must not leak between rows/requests.
  const container = document.convert(latex, {
    display: true,
    em: 1000,
    ex: 497,
    containerWidth: 100000,
  });
  const svg = adaptor.firstChild(container);
  if (!(svg instanceof LiteElement) || adaptor.kind(svg) !== "svg") {
    throw new Error("The expression did not produce math output.");
  }
  const viewBox = adaptor.getAttribute(svg, "viewBox")?.split(/\s+/).map(
    Number,
  );
  if (!viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite)) {
    throw new Error("Invalid math layout bounds.");
  }
  const [x, y, w, h] = viewBox;
  if (w <= 0 || h <= 0) {
    throw new Error("The expression has no visible content.");
  }
  const scale = size / 1000;
  const markup = adaptor.childNodes(svg).map((node) => {
    if (!(node instanceof LiteElement)) return "";
    return svgMarkup(node);
  }).join("");
  if (!/<path\b[^>]*\bd="[^"]+"|<rect\b/.test(markup)) {
    throw new Error("The expression has no visible content.");
  }
  return {
    markup: `<g transform="scale(${scale})">${markup}</g>`,
    width: w * scale,
    ascent: Math.max(0, -y * scale),
    descent: Math.max(0, (y + h) * scale),
    bounds: { x: x * scale, y: y * scale, width: w * scale, height: h * scale },
  };
}

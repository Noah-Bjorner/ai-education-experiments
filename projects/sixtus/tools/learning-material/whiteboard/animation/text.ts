import paths from "../render/fonts/shantell-sans-math-paths.json" with {
  type: "json",
};
import { measureGraphText, sanitizeGraphText } from "../render/font.ts";

const NS = "http://www.w3.org/2000/svg";
const outlines: Record<string, string> = paths;

/** Outline tagged figure and annotation writing; static SVGs retain their live text. */
export function prepareWriting(root: Element): () => void {
  const replacements: { original: Element; ink: Element }[] = [];
  for (
    const original of Array.from(
      root.querySelectorAll(
        '[data-annotation-part="text"] text, [data-figure-part="writing"] text',
      ),
    )
  ) {
    if (original.closest('[data-drawing="static"]')) continue;
    const size = Number(original.getAttribute("font-size"));
    const x = Number(original.getAttribute("x") ?? 0);
    const y = Number(original.getAttribute("y") ?? 0);
    if (
      !(size > 0) || ![size, x, y].every(Number.isFinite) ||
      original.children.length
    ) {
      throw new Error(
        "Handwriting requires plain text with numeric position and font size",
      );
    }
    const value = sanitizeGraphText(original.textContent ?? "");
    const width = measureGraphText(value, size);
    const anchor = original.getAttribute("text-anchor") ?? "start";
    let cursor = x -
      (anchor === "middle" ? width / 2 : anchor === "end" ? width : 0);
    const ink = original.ownerDocument!.createElementNS(NS, "g");
    // Retain the text's own fill, opacity, and transform; font-size/anchor are
    // handled in each glyph transform. IDs stay on the original text node.
    for (const attr of Array.from(original.attributes)) {
      if (!["id", "x", "y", "font-size", "text-anchor"].includes(attr.name)) {
        ink.setAttribute(attr.name, attr.value);
      }
    }
    ink.setAttribute("data-drawing-text", "");
    ink.setAttribute("aria-hidden", "true");
    for (const character of value) {
      const key = String(character.codePointAt(0));
      const d = outlines[key];
      if (d === undefined) {
        throw new Error(`Missing handwriting glyph outline: ${character}`);
      }
      if (d) {
        const path = original.ownerDocument!.createElementNS(NS, "path");
        path.setAttribute("d", d);
        path.setAttribute(
          "transform",
          `translate(${cursor} ${y}) scale(${size / 1000} ${-size / 1000})`,
        );
        ink.appendChild(path);
      }
      cursor += measureGraphText(character, size);
    }
    if (!ink.children.length) continue;
    original.parentNode!.insertBefore(ink, original);
    original.setAttribute("visibility", "hidden");
    replacements.push({ original, ink });
  }
  // At completion restore the exact live text, including browser font
  // rasterization. Explicit SMIL setters also restore partial ink on rewind.
  return () => {
    for (const { original, ink } of replacements) {
      const items = Array.from(ink.querySelectorAll("[data-drawing-index]"));
      if (!items.length) {
        throw new Error("Handwriting was not scheduled");
      }
      const end = Math.max(
        ...items.map((item) =>
          Number(item.getAttribute("data-drawing-start")) +
          Number(item.getAttribute("data-drawing-duration"))
        ),
      );
      for (
        const [host, visibility] of [[ink, "hidden"], [
          original,
          "visible",
        ]] as const
      ) {
        const setter = original.ownerDocument!.createElementNS(NS, "set");
        setter.setAttribute("attributeName", "visibility");
        setter.setAttribute("to", visibility);
        setter.setAttribute("begin", `${end}s`);
        setter.setAttribute("fill", "freeze");
        host.appendChild(setter);
      }
    }
  };
}

/** Outer spacing beyond chart chrome. Units are viewBox pixels. */
export type SvgPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type SvgPaddingInput =
  | number
  | Partial<SvgPadding>
  | { x?: number; y?: number };

export type SvgRenderOptions = {
  /** Optional canvas override. When omitted, renderers size from content. */
  width?: number;
  height?: number;
  /**
   * Extra space outside the chart chrome (title, axes, legend).
   * - `number` → all sides
   * - `{ x, y }` → horizontal / vertical
   * - `{ top, right, bottom, left }` → per edge
   *
   * Auto-sized canvases grow by this amount. Fixed width/height treat it as
   * an inset (plot area shrinks).
   */
  padding?: SvgPaddingInput;
};

/** Normalize padding shorthand into explicit top/right/bottom/left. */
export function resolveSvgPadding(input: SvgPaddingInput = 0): SvgPadding {
  if (typeof input === "number") {
    const value = Math.max(0, input);
    return { top: value, right: value, bottom: value, left: value };
  }

  const record = input as Record<string, number | undefined>;
  if ("x" in record || "y" in record) {
    const x = Math.max(0, record.x ?? 0);
    const y = Math.max(0, record.y ?? 0);
    return { top: y, right: x, bottom: y, left: x };
  }

  return {
    top: Math.max(0, record.top ?? 0),
    right: Math.max(0, record.right ?? 0),
    bottom: Math.max(0, record.bottom ?? 0),
    left: Math.max(0, record.left ?? 0),
  };
}

export const DEFAULT_SVG_WIDTH = 1200;
export const DEFAULT_SVG_HEIGHT = 800;

/** Reads pixel size from a root SVG `viewBox="0 0 W H"`. */
export function readSvgViewBoxSize(svg: string): { width: number; height: number } {
  const match = svg.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);
  if (!match) {
    throw new Error("SVG is missing a viewBox of the form \"0 0 width height\".");
  }
  return {
    width: Math.round(Number(match[1])),
    height: Math.round(Number(match[2])),
  };
}

export function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function cleanFloat(value: number): number {
  return Number.parseFloat(value.toPrecision(12));
}

export function formatSvgNumber(value: number): string {
  return cleanFloat(value).toString();
}

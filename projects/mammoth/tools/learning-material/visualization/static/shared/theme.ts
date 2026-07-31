export const SVG_FONT =
  "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/**
 * Semantic chrome colors used by all static SVG renderers.
 * Roles are fixed; do not invent ad-hoc hex in renderers.
 */
export const SVG_COLORS = {
  background: "#ffffff", // BackgroundPrimary
  text: "#181818", // TextPrimary
  textMuted: "#8c8c8c", // TextSecondary
  axis: "#181818", // TextPrimary
  tick: "#8c8c8c", // TextSecondary
  divider: "#dadada", // BackgroundTertiary
  border: "#bebebe", // TextTertiary
  seriesStroke: "#ffffff", // BackgroundPrimary
} as const;

/**
 * Ordered accent palette for data series (legend, bars, lines, points).
 * Index 0 is primary; cycle with `SERIES_COLORS[i % SERIES_COLORS.length]`.
 */
export const SERIES_COLORS = [
  "#3da5d9", // primary
  "#fec601", // secondary
  "#73bfb8", // tertiary
  "#2364aa", // quaternary
  "#ea7317", // quinary
  "#16a085", // senary
  "#c0392b", // septenary
  "#8e44ad", // octonary
] as const;

/**
 * Reference viewBox width that the ratios below are authored against.
 * At width=1200, titleFont resolves to 32, tickFont to 14, etc.
 */
export const SVG_DESIGN_WIDTH = 1200;

/**
 * Chrome sizes as fractions of the SVG viewBox width.
 * Vertical spacing uses the same width basis so proportions stay stable
 * when the SVG is scaled by CSS width.
 */
export const SVG_SIZE_RATIOS = {
  titleFont: 32 / SVG_DESIGN_WIDTH,
  axisLabelFont: 18 / SVG_DESIGN_WIDTH,
  tickFont: 14 / SVG_DESIGN_WIDTH,
  legendFont: 15 / SVG_DESIGN_WIDTH,
  /** Short callouts on individual data points. */
  pointLabelFont: 14 / SVG_DESIGN_WIDTH,
  pointLabelOffset: 14 / SVG_DESIGN_WIDTH,

  titleY: 52 / SVG_DESIGN_WIDTH,
  plotTop: 100 / SVG_DESIGN_WIDTH,
  rightPad: 40 / SVG_DESIGN_WIDTH,
  yLabelGutter: 34 / SVG_DESIGN_WIDTH,
  tickEndPad: 12 / SVG_DESIGN_WIDTH,
  tickMark: 6 / SVG_DESIGN_WIDTH,
  xTickArea: 30 / SVG_DESIGN_WIDTH,
  xLabelArea: 34 / SVG_DESIGN_WIDTH,
  xLabelOffset: 58 / SVG_DESIGN_WIDTH,
  legendRowHeight: 36 / SVG_DESIGN_WIDTH,
  legendSwatch: 12 / SVG_DESIGN_WIDTH,
  legendItemGap: 36 / SVG_DESIGN_WIDTH,
  legendLabelGap: 8 / SVG_DESIGN_WIDTH,
  bottomPad: 22 / SVG_DESIGN_WIDTH,

  gridStroke: 1 / SVG_DESIGN_WIDTH,
  axisStroke: 2 / SVG_DESIGN_WIDTH,
  tickStroke: 1.5 / SVG_DESIGN_WIDTH,
  zeroStroke: 1.5 / SVG_DESIGN_WIDTH,
  lineStroke: 4 / SVG_DESIGN_WIDTH,
  pointStroke: 2 / SVG_DESIGN_WIDTH,
  pointRadius: 5 / SVG_DESIGN_WIDTH,
  scatterRadius: 7 / SVG_DESIGN_WIDTH,
  barGap: 4 / SVG_DESIGN_WIDTH,
  /** Corner radius on the free end of bars (away from the zero/baseline). Tweak freely. */
  barRadius: 18 / SVG_DESIGN_WIDTH,
  minBarWidth: 6 / SVG_DESIGN_WIDTH,
} as const;

export type SvgSizeRatioKey = keyof typeof SVG_SIZE_RATIOS;

/** Resolved pixel sizes for a concrete viewBox width. */
export type SvgDesignScale = {
  width: number;
  /** Scale a design-width fraction (or raw ratio) to pixels. */
  u: (ratio: number) => number;
} & { [K in SvgSizeRatioKey]: number };

/** Build reusable chrome sizes from the parent viewBox width. */
export function createSvgDesignScale(viewBoxWidth: number): SvgDesignScale {
  const width = Math.max(1, viewBoxWidth);
  const u = (ratio: number) => Math.round(ratio * width * 100) / 100;
  const scale = { width, u } as SvgDesignScale;
  for (const [key, ratio] of Object.entries(SVG_SIZE_RATIOS)) {
    scale[key as SvgSizeRatioKey] = u(ratio);
  }
  return scale;
}

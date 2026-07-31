import type { Diagram } from "../schema.ts";
import {
  cleanFloat,
  escapeXml,
  formatSvgNumber as fmt,
  resolveSvgPadding,
  type SvgPadding,
  type SvgRenderOptions,
} from "../shared/svg.ts";
import {
  createSvgDesignScale,
  SERIES_COLORS,
  SVG_COLORS,
  type SvgDesignScale,
  SVG_DESIGN_WIDTH,
  SVG_FONT,
} from "../shared/theme.ts";

export type XyChart = Extract<Diagram, { type: "xy_chart" }>;
export type RenderXyChartOptions = SvgRenderOptions;

type Point = { x: number | string; y: number; label?: string };
type Series = { name: string; points: Point[] };

type PlotRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

type ContinuousScale = {
  kind: "continuous";
  domain: [number, number];
  ticks: number[];
  toPx: (value: number) => number;
};

type CategoryScale = {
  kind: "category";
  categories: string[];
  toPx: (index: number) => number;
  bandWidth: number;
};

type Scale = ContinuousScale | CategoryScale;

type NiceDomain = { min: number; max: number; ticks: number[] };

type XScalePrep =
  | { kind: "category"; categories: string[] }
  | { kind: "continuous"; min: number; max: number; ticks: number[] };

type ChartLayout = {
  width: number;
  height: number;
  plot: PlotRect;
  legendRows: number;
  scale: SvgDesignScale;
  padding: SvgPadding;
};

/** Content-density targets in design pixels (independent of chrome scale). */
const MIN_PLOT_WIDTH = 640;
const MAX_PLOT_WIDTH = 1100;
const MIN_PLOT_HEIGHT = 400;
const MAX_PLOT_HEIGHT = 640;
const CATEGORY_SLOT = 78;
const CONTINUOUS_TICK_SLOT = 72;
const SERIES_BAR_BONUS = 18;

/**
 * Deterministically renders an XY chart as a standalone SVG fragment.
 *
 * Canvas size is derived from content unless overridden. Label/spacing chrome
 * is resolved from `createSvgDesignScale(viewBoxWidth)` so it stays proportional
 * to the parent viewBox.
 */
export function renderXyChartSvg(
  chart: XyChart,
  options: RenderXyChartOptions = {},
): string {
  const yDomain = computeYDomain(chart);
  const xPrep = prepareXScale(chart);
  const layout = computeLayout(chart, yDomain, xPrep, options);
  const { width, height, plot, scale, padding } = layout;
  const xScale = finalizeXScale(xPrep, plot);
  const yScale = finalizeYScale(yDomain, plot);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${
    escapeXml(chart.title)
  }" style="font-family:${SVG_FONT}">
  <title>${escapeXml(chart.title)}</title>
  <rect width="${width}" height="${height}" fill="${SVG_COLORS.background}"/>
  <text x="${width / 2}" y="${fmt(padding.top + scale.titleY)}" text-anchor="middle" font-size="${
    fmt(scale.titleFont)
  }" font-weight="600" fill="${SVG_COLORS.text}">${escapeXml(chart.title)}</text>
  ${
    renderLegend(
      chart.series,
      height,
      plot.left,
      plot.width,
      layout.legendRows,
      scale,
      padding,
    )
  }
  ${renderGrid(plot, xScale, yScale, scale)}
  ${renderAxes(chart, plot, xScale, yScale, scale, padding)}
  ${renderPlotBody(chart, plot, xScale, yScale, scale)}
</svg>`;
}

function computeLayout(
  chart: XyChart,
  yDomain: NiceDomain,
  xPrep: XScalePrep,
  options: RenderXyChartOptions,
): ChartLayout {
  const padding = resolveSvgPadding(options.padding);
  const contentPlotWidth = contentDrivenPlotWidth(chart, xPrep);
  const contentPlotHeight = contentDrivenPlotHeight(yDomain.ticks.length);
  const hasLegend = chart.series.length > 1;

  // Seed width from content; refine once so chrome (fonts/margins) match viewBox.
  // Fixed canvases treat padding as inset; auto-sized canvases grow around chrome.
  const fixedInnerWidth = options.width === undefined
    ? undefined
    : Math.max(1, options.width - padding.left - padding.right);
  const fixedInnerHeight = options.height === undefined
    ? undefined
    : Math.max(1, options.height - padding.top - padding.bottom);

  let width = fixedInnerWidth ?? Math.round(contentPlotWidth / 0.78);
  let height = fixedInnerHeight ?? Math.round(contentPlotHeight / 0.62);
  let scale = createSvgDesignScale(width);
  let plotWidth = contentPlotWidth;
  let plotHeight = contentPlotHeight;
  let legendRows = 0;
  let left = 0;
  let top = 0;

  for (let pass = 0; pass < 2; pass++) {
    scale = createSvgDesignScale(width);
    const widestYTick = Math.max(
      ...yDomain.ticks.map((tick) =>
        estimateLabelWidth(formatTick(tick), scale.tickFont)
      ),
      estimateLabelWidth("0", scale.tickFont),
    );
    left = scale.yLabelGutter + widestYTick + scale.tickEndPad +
      scale.u(8 / SVG_DESIGN_WIDTH);
    top = scale.plotTop;
    plotWidth = contentPlotWidth;
    plotHeight = contentPlotHeight;
    legendRows = 0;

    if (hasLegend) {
      const legend = measureLegend(chart.series, scale);
      if (legend.totalWidth > plotWidth) {
        const grown = Math.min(MAX_PLOT_WIDTH, legend.totalWidth);
        if (grown <= plotWidth * 1.35) {
          plotWidth = grown;
          legendRows = 1;
        } else {
          legendRows = wrapLegendRows(chart.series, plotWidth, scale).rows;
        }
      } else {
        legendRows = 1;
      }
    }

    if (fixedInnerWidth !== undefined) {
      plotWidth = Math.max(
        scale.u(120 / SVG_DESIGN_WIDTH),
        fixedInnerWidth - left - scale.rightPad,
      );
      legendRows = hasLegend
        ? wrapLegendRows(chart.series, plotWidth, scale).rows
        : 0;
    }

    const bottomChrome = scale.xTickArea + scale.xLabelArea +
      legendRows * scale.legendRowHeight + scale.bottomPad;

    if (fixedInnerHeight !== undefined) {
      plotHeight = Math.max(
        scale.u(120 / SVG_DESIGN_WIDTH),
        fixedInnerHeight - top - bottomChrome,
      );
    }

    width = fixedInnerWidth ?? Math.round(left + plotWidth + scale.rightPad);
    const titlePad = scale.u(64 / SVG_DESIGN_WIDTH);
    const titleWidth = estimateLabelWidth(chart.title, scale.titleFont) +
      titlePad;
    if (fixedInnerWidth === undefined && titleWidth > width) {
      plotWidth += titleWidth - width;
      width = titleWidth;
      if (hasLegend) {
        legendRows = wrapLegendRows(chart.series, plotWidth, scale).rows;
      }
    }

    const finalBottomChrome = scale.xTickArea + scale.xLabelArea +
      legendRows * scale.legendRowHeight + scale.bottomPad;
    height = fixedInnerHeight ?? Math.round(top + plotHeight + finalBottomChrome);
  }

  // Resolve chrome against the settled viewBox width, then lock left margin.
  scale = createSvgDesignScale(width);
  const widestYTick = Math.max(
    ...yDomain.ticks.map((tick) =>
      estimateLabelWidth(formatTick(tick), scale.tickFont)
    ),
    estimateLabelWidth("0", scale.tickFont),
  );
  left = scale.yLabelGutter + widestYTick + scale.tickEndPad + scale.u(8 / SVG_DESIGN_WIDTH);
  top = scale.plotTop;
  if (fixedInnerWidth === undefined) {
    width = Math.round(left + plotWidth + scale.rightPad);
    scale = createSvgDesignScale(width);
  } else {
    plotWidth = Math.max(scale.u(120 / SVG_DESIGN_WIDTH), width - left - scale.rightPad);
  }
  const bottomChrome = scale.xTickArea + scale.xLabelArea +
    legendRows * scale.legendRowHeight + scale.bottomPad;
  if (fixedInnerHeight === undefined) {
    height = Math.round(top + plotHeight + bottomChrome);
  } else {
    plotHeight = Math.max(scale.u(120 / SVG_DESIGN_WIDTH), height - top - bottomChrome);
  }

  // Outer padding: shift chrome into the canvas, then expand (or keep fixed) size.
  left += padding.left;
  top += padding.top;
  const bottom = top + plotHeight;
  width = options.width ?? Math.round(width + padding.left + padding.right);
  height = options.height ?? Math.round(height + padding.top + padding.bottom);

  return {
    width,
    height,
    plot: {
      left,
      right: left + plotWidth,
      top,
      bottom,
      width: plotWidth,
      height: plotHeight,
    },
    legendRows,
    scale,
    padding,
  };
}

function contentDrivenPlotWidth(chart: XyChart, xPrep: XScalePrep): number {
  if (xPrep.kind === "category") {
    const seriesBonus = chart.chartStyle === "bar"
      ? Math.max(0, chart.series.length - 1) * SERIES_BAR_BONUS
      : 0;
    const slot = CATEGORY_SLOT + seriesBonus;
    return clamp(
      xPrep.categories.length * slot,
      MIN_PLOT_WIDTH,
      MAX_PLOT_WIDTH,
    );
  }

  const pointCount = Math.max(
    ...chart.series.map((series) => series.points.length),
    xPrep.ticks.length,
    2,
  );
  return clamp(
    Math.max(xPrep.ticks.length * CONTINUOUS_TICK_SLOT, pointCount * 40),
    MIN_PLOT_WIDTH,
    MAX_PLOT_WIDTH,
  );
}

function contentDrivenPlotHeight(tickCount: number): number {
  return clamp(tickCount * 52, MIN_PLOT_HEIGHT, MAX_PLOT_HEIGHT);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function measureLegend(
  series: Series[],
  scale: SvgDesignScale,
): { totalWidth: number } {
  if (series.length <= 1) return { totalWidth: 0 };
  let totalWidth = 0;
  for (const [index, item] of series.entries()) {
    const label = truncateLabel(item.name, 16);
    totalWidth += scale.legendSwatch + scale.legendLabelGap +
      estimateLabelWidth(label, scale.legendFont);
    if (index < series.length - 1) totalWidth += scale.legendItemGap;
  }
  return { totalWidth };
}

function wrapLegendRows(
  series: Series[],
  maxWidth: number,
  scale: SvgDesignScale,
): { rows: number } {
  if (series.length <= 1) return { rows: 0 };
  let x = 0;
  let rows = 1;
  for (const [index, item] of series.entries()) {
    const label = truncateLabel(item.name, 16);
    const itemWidth = scale.legendSwatch + scale.legendLabelGap +
      estimateLabelWidth(label, scale.legendFont);
    if (x > 0 && x + itemWidth > maxWidth) {
      rows += 1;
      x = 0;
    }
    x += itemWidth + (index < series.length - 1 ? scale.legendItemGap : 0);
  }
  return { rows };
}

function usesCategoryX(chart: XyChart): boolean {
  return chart.chartStyle === "bar" ||
    chart.series.some((series) =>
      series.points.some((point) => typeof point.x === "string")
    );
}

function prepareXScale(chart: XyChart): XScalePrep {
  if (usesCategoryX(chart)) {
    return { kind: "category", categories: collectCategories(chart.series) };
  }
  const { min, max, ticks } = niceDomain(minMax(allNumericX(chart.series)), {
    includeZero: false,
    maxTicks: 7,
    padRatio: 0.02,
  });
  return { kind: "continuous", min, max, ticks };
}

function finalizeXScale(prep: XScalePrep, plot: PlotRect): Scale {
  if (prep.kind === "category") {
    const count = Math.max(prep.categories.length, 1);
    const padding = 0.12;
    const step = plot.width * (1 - 2 * padding) / count;
    const start = plot.left + plot.width * padding + step / 2;
    return {
      kind: "category",
      categories: prep.categories,
      bandWidth: step * 0.72,
      toPx: (index) => start + index * step,
    };
  }
  return {
    kind: "continuous",
    domain: [prep.min, prep.max],
    ticks: prep.ticks,
    toPx: linearScale([prep.min, prep.max], [plot.left, plot.right]),
  };
}

function computeYDomain(chart: XyChart): NiceDomain {
  const values = chart.series.flatMap((series) =>
    series.points.map((point) => point.y)
  );
  return niceDomain(minMax(values), {
    includeZero: chart.chartStyle === "bar",
    maxTicks: 7,
    padRatio: chart.chartStyle === "bar" ? 0 : 0.05,
  });
}

function finalizeYScale(domain: NiceDomain, plot: PlotRect): ContinuousScale {
  return {
    kind: "continuous",
    domain: [domain.min, domain.max],
    ticks: domain.ticks,
    toPx: linearScale([domain.min, domain.max], [plot.bottom, plot.top]),
  };
}

function collectCategories(series: Series[]): string[] {
  const seen = new Set<string>();
  const categories: string[] = [];
  for (const item of series) {
    for (const point of item.points) {
      const category = String(point.x);
      if (!seen.has(category)) {
        seen.add(category);
        categories.push(category);
      }
    }
  }
  return categories;
}

function allNumericX(series: Series[]): number[] {
  const values: number[] = [];
  for (const item of series) {
    for (const point of item.points) {
      if (typeof point.x !== "number" || !Number.isFinite(point.x)) {
        throw new Error(
          `xy_chart continuous X requires numeric x values; got ${
            JSON.stringify(point.x)
          }`,
        );
      }
      values.push(point.x);
    }
  }
  return values;
}

function minMax(values: number[]): { min: number; max: number } {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return { min: 0, max: 1 };
  return { min: Math.min(...finite), max: Math.max(...finite) };
}

function niceDomain(
  data: { min: number; max: number },
  options: { includeZero: boolean; maxTicks: number; padRatio: number },
): { min: number; max: number; ticks: number[] } {
  let low = data.min;
  let high = data.max;

  if (low === high) {
    const delta = low === 0 ? 1 : Math.abs(low) * 0.5;
    low -= delta;
    high += delta;
  }

  if (options.padRatio > 0) {
    const padding = (high - low) * options.padRatio;
    low -= padding;
    high += padding;
  }

  if (options.includeZero) {
    if (low > 0) low = 0;
    if (high < 0) high = 0;
  }

  const range = niceNumber(high - low, false);
  const step = niceNumber(range / (Math.max(2, options.maxTicks) - 1), true);
  const niceMin = Math.floor(low / step) * step;
  const niceMax = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  const start = Math.round(niceMin / step);
  const end = Math.round(niceMax / step);

  for (let index = start; index <= end; index++) {
    ticks.push(cleanFloat(index * step));
  }

  return {
    min: cleanFloat(niceMin),
    max: cleanFloat(niceMax),
    ticks: ticks.length >= 2 ? ticks : [niceMin, niceMax],
  };
}

function niceNumber(range: number, round: boolean): number {
  const absolute = Math.abs(range);
  if (!Number.isFinite(absolute) || absolute === 0) return 1;
  const exponent = Math.floor(Math.log10(absolute));
  const magnitude = 10 ** exponent;
  const fraction = absolute / magnitude;
  let niceFraction: number;

  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * magnitude;
}

function linearScale(
  domain: [number, number],
  range: [number, number],
): (value: number) => number {
  const [domainStart, domainEnd] = domain;
  const [rangeStart, rangeEnd] = range;
  const domainSpan = domainEnd - domainStart;
  if (domainSpan === 0) return () => (rangeStart + rangeEnd) / 2;
  return (value) =>
    rangeStart +
    ((value - domainStart) / domainSpan) * (rangeEnd - rangeStart);
}

function renderGrid(
  plot: PlotRect,
  xScale: Scale,
  yScale: ContinuousScale,
  scale: SvgDesignScale,
): string {
  const stroke = fmt(scale.gridStroke);
  // Skip left/bottom edges — those are the axis-colored X/Y dividers.
  const lines = yScale.ticks.flatMap((tick) => {
    const y = yScale.toPx(tick);
    if (near(y, plot.bottom)) return [];
    return [
      `<line x1="${plot.left}" y1="${y}" x2="${plot.right}" y2="${y}" stroke="${SVG_COLORS.divider}" stroke-width="${stroke}"/>`,
    ];
  });
  if (xScale.kind === "continuous") {
    lines.push(...xScale.ticks.flatMap((tick) => {
      const x = xScale.toPx(tick);
      if (near(x, plot.left)) return [];
      return [
        `<line x1="${x}" y1="${plot.top}" x2="${x}" y2="${plot.bottom}" stroke="${SVG_COLORS.divider}" stroke-width="${stroke}"/>`,
      ];
    }));
  }
  return `<g class="grid">${lines.join("")}</g>`;
}

function renderAxes(
  chart: XyChart,
  plot: PlotRect,
  xScale: Scale,
  yScale: ContinuousScale,
  scale: SvgDesignScale,
  padding: SvgPadding,
): string {
  const axisStroke = fmt(scale.axisStroke);
  const tickFont = fmt(scale.tickFont);
  const axisLabelFont = fmt(scale.axisLabelFont);
  const tickLabelGap = scale.tickEndPad;
  const xTickLabelY = plot.bottom + scale.xTickArea * 0.87;
  const parts = [
    `<line x1="${plot.left}" y1="${plot.bottom}" x2="${plot.right}" y2="${plot.bottom}" stroke="${SVG_COLORS.axis}" stroke-width="${axisStroke}"/>`,
    `<line x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${plot.bottom}" stroke="${SVG_COLORS.axis}" stroke-width="${axisStroke}"/>`,
  ];

  for (const tick of yScale.ticks) {
    const y = yScale.toPx(tick);
    parts.push(
      `<text x="${fmt(plot.left - tickLabelGap)}" y="${
        fmt(y + scale.tickFont * 0.35)
      }" text-anchor="end" font-size="${tickFont}" fill="${SVG_COLORS.textMuted}">${
        escapeXml(formatTick(tick))
      }</text>`,
    );
  }

  if (xScale.kind === "continuous") {
    for (const tick of xScale.ticks) {
      const x = xScale.toPx(tick);
      parts.push(
        `<text x="${x}" y="${fmt(xTickLabelY)}" text-anchor="middle" font-size="${tickFont}" fill="${SVG_COLORS.textMuted}">${
          escapeXml(formatTick(tick))
        }</text>`,
      );
    }
  } else {
    for (let index = 0; index < xScale.categories.length; index++) {
      const x = xScale.toPx(index);
      const label = truncateLabel(xScale.categories[index]!, 18);
      parts.push(
        `<text x="${x}" y="${fmt(xTickLabelY)}" text-anchor="middle" font-size="${tickFont}" fill="${SVG_COLORS.textMuted}">${
          escapeXml(label)
        }</text>`,
      );
    }
  }

  const xLabelX = plot.left + plot.width / 2;
  const yLabelY = plot.top + plot.height / 2;
  const yLabelX = padding.left + scale.yLabelGutter * 0.82;
  parts.push(
    `<text x="${xLabelX}" y="${
      fmt(plot.bottom + scale.xLabelOffset)
    }" text-anchor="middle" font-size="${axisLabelFont}" font-weight="600" fill="${SVG_COLORS.axis}">${
      escapeXml(chart.xLabel)
    }</text>`,
    `<text x="${fmt(yLabelX)}" y="${yLabelY}" text-anchor="middle" font-size="${axisLabelFont}" font-weight="600" fill="${SVG_COLORS.axis}" transform="rotate(-90 ${
      fmt(yLabelX)
    } ${yLabelY})">${escapeXml(chart.yLabel)}</text>`,
  );
  return `<g class="axes">${parts.join("")}</g>`;
}

function renderPlotBody(
  chart: XyChart,
  plot: PlotRect,
  xScale: Scale,
  yScale: ContinuousScale,
  scale: SvgDesignScale,
): string {
  switch (chart.chartStyle) {
    case "line":
      return renderLineSeries(chart.series, xScale, yScale, scale);
    case "scatter":
      return renderScatterSeries(chart.series, xScale, yScale, scale);
    case "bar":
      return renderBarSeries(
        chart.series,
        plot,
        xScale as CategoryScale,
        yScale,
        scale,
      );
  }
}

function pointXPx(point: Point, xScale: Scale): number {
  if (xScale.kind === "continuous") {
    if (typeof point.x !== "number") {
      throw new Error("continuous scale requires numeric x");
    }
    return xScale.toPx(point.x);
  }
  const index = xScale.categories.indexOf(String(point.x));
  if (index < 0) throw new Error(`unknown category x: ${String(point.x)}`);
  return xScale.toPx(index);
}

function renderLineSeries(
  series: Series[],
  xScale: Scale,
  yScale: ContinuousScale,
  scale: SvgDesignScale,
): string {
  return series.map((item, seriesIndex) => {
    const color = SERIES_COLORS[seriesIndex % SERIES_COLORS.length]!;
    const coordinates = item.points.map((point) => ({
      x: pointXPx(point, xScale),
      y: yScale.toPx(point.y),
      label: point.label,
    }));
    if (coordinates.length === 0) return "";
    const path = coordinates.map((point, index) =>
      `${index === 0 ? "M" : "L"} ${fmt(point.x)} ${fmt(point.y)}`
    ).join(" ");
    const dots = coordinates.map((point) =>
      `<circle cx="${fmt(point.x)}" cy="${fmt(point.y)}" r="${
        fmt(scale.pointRadius)
      }" fill="${color}" stroke="${SVG_COLORS.seriesStroke}" stroke-width="${
        fmt(scale.pointStroke)
      }"/>`
    ).join("");
    const labels = coordinates.map((point) =>
      renderPointLabel(point.x, point.y, point.label, scale, "above")
    ).join("");
    return `<g class="series" data-name="${
      escapeXml(item.name)
    }"><path d="${path}" fill="none" stroke="${color}" stroke-width="${
      fmt(scale.lineStroke)
    }" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}</g>`;
  }).join("");
}

function renderScatterSeries(
  series: Series[],
  xScale: Scale,
  yScale: ContinuousScale,
  scale: SvgDesignScale,
): string {
  return series.map((item, seriesIndex) => {
    const color = SERIES_COLORS[seriesIndex % SERIES_COLORS.length]!;
    const marks = item.points.map((point) => {
      const x = pointXPx(point, xScale);
      const y = yScale.toPx(point.y);
      return `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${
        fmt(scale.scatterRadius)
      }" fill="${color}" fill-opacity="0.9" stroke="${SVG_COLORS.seriesStroke}" stroke-width="${
        fmt(scale.pointStroke)
      }"/>${renderPointLabel(x, y, point.label, scale, "above")}`;
    }).join("");
    return `<g class="series" data-name="${escapeXml(item.name)}">${marks}</g>`;
  }).join("");
}

function renderBarSeries(
  series: Series[],
  plot: PlotRect,
  xScale: CategoryScale,
  yScale: ContinuousScale,
  scale: SvgDesignScale,
): string {
  const seriesCount = Math.max(series.length, 1);
  const gap = scale.barGap;
  const barWidth = Math.max(
    scale.minBarWidth,
    (xScale.bandWidth - gap * (seriesCount - 1)) / seriesCount,
  );
  const zeroY = yScale.toPx(0);
  const indexed = series.map((item) =>
    new Map(item.points.map((point) => [String(point.x), point]))
  );
  const parts: string[] = [];

  for (
    let categoryIndex = 0;
    categoryIndex < xScale.categories.length;
    categoryIndex++
  ) {
    const category = xScale.categories[categoryIndex]!;
    const groupLeft = xScale.toPx(categoryIndex) - xScale.bandWidth / 2;
    for (let seriesIndex = 0; seriesIndex < series.length; seriesIndex++) {
      const point = indexed[seriesIndex]!.get(category);
      if (point === undefined) continue;
      const value = point.y;
      const valueY = yScale.toPx(value);
      const x = groupLeft + seriesIndex * (barWidth + gap);
      const color = SERIES_COLORS[seriesIndex % SERIES_COLORS.length]!;
      const height = Math.max(Math.abs(valueY - zeroY), 1);
      const y = Math.min(valueY, zeroY);
      parts.push(renderBarPath(x, y, barWidth, height, scale.barRadius, value >= 0, color));
      const labelX = x + barWidth / 2;
      const placement = value >= 0 ? "above" : "below";
      parts.push(renderPointLabel(labelX, valueY, point.label, scale, placement));
    }
  }

  const [minimum, maximum] = yScale.domain;
  // Only draw an interior zero line; edge zeros are the axis frame.
  if (
    minimum <= 0 && maximum >= 0 &&
    !near(zeroY, plot.top) && !near(zeroY, plot.bottom)
  ) {
    parts.unshift(
      `<line x1="${plot.left}" y1="${fmt(zeroY)}" x2="${plot.right}" y2="${
        fmt(zeroY)
      }" stroke="${SVG_COLORS.border}" stroke-width="${fmt(scale.zeroStroke)}"/>`,
    );
  }
  return `<g class="bars">${parts.join("")}</g>`;
}

/** Short callout above/below a plotted point or bar tip. */
function renderPointLabel(
  x: number,
  y: number,
  label: string | undefined,
  scale: SvgDesignScale,
  placement: "above" | "below",
): string {
  if (!label) return "";
  const text = truncateLabel(label, 18);
  const offset = scale.pointLabelOffset;
  const textY = placement === "above" ? y - offset : y + offset + scale.pointLabelFont * 0.75;
  return `<text x="${fmt(x)}" y="${fmt(textY)}" text-anchor="middle" font-size="${
    fmt(scale.pointLabelFont)
  }" font-weight="600" fill="${SVG_COLORS.text}">${escapeXml(text)}</text>`;
}

/**
 * Bar with rounded corners only on the free end (away from zero).
 * Positive bars round the top; negative bars round the bottom.
 * The baseline end stays square.
 */
function renderBarPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  positive: boolean,
  color: string,
): string {
  const r = Math.min(radius, width / 2, height);
  if (r <= 0) {
    return `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(width)}" height="${
      fmt(height)
    }" fill="${color}"/>`;
  }

  const x2 = x + width;
  const y2 = y + height;
  // Clockwise path: square at the baseline end, quarter-circles at the value end.
  const d = positive
    ? [
      `M${fmt(x)} ${fmt(y2)}`,
      `L${fmt(x)} ${fmt(y + r)}`,
      `Q${fmt(x)} ${fmt(y)} ${fmt(x + r)} ${fmt(y)}`,
      `L${fmt(x2 - r)} ${fmt(y)}`,
      `Q${fmt(x2)} ${fmt(y)} ${fmt(x2)} ${fmt(y + r)}`,
      `L${fmt(x2)} ${fmt(y2)}`,
      "Z",
    ].join(" ")
    : [
      `M${fmt(x)} ${fmt(y)}`,
      `L${fmt(x2)} ${fmt(y)}`,
      `L${fmt(x2)} ${fmt(y2 - r)}`,
      `Q${fmt(x2)} ${fmt(y2)} ${fmt(x2 - r)} ${fmt(y2)}`,
      `L${fmt(x + r)} ${fmt(y2)}`,
      `Q${fmt(x)} ${fmt(y2)} ${fmt(x)} ${fmt(y2 - r)}`,
      `L${fmt(x)} ${fmt(y)}`,
      "Z",
    ].join(" ");

  return `<path d="${d}" fill="${color}"/>`;
}

function renderLegend(
  series: Series[],
  height: number,
  plotLeft: number,
  plotWidth: number,
  legendRows: number,
  scale: SvgDesignScale,
  padding: SvgPadding,
): string {
  if (series.length <= 1 || legendRows <= 0) return "";
  const swatchSize = scale.legendSwatch;
  const itemGap = scale.legendItemGap;
  const labelGap = scale.legendLabelGap;
  // Bottom-left stack: last row sits above outer bottom padding.
  const baseY = height - padding.bottom - scale.bottomPad +
    scale.u(6 / SVG_DESIGN_WIDTH);
  let x = plotLeft;
  let row = 0;
  const items: string[] = [];

  for (const [index, item] of series.entries()) {
    const color = SERIES_COLORS[index % SERIES_COLORS.length]!;
    const label = truncateLabel(item.name, 16);
    const itemWidth = swatchSize + labelGap +
      estimateLabelWidth(label, scale.legendFont);
    if (x > plotLeft && x - plotLeft + itemWidth > plotWidth) {
      row += 1;
      x = plotLeft;
    }
    const y = baseY - (legendRows - 1 - row) * scale.legendRowHeight;
    const textX = x + swatchSize + labelGap;
    items.push(
      `<rect x="${fmt(x)}" y="${fmt(y - swatchSize / 2)}" width="${
        fmt(swatchSize)
      }" height="${fmt(swatchSize)}" rx="${
        fmt(scale.u(2 / SVG_DESIGN_WIDTH))
      }" fill="${color}"/><text x="${fmt(textX)}" y="${
        fmt(y + scale.legendFont * 0.35)
      }" font-size="${fmt(scale.legendFont)}" font-weight="500" fill="${SVG_COLORS.axis}">${
        escapeXml(label)
      }</text>`,
    );
    x = textX + estimateLabelWidth(label, scale.legendFont) + itemGap;
  }
  return `<g class="legend">${items.join("")}</g>`;
}

function estimateLabelWidth(label: string, fontSize: number): number {
  return Math.ceil(label.length * fontSize * 0.55);
}

function near(a: number, b: number, epsilon = 0.5): boolean {
  return Math.abs(a - b) <= epsilon;
}

function formatTick(number: number): string {
  let value = cleanFloat(number);
  if (Object.is(value, -0)) value = 0;
  const absolute = Math.abs(value);
  if (absolute !== 0 && (absolute < 1e-3 || absolute >= 1e6)) {
    return value.toExponential(1).replace(/\.0e/, "e");
  }
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(6).replace(/\.?0+$/, "");
}

function truncateLabel(label: string, maximum: number): string {
  if (label.length <= maximum) return label;
  return `${label.slice(0, Math.max(1, maximum - 1))}…`;
}

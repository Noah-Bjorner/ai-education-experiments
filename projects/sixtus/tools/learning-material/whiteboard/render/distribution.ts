import { drawingBuilder } from "./drawing.ts";
import { textLabel } from "./label.ts";
import { renderError } from "./issues.ts";
import { resolveFigureOptions } from "./options.ts";
import { escapeXml } from "./svg.ts";
import { handwritten, renderHandwritten, renderHandwrittenDot } from "./handwritten.ts";
import { GRAPH_FONT_STYLE, measureGraphText } from "./font.ts";
import { type Bounds, type Point, rotateLabel, unionBounds } from "./bounds.ts";
import {
  COLORS,
  LINE_HEIGHT,
  SERIES_COLORS,
  SPACING,
  TYPE_SCALE,
} from "./theme.ts";
import {
  type RenderTarget,
  type ScenePart,
  type TargetedDrawing,
} from "./targets.ts";
import { withFigureTitle } from "./titles.ts";
import type { Distribution } from "../figures/distribution.ts";
import type { FigureRenderOptions } from "./options.ts";

const INK = COLORS.ink;
const MUTED = COLORS.textMuted;
const SQRT_2PI = Math.sqrt(2 * Math.PI);
const DENSITY_WINDOW_SIGMAS = 3.6;
const DENSITY_SAMPLES = 240;
const DOT_RADIUS = 5.5;
const DOT_GAP = 1.5;

function settings(options: FigureRenderOptions) {
  const result = resolveFigureOptions(options);
  if (result.width < 600 || result.height < 400) {
    throw renderError(
      "INVALID_OPTIONS",
      "Distribution figures need width >= 600 and height >= 400.",
    );
  }
  return result;
}

function axis(values: number[], includeZero = false) {
  let min = values.reduce((a, b) => Math.min(a, b));
  let max = values.reduce((a, b) => Math.max(a, b));
  if (includeZero) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.05, 1);
    min -= padding;
    max += padding;
  }
  const rawStep = (max - min) / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = ([1, 2, 5, 10].find((n) => n * magnitude >= rawStep) ?? 10) *
    magnitude;
  const low = Math.floor(min / step) * step;
  const high = Math.ceil(max / step) * step;
  if (!Number.isFinite(high - low) || high <= low || step <= 0) {
    throw renderError(
      "INVALID_GEOMETRY",
      "Axis values exceed the supported numeric range.",
    );
  }
  const ticks = Array.from(
    { length: Math.round((high - low) / step) + 1 },
    (_, i) => Number((low + i * step).toPrecision(12)),
  );
  return {
    low,
    high,
    ticks,
    scale: (value: number) => (value - low) / (high - low),
  };
}

function numberLabel(value: number, compact = false): string {
  const absolute = Math.abs(value);
  if (compact && absolute >= 1e9) {
    return `${Number((value / 1e9).toPrecision(4))}B`;
  }
  if (compact && absolute >= 1e6) {
    return `${Number((value / 1e6).toPrecision(4))}M`;
  }
  if (compact && absolute >= 1e3) {
    return `${Number((value / 1e3).toPrecision(4))}k`;
  }
  return Number(value.toPrecision(6)).toString();
}

function fmt(value: number): string {
  return Number(value.toPrecision(12)).toString();
}

function packLegend(names: string[], width: number) {
  const legendGap = SPACING.legendItemGap;
  const legendLabelOffset = 23 + SPACING.labelGap;
  let legendX = 0;
  let legendRow = 0;
  const entries = names.map((name) => {
    const entryWidth = legendLabelOffset +
      measureGraphText(name, TYPE_SCALE.label);
    if (legendX > 0 && legendX + entryWidth > width - 134) {
      legendX = 0;
      legendRow++;
    }
    const entry = { x: legendX, row: legendRow };
    legendX += entryWidth + legendGap;
    return entry;
  });
  return { entries, rows: names.length ? legendRow + 1 : 0, legendLabelOffset };
}

function normalPdf(mean: number, sd: number, x: number): number {
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z) / (sd * SQRT_2PI);
}

function sampleNormal(
  mean: number,
  sd: number,
  from: number,
  to: number,
  count = DENSITY_SAMPLES,
): Point[] {
  if (!(from < to) || count < 2) {
    throw renderError(
      "INVALID_GEOMETRY",
      "A density curve needs a finite window to sample.",
    );
  }
  const points: Point[] = [];
  for (let i = 0; i < count; i++) {
    const x = from + (to - from) * i / (count - 1);
    const y = normalPdf(mean, sd, x);
    if (!Number.isFinite(y)) {
      throw renderError(
        "INVALID_GEOMETRY",
        "A density curve produced a nonfinite value.",
      );
    }
    points.push({ x, y });
  }
  return points;
}

function finish(
  title: string | null,
  parts: ScenePart[],
  width: number,
  namespace: string,
  targets: Map<string, RenderTarget>,
  focusBounds: Bounds,
  pen: { id: string; seed: number; roughness: number },
): TargetedDrawing {
  const bodyBounds = unionBounds(parts.map((p) => p.bounds));
  if (!bodyBounds) {
    throw renderError(
      "INVALID_GEOMETRY",
      "A distribution needs visible content.",
    );
  }
  const label = title ?? namespace;
  return withFigureTitle(
    {
      markup: `<g style="${GRAPH_FONT_STYLE}" role="img" aria-label="${
        escapeXml(label)
      }"><title>${escapeXml(label)}</title>${
        parts.map((p) => p.markup).join("\n")
      }</g>`,
      bounds: bodyBounds,
      targets,
      focusBounds,
      obstacles: parts.flatMap((p) =>
        p.obstacles ??
          (p.bounds ? [{ bounds: p.bounds, kind: "shape" as const }] : [])
      ),
    },
    title,
    namespace,
    { ...pen, width },
  );
}

type PlotContext = {
  c: ReturnType<typeof settings>;
  namespace: string;
  scene: ReturnType<typeof drawingBuilder>;
  parts: ScenePart[];
  sequence: number;
  plot: { left: number; right: number; top: number; bottom: number };
};

function createContext(
  figure: Distribution,
  options: FigureRenderOptions,
  legendRows = 0,
): PlotContext {
  const c = settings(options);
  const legendHeight = legendRows * (LINE_HEIGHT.label + SPACING.legendRowGap);
  const plot = {
    left: figure.yLabel ? 92 : 48,
    right: c.width - 42,
    top: 48,
    bottom: c.height - 88 - legendHeight,
  };
  if (plot.bottom - plot.top < 150) {
    throw renderError(
      "CONTENT_DOES_NOT_FIT",
      "The plot is too short; use a taller figure or a shorter legend.",
      { required: { height: c.height + 150 - (plot.bottom - plot.top) } },
    );
  }
  return {
    c,
    namespace: figure.id ?? c.id,
    scene: drawingBuilder(),
    parts: [],
    sequence: 0,
    plot,
  };
}

function line(
  ctx: PlotContext,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string = INK,
  strokeWidth = 1.6,
): ScenePart {
  const drawing = renderHandwritten({ type: "line", x1, y1, x2, y2 }, {
    id: `${ctx.c.id}-line-${ctx.sequence}`,
    seed: ctx.c.seed + ctx.sequence++,
    roughness: ctx.c.roughness,
    stroke,
    strokeWidth,
  });
  return {
    ...drawing,
    obstacles: drawing.bounds
      ? [{
        bounds: drawing.bounds,
        kind: "stroke",
        segment: { a: { x: x1, y: y1 }, b: { x: x2, y: y2 } },
      }]
      : [],
  };
}

function exactLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  strokeWidth: number,
): ScenePart {
  const bounds = {
    x: Math.min(x1, x2) - strokeWidth,
    y: Math.min(y1, y2) - strokeWidth,
    width: Math.abs(x2 - x1) + 2 * strokeWidth,
    height: Math.abs(y2 - y1) + 2 * strokeWidth,
  };
  return {
    markup: `<path d="M ${fmt(x1)} ${fmt(y1)} L ${fmt(x2)} ${
      fmt(y2)
    }" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`,
    bounds,
    obstacles: [{
      bounds,
      kind: "stroke",
      segment: { a: { x: x1, y: y1 }, b: { x: x2, y: y2 } },
    }],
  };
}

function addYAxis(
  ctx: PlotContext,
  yAxis: ReturnType<typeof axis>,
  y: (value: number) => number,
  yLabel: string,
) {
  const { plot, namespace, scene, parts } = ctx;
  for (const tick of yAxis.ticks) {
    parts.push({
      markup: `<path d="M ${plot.left} ${
        y(tick)
      } H ${plot.right}" fill="none" stroke="${COLORS.grid}" stroke-width="1" stroke-dasharray="4 6"/>`,
      bounds: {
        x: plot.left,
        y: y(tick) - 0.5,
        width: plot.right - plot.left,
        height: 1,
      },
      obstacles: [],
    });
    parts.push(
      textLabel(
        numberLabel(tick, true),
        plot.left - 14,
        y(tick) + 5,
        TYPE_SCALE.supporting,
        "end",
        MUTED,
      ),
    );
  }
  parts.push(line(ctx, plot.left, plot.top, plot.left, plot.bottom));
  parts.push(
    scene.add({
      id: `${namespace}.y-label`,
      drawing: rotateLabel(
        textLabel(
          yLabel,
          0,
          0,
          TYPE_SCALE.label,
          "middle",
          INK,
          plot.bottom - plot.top,
        ),
        25,
        (plot.top + plot.bottom) / 2,
      ),
      kind: "text",
      textRotation: -90,
    }),
  );
}

function addXAxis(
  ctx: PlotContext,
  ticks: { value: number | string; x: number; width?: number }[],
  xLabel: string,
) {
  const { plot, namespace, scene, parts, c } = ctx;
  parts.push(line(ctx, plot.left, plot.bottom, plot.right, plot.bottom));
  for (const tick of ticks) {
    parts.push(line(ctx, tick.x, plot.bottom, tick.x, plot.bottom + 5));
    parts.push(
      textLabel(
        String(tick.value),
        tick.x,
        plot.bottom + 25,
        TYPE_SCALE.supporting,
        "middle",
        MUTED,
        tick.width ?? Infinity,
      ),
    );
  }
  parts.push(
    scene.add({
      id: `${namespace}.x-label`,
      drawing: textLabel(
        xLabel,
        (plot.left + plot.right) / 2,
        plot.bottom + 58,
        TYPE_SCALE.label,
        "middle",
        INK,
        c.width - 150,
      ),
      kind: "text",
    }),
  );
}

function hatchClip(
  ctx: PlotContext,
  path: string,
  bounds: Bounds,
  color: string,
  id: string,
  hatchGap = ctx.c.hatchGap,
): ScenePart {
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw renderError(
      "INVALID_GEOMETRY",
      "A filled distribution region needs positive area.",
    );
  }
  return {
    markup:
      `<defs><clipPath id="${id}"><path d="${path}"/></clipPath></defs><g clip-path="url(#${id})">${
        handwritten({ type: "rectangle", ...bounds }, {
          id: `${id}-fill`,
          seed: ctx.c.seed + ctx.sequence++,
          roughness: ctx.c.roughness,
          hatchGap,
          fill: color,
          stroke: "none",
        })
      }</g>`,
    bounds,
    obstacles: [],
  };
}

function pathFrom(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${fmt(p.x)} ${fmt(p.y)}`)
    .join(" ");
}

function areaPath(points: Point[], baselineY: number): string {
  if (points.length < 2) {
    throw renderError(
      "INVALID_GEOMETRY",
      "A density fill needs at least two samples.",
    );
  }
  return `${pathFrom(points)} L ${fmt(points.at(-1)!.x)} ${fmt(baselineY)} L ${
    fmt(points[0].x)
  } ${fmt(baselineY)} Z`;
}

function renderHistogram(figure: Distribution, ctx: PlotContext) {
  const bins = [...(figure.bins ?? [])].sort((a, b) => a.start - b.start);
  const xAxis = axis([bins[0].start, bins.at(-1)!.end]);
  const yAxis = axis(bins.map((bin) => bin.count), true);
  const x = (value: number) =>
    ctx.plot.left + xAxis.scale(value) * (ctx.plot.right - ctx.plot.left);
  const y = (value: number) =>
    ctx.plot.bottom - yAxis.scale(value) * (ctx.plot.bottom - ctx.plot.top);
  const minBarWidth = 3;
  for (const bin of bins) {
    if (x(bin.end) - x(bin.start) < minBarWidth) {
      throw renderError(
        "CONTENT_DOES_NOT_FIT",
        "Histogram bars are too narrow to read; use fewer or wider bins.",
        {
          path: ["bins"],
          required: {
            width: ctx.c.width - (ctx.plot.right - ctx.plot.left) +
              minBarWidth * (xAxis.high - xAxis.low) /
                Math.min(...bins.map((b) => b.end - b.start)),
          },
        },
      );
    }
  }
  addYAxis(ctx, yAxis, y, figure.yLabel!);
  addXAxis(
    ctx,
    xAxis.ticks.map((tick) => ({ value: numberLabel(tick), x: x(tick) })),
    figure.xLabel,
  );
  const color = SERIES_COLORS[0];
  for (const [i, bin] of bins.entries()) {
    const left = x(bin.start);
    const width = x(bin.end) - left;
    const top = Math.min(y(0), y(bin.count));
    const bar = bin.count === 0
      ? line(ctx, left, y(0), left + width, y(0), color, 2)
      : renderHandwritten({
        type: "rectangle",
        x: left,
        y: top,
        width,
        height: Math.abs(y(bin.count) - y(0)),
      }, {
        id: `${ctx.c.id}-bin-${i}`,
        seed: ctx.c.seed + i,
        roughness: ctx.c.roughness,
        hatchGap: ctx.c.hatchGap,
        fill: color,
        stroke: color,
      });
    ctx.parts.push(
      ctx.scene.add({
        id: `${ctx.namespace}.${bin.id}.mark`,
        drawing: {
          ...bar,
          markup: `<g><title>${
            escapeXml(`${bin.start}–${bin.end}: ${bin.count}`)
          }</title>${bar.markup}</g>`,
        },
        kind: "mark",
      }),
    );
  }
}

function renderDotPlot(figure: Distribution, ctx: PlotContext) {
  const stacks = [...(figure.stacks ?? [])].sort((a, b) => a.x - b.x);
  const xAxis = axis(stacks.map((stack) => stack.x));
  const x = (value: number) =>
    ctx.plot.left + xAxis.scale(value) * (ctx.plot.right - ctx.plot.left);
  const pitch = DOT_RADIUS * 2 + DOT_GAP;
  const maxCount = Math.max(...stacks.map((stack) => stack.count));
  const needed = maxCount * pitch + 8;
  if (ctx.plot.bottom - ctx.plot.top < needed) {
    throw renderError(
      "CONTENT_DOES_NOT_FIT",
      "The tallest stack does not fit; use fewer dots per value or a taller figure.",
      {
        path: ["stacks"],
        required: {
          height: ctx.c.height - (ctx.plot.bottom - ctx.plot.top) + needed,
        },
      },
    );
  }
  addXAxis(
    ctx,
    xAxis.ticks.map((tick) => ({ value: numberLabel(tick), x: x(tick) })),
    figure.xLabel,
  );
  const color = SERIES_COLORS[0];
  for (const stack of stacks) {
    const cx = x(stack.x);
    const dots: ScenePart[] = [];
    for (let i = 0; i < stack.count; i++) {
      const cy = ctx.plot.bottom - DOT_RADIUS - 2 - i * pitch;
      dots.push(
        renderHandwrittenDot(cx, cy, DOT_RADIUS, {
          id: `${ctx.c.id}-dot-${stack.id}-${i}`,
          seed: ctx.c.seed + ctx.sequence++,
          roughness: ctx.c.roughness,
          fill: color,
        }),
      );
    }
    const bounds = unionBounds(dots.map((dot) => dot.bounds))!;
    ctx.parts.push(
      ctx.scene.add({
        id: `${ctx.namespace}.${stack.id}.mark`,
        drawing: {
          markup: `<g><title>${
            escapeXml(`${stack.x}: ${stack.count}`)
          }</title>${dots.map((dot) => dot.markup).join("")}</g>`,
          bounds,
        },
        kind: "mark",
      }),
    );
  }
}

function renderBox(figure: Distribution, ctx: PlotContext) {
  const groups = figure.groups ?? [];
  const values = groups.flatMap((group) => [
    group.min,
    group.max,
    ...(group.outliers ?? []).map((outlier) => outlier.value),
  ]);
  const yAxis = axis(values, true);
  const band = (ctx.plot.right - ctx.plot.left) / groups.length;
  const boxWidth = band * 0.42;
  const y = (value: number) =>
    ctx.plot.bottom - yAxis.scale(value) * (ctx.plot.bottom - ctx.plot.top);
  const x = (index: number) => ctx.plot.left + (index + 0.5) * band;
  addYAxis(ctx, yAxis, y, figure.yLabel!);
  ctx.parts.push(
    line(ctx, ctx.plot.left, ctx.plot.bottom, ctx.plot.right, ctx.plot.bottom),
  );
  ctx.parts.push(
    ctx.scene.add({
      id: `${ctx.namespace}.x-label`,
      drawing: textLabel(
        figure.xLabel,
        (ctx.plot.left + ctx.plot.right) / 2,
        ctx.plot.bottom + 58,
        TYPE_SCALE.label,
        "middle",
        INK,
        ctx.c.width - 150,
      ),
      kind: "text",
    }),
  );
  const color = SERIES_COLORS[0];
  for (const [i, group] of groups.entries()) {
    const cx = x(i);
    const left = cx - boxWidth / 2;
    const top = Math.min(y(group.q1), y(group.q3));
    const height = Math.abs(y(group.q3) - y(group.q1)) || 2;
    const box = renderHandwritten({
      type: "rectangle",
      x: left,
      y: top,
      width: boxWidth,
      height,
    }, {
      id: `${ctx.c.id}-box-${i}`,
      seed: ctx.c.seed + i,
      roughness: ctx.c.roughness,
      hatchGap: ctx.c.hatchGap,
      fill: color,
      stroke: color,
    });
    const whiskers = [
      group.max !== group.q3 &&
      exactLine(cx, y(group.max), cx, y(group.q3), color, 2),
      group.min !== group.q1 &&
      exactLine(cx, y(group.q1), cx, y(group.min), color, 2),
      exactLine(
        cx - boxWidth * 0.28,
        y(group.max),
        cx + boxWidth * 0.28,
        y(group.max),
        color,
        2,
      ),
      exactLine(
        cx - boxWidth * 0.28,
        y(group.min),
        cx + boxWidth * 0.28,
        y(group.min),
        color,
        2,
      ),
      exactLine(
        left,
        y(group.median),
        left + boxWidth,
        y(group.median),
        INK,
        2.4,
      ),
    ].filter((part): part is ScenePart => part !== false);
    const mark = {
      markup: `<g><title>${escapeXml(group.name)}</title>${box.markup}${
        whiskers.map((part) => part.markup).join("")
      }</g>`,
      bounds: unionBounds([box.bounds, ...whiskers.map((part) => part.bounds)]),
    };
    ctx.parts.push(
      ctx.scene.add({
        id: `${ctx.namespace}.${group.id}.mark`,
        drawing: mark,
        kind: "mark",
      }),
    );
    ctx.parts.push(
      ctx.scene.add({
        id: `${ctx.namespace}.${group.id}.label`,
        drawing: textLabel(
          group.name,
          cx,
          ctx.plot.bottom + 25,
          TYPE_SCALE.supporting,
          "middle",
          MUTED,
          band - 8,
        ),
        kind: "text",
      }),
    );
    for (const outlier of group.outliers ?? []) {
      const cy = y(outlier.value);
      const dot = renderHandwrittenDot(cx, cy, 4.5, {
        id: `${ctx.c.id}-outlier-${outlier.id}`,
        seed: ctx.c.seed + ctx.sequence++,
        roughness: ctx.c.roughness,
        fill: color,
      });
      ctx.parts.push(
        ctx.scene.add({
          id: `${ctx.namespace}.${outlier.id}.mark`,
          drawing: {
            ...dot,
            markup: `<g><title>${
              escapeXml(`${group.name}: ${outlier.value}`)
            }</title>${dot.markup}</g>`,
          },
          kind: "mark",
        }),
      );
    }
  }
}

function densityWindow(figure: Distribution): { min: number; max: number } {
  const curves = figure.curves ?? [];
  let min = Math.min(
    ...curves.map((curve) => curve.mean - DENSITY_WINDOW_SIGMAS * curve.sd),
  );
  let max = Math.max(
    ...curves.map((curve) => curve.mean + DENSITY_WINDOW_SIGMAS * curve.sd),
  );
  for (const guide of figure.guides ?? []) {
    min = Math.min(min, guide.at);
    max = Math.max(max, guide.at);
  }
  for (const region of figure.regions ?? []) {
    if (region.from !== null) min = Math.min(min, region.from);
    if (region.to !== null) max = Math.max(max, region.to);
  }
  if (!(min < max) || !Number.isFinite(max - min)) {
    throw renderError(
      "INVALID_GEOMETRY",
      "A density figure needs a finite positive x window.",
    );
  }
  return { min, max };
}

function renderDensity(figure: Distribution, ctx: PlotContext) {
  const curves = figure.curves ?? [];
  const window = densityWindow(figure);
  const yMax = Math.max(
    ...curves.flatMap((curve) =>
      sampleNormal(curve.mean, curve.sd, window.min, window.max).map((p) => p.y)
    ),
  ) * 1.12;
  const x = (value: number) =>
    ctx.plot.left +
    (value - window.min) / (window.max - window.min) *
      (ctx.plot.right - ctx.plot.left);
  const y = (value: number) =>
    ctx.plot.bottom - (value / yMax) * (ctx.plot.bottom - ctx.plot.top);
  const legend = curves.length > 1;
  if (legend) {
    const packed = packLegend(curves.map((curve) => curve.name), ctx.c.width);
    const legendRowHeight = LINE_HEIGHT.label + SPACING.legendRowGap;
    const colorFor = (i: number) => SERIES_COLORS[i % SERIES_COLORS.length];
    for (const [i, curve] of curves.entries()) {
      const lx = 92 + packed.entries[i].x;
      const ly = ctx.c.height - 24 -
        (packed.rows - 1 - packed.entries[i].row) * legendRowHeight;
      ctx.parts.push(
        exactLine(lx, ly - 5, lx + 23, ly - 5, colorFor(i), 2.7),
      );
      ctx.parts.push(
        ctx.scene.add({
          id: `${ctx.namespace}.${curve.id}.legend-label`,
          drawing: textLabel(
            curve.name,
            lx + packed.legendLabelOffset,
            ly,
            TYPE_SCALE.label,
            "start",
            INK,
            155,
          ),
          kind: "text",
        }),
      );
    }
  }

  ctx.parts.push(
    line(ctx, ctx.plot.left, ctx.plot.bottom, ctx.plot.right, ctx.plot.bottom),
  );

  const curveStrokes: ScenePart[] = [];
  for (const [i, curve] of curves.entries()) {
    const color = SERIES_COLORS[i % SERIES_COLORS.length];
    const samples = sampleNormal(curve.mean, curve.sd, window.min, window.max)
      .map((p) => ({ x: x(p.x), y: y(p.y) }));
    const bounds = unionBounds(samples.map((p) => ({
      x: p.x,
      y: p.y,
      width: 0,
      height: 0,
    })))!;
    const fillBounds = {
      x: samples[0].x,
      y: Math.min(ctx.plot.bottom, ...samples.map((p) => p.y)),
      width: samples.at(-1)!.x - samples[0].x,
      height: Math.abs(
        ctx.plot.bottom - Math.min(...samples.map((p) => p.y)),
      ),
    };
    ctx.parts.push(
      hatchClip(
        ctx,
        areaPath(samples, ctx.plot.bottom),
        fillBounds,
        color,
        `${ctx.c.id}-curve-${i}`,
      ),
    );
    const curveStroke: ScenePart = {
      markup: `<path d="${
        pathFrom(samples)
      }" fill="none" stroke="${color}" stroke-width="2.7"><title>${
        escapeXml(curve.name)
      }</title></path>`,
      bounds: {
        x: bounds.x,
        y: bounds.y,
        width: Math.max(bounds.width, 1),
        height: Math.max(bounds.height, 1),
      },
      obstacles: samples.slice(1).map((p, j) => ({
        bounds: {
          x: Math.min(samples[j].x, p.x) - 1.5,
          y: Math.min(samples[j].y, p.y) - 1.5,
          width: Math.abs(p.x - samples[j].x) + 3,
          height: Math.abs(p.y - samples[j].y) + 3,
        },
        kind: "stroke" as const,
        segment: { a: samples[j], b: p },
      })),
    };
    curveStrokes.push(
      ctx.scene.add({
        id: `${ctx.namespace}.${curve.id}.mark`,
        drawing: curveStroke,
        kind: "mark",
      }),
    );
  }

  for (const [r, region] of (figure.regions ?? []).entries()) {
    const curve = curves.find((item) => item.id === region.curveId)!;
    const from = Math.max(window.min, region.from ?? window.min);
    const to = Math.min(window.max, region.to ?? window.max);
    if (!(from < to)) {
      throw renderError(
        "INVALID_GEOMETRY",
        "A shaded region must overlap the visible density window.",
        { path: ["regions", r] },
      );
    }
    const color = SERIES_COLORS[curves.indexOf(curve) % SERIES_COLORS.length];
    const samples = sampleNormal(curve.mean, curve.sd, from, to).map((p) => ({
      x: x(p.x),
      y: y(p.y),
    }));
    const fillBounds = {
      x: samples[0].x,
      y: Math.min(ctx.plot.bottom, ...samples.map((p) => p.y)),
      width: samples.at(-1)!.x - samples[0].x,
      height: Math.abs(
        ctx.plot.bottom - Math.min(...samples.map((p) => p.y)),
      ),
    };
    const polygon = [
      { x: samples[0].x, y: ctx.plot.bottom },
      ...samples,
      { x: samples.at(-1)!.x, y: ctx.plot.bottom },
    ];
    ctx.parts.push(
      ctx.scene.add({
        id: `${ctx.namespace}.${region.id}.mark`,
        drawing: {
          ...hatchClip(
            ctx,
            areaPath(samples, ctx.plot.bottom),
            fillBounds,
            color,
            `${ctx.c.id}-region-${r}`,
            Math.max(2, ctx.c.hatchGap * 0.55),
          ),
          container: { type: "polygon", points: polygon },
        },
        kind: "mark",
      }),
    );
  }
  ctx.parts.push(...curveStrokes);

  const guides = figure.guides ?? [];
  if (guides.length) {
    for (const guide of guides) {
      if (guide.at < window.min || guide.at > window.max) {
        throw renderError(
          "INVALID_GEOMETRY",
          "Guides must sit inside the visible density window.",
        );
      }
      const gx = x(guide.at);
      const curveYs = curves.map((curve) =>
        y(normalPdf(curve.mean, curve.sd, guide.at))
      );
      const top = Math.min(ctx.plot.bottom - 4, ...curveYs);
      ctx.parts.push(
        ctx.scene.add({
          id: `${ctx.namespace}.${guide.id}.mark`,
          drawing: exactLine(
            gx,
            ctx.plot.bottom,
            gx,
            top,
            COLORS.ink,
            1.4,
          ),
          kind: "mark",
        }),
      );
      ctx.parts.push(
        ctx.scene.add({
          id: `${ctx.namespace}.${guide.id}.label`,
          drawing: textLabel(
            guide.label,
            gx,
            ctx.plot.bottom + 25,
            TYPE_SCALE.supporting,
            "middle",
            MUTED,
            (ctx.plot.right - ctx.plot.left) / Math.max(guides.length, 1),
          ),
          kind: "text",
        }),
      );
    }
  } else {
    const xAxis = axis([window.min, window.max]);
    for (const tick of xAxis.ticks) {
      if (tick < window.min || tick > window.max) continue;
      const tx = x(tick);
      ctx.parts.push(line(ctx, tx, ctx.plot.bottom, tx, ctx.plot.bottom + 5));
      ctx.parts.push(
        textLabel(
          numberLabel(tick),
          tx,
          ctx.plot.bottom + 25,
          TYPE_SCALE.supporting,
          "middle",
          MUTED,
        ),
      );
    }
  }

  ctx.parts.push(
    ctx.scene.add({
      id: `${ctx.namespace}.x-label`,
      drawing: textLabel(
        figure.xLabel,
        (ctx.plot.left + ctx.plot.right) / 2,
        ctx.plot.bottom + 58,
        TYPE_SCALE.label,
        "middle",
        INK,
        ctx.c.width - 150,
      ),
      kind: "text",
    }),
  );
  if (figure.yLabel) {
    ctx.parts.push(
      ctx.scene.add({
        id: `${ctx.namespace}.y-label`,
        drawing: rotateLabel(
          textLabel(
            figure.yLabel,
            0,
            0,
            TYPE_SCALE.label,
            "middle",
            INK,
            ctx.plot.bottom - ctx.plot.top,
          ),
          25,
          (ctx.plot.top + ctx.plot.bottom) / 2,
        ),
        kind: "text",
        textRotation: -90,
      }),
    );
  }
}

export function renderDistributionDrawing(
  figure: Distribution,
  options: FigureRenderOptions,
): TargetedDrawing {
  const legendRows = figure.chartStyle === "density" &&
      (figure.curves?.length ?? 0) > 1
    ? packLegend(
      figure.curves!.map((curve) => curve.name),
      resolveFigureOptions(options).width,
    ).rows
    : 0;
  const ctx = createContext(figure, options, legendRows);
  if (figure.chartStyle === "histogram") renderHistogram(figure, ctx);
  else if (figure.chartStyle === "dot_plot") renderDotPlot(figure, ctx);
  else if (figure.chartStyle === "box") renderBox(figure, ctx);
  else renderDensity(figure, ctx);
  return finish(
    figure.title,
    ctx.parts,
    ctx.c.width,
    ctx.namespace,
    ctx.scene.targets,
    {
      x: ctx.plot.left,
      y: ctx.plot.top,
      width: ctx.plot.right - ctx.plot.left,
      height: ctx.plot.bottom - ctx.plot.top,
    },
    { id: ctx.c.id, seed: ctx.c.seed, roughness: ctx.c.roughness },
  );
}

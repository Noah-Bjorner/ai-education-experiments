import type { WhiteboardSpec } from "../schema.ts";
import { escapeXml } from "../../static/shared/svg.ts";
import { handwritten, renderHandwritten } from "./handwritten.ts";
import {
  fitGraphText,
  GRAPH_FONT_DEFS,
  GRAPH_FONT_STYLE,
  graphTextBounds,
  measureGraphText,
} from "./font.ts";
import {
  type Bounds,
  type Drawing,
  exportBounds,
  rotateLabel,
  unionBounds,
} from "./bounds.ts";
import { COLORS, SERIES_COLORS as GRAPH_COLORS } from "./theme.ts";
import {
  registerTarget,
  type RenderTarget,
  type ScenePart,
  type TargetedDrawing,
} from "./targets.ts";

export type XyChart = Extract<
  WhiteboardSpec["children"][number],
  { type: "xy_chart" }
>;
export type CircularChart = Extract<
  WhiteboardSpec["children"][number],
  { type: "pie_chart" }
>;
export type Graph = XyChart | CircularChart;

/** Keep the existing public name; the palette is maintained in theme.ts. */
export { GRAPH_COLORS };
const INK = COLORS.ink;
const MUTED = COLORS.textMuted;

/** Circular geometry tuning; fractions of the chart's outer radius. */
export const CIRCULAR_STYLE = {
  donutHole: 0.52,
} as const;

export type GraphOptions = {
  /** Must be unique when several graph groups share one SVG. */
  id: string;
  /** Internal layout allocation. Final exports shrink to painted content. */
  width?: number;
  height?: number;
  roughness?: number;
  hatchGap?: number;
  seed?: number;
};

function settings(options: GraphOptions) {
  const result = {
    width: 800,
    height: 520,
    roughness: 1.5,
    hatchGap: 9,
    seed: 10,
    ...options,
  };
  if (!/^[a-zA-Z][\w-]*$/.test(result.id)) {
    throw new Error("Graph id must be a simple SVG identifier.");
  }
  if (
    ![
      result.width,
      result.height,
      result.roughness,
      result.hatchGap,
      result.seed,
    ].every(Number.isFinite) ||
    result.width < 600 || result.height < 400 || result.roughness < 0 ||
    result.hatchGap < 2
  ) {
    throw new Error(
      "Graphs need width >= 600, height >= 400, roughness >= 0, hatchGap >= 2, and finite options.",
    );
  }
  return result;
}

// Keep labels within their allocation. The full text remains in an SVG title.
function text(
  value: string,
  x: number,
  y: number,
  size = 14,
  anchor = "start",
  color: string = INK,
  maxWidth = Infinity,
): ScenePart {
  const visible = fitGraphText(value, size, maxWidth);
  const markup =
    `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${color}"><title>${
      escapeXml(value)
    }</title>${escapeXml(visible)}</text>`;
  const bounds = graphTextBounds(visible, size, x, y, anchor);
  return {
    markup,
    bounds,
    obstacles: bounds ? [{ bounds, kind: "text" }] : [],
  };
}

function group(
  title: string,
  parts: ScenePart[],
  width: number,
  namespace: string,
  targets: Map<string, RenderTarget>,
  focusBounds: Bounds,
): TargetedDrawing {
  const bodyBounds = unionBounds(parts.map((p) => p.bounds));
  if (!bodyBounds) throw new Error("A graph needs visible content.");
  // Center over the actual chart and legend, not the unused allocation.
  parts.unshift(
    registerTarget(
      targets,
      `${namespace}.title`,
      text(
        title,
        bodyBounds.x + bodyBounds.width / 2,
        40,
        25,
        "middle",
        INK,
        width - 60,
      ),
      "text",
    ),
  );
  const markup = `<g style="${GRAPH_FONT_STYLE}" role="img" aria-label="${
    escapeXml(title)
  }"><title>${escapeXml(title)}</title>${
    parts.map((p) => p.markup).join("\n")
  }</g>`;
  return {
    markup,
    bounds: unionBounds(parts.map((p) => p.bounds)),
    targets,
    focusBounds,
    obstacles: parts.flatMap((p) =>
      p.obstacles ??
        (p.bounds ? [{ bounds: p.bounds, kind: "shape" as const }] : [])
    ),
  };
}

/** Round axis limits to readable steps such as 5, 10, or 20 million. */
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
    throw new Error("Axis values exceed the supported numeric range.");
  }
  const ticks = Array.from(
    { length: Math.round((high - low) / step) + 1 },
    (_, i) => Number((low + i * step).toPrecision(12)),
  );
  return { ticks, scale: (value: number) => (value - low) / (high - low) };
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

/** XY charts share axes, legends, and semantic point targets. */
export function renderXyGraph(chart: XyChart, options: GraphOptions): string {
  return renderXyGraphDrawing(chart, options).markup;
}

/** Measured version for standalone export or future board composition. */
export function renderXyGraphDrawing(
  chart: XyChart,
  options: GraphOptions,
): TargetedDrawing {
  const c = settings(options);
  const namespace = chart.id ?? c.id;
  const targets = new Map<string, RenderTarget>();
  const isBar = chart.chartStyle === "bar";
  if (!["line", "bar", "scatter", "area"].includes(chart.chartStyle)) {
    throw new Error(`Unsupported XY style '${chart.chartStyle}'.`);
  }
  if (!chart.series.length || chart.series.some((s) => !s.points.length)) {
    throw new Error("An XY chart needs nonempty series and points.");
  }
  const xType = typeof chart.series[0].points[0].x;
  const series = chart.series.map((s) => {
    const points = s.points.map((p) => {
      if (
        typeof p.x !== xType || !Number.isFinite(p.y) ||
        (typeof p.x === "number"
          ? !Number.isFinite(p.x)
          : !isBar || !p.x.trim())
      ) {
        throw new Error(
          "XY charts require finite values and consistent X types; only bars accept categories.",
        );
      }
      return { ...p };
    });
    if (isBar && new Set(points.map((p) => p.x)).size !== points.length) {
      throw new Error(
        "Each bar series must have at most one value per category.",
      );
    }
    if (!isBar) points.sort((a, b) => Number(a.x) - Number(b.x));
    return { ...s, points };
  });
  const categories = [
    ...new Set(series.flatMap((s) => s.points.map((p) => p.x))),
  ];

  // Pack measured entries like a wrapping flex row instead of fixed columns.
  const legendGap = 64;
  let legendX = 0;
  let legendRow = 0;
  const legendEntries = series.map((s) => {
    const width = 33 + measureGraphText(fitGraphText(s.name, 13, 155), 13);
    if (legendX > 0 && legendX + width > c.width - 134) {
      legendX = 0;
      legendRow++;
    }
    const entry = { x: legendX, row: legendRow };
    legendX += width + legendGap;
    return entry;
  });
  const legendRows = legendRow + 1;
  const plot = {
    left: 92,
    right: c.width - 42,
    top: 90,
    bottom: c.height - 88 - legendRows * 26,
  };
  if (plot.bottom - plot.top < 150) {
    throw new Error("Increase graph height to fit the series legend.");
  }
  const xAxis = isBar
    ? null
    : axis(series.flatMap((s) => s.points.map((p) => Number(p.x))));
  // Start positive Y axes at zero; negative data extends below zero.
  const yAxis = axis(series.flatMap((s) => s.points.map((p) => p.y)), true);
  const band = (plot.right - plot.left) / categories.length;
  const barWidth = band * 0.72 / series.length;
  if (isBar && barWidth < 3) {
    throw new Error("Increase graph width or reduce bar categories/series.");
  }
  const x = (value: number | string) =>
    plot.left +
    (isBar
      ? (categories.indexOf(value) + 0.5) * band
      : xAxis!.scale(Number(value)) * (plot.right - plot.left));
  const y = (value: number) =>
    plot.bottom - yAxis.scale(value) * (plot.bottom - plot.top);
  let sequence = 0;
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    stroke: string = INK,
    strokeWidth = 1.6,
  ): ScenePart => {
    const drawing = renderHandwritten({ type: "line", x1, y1, x2, y2 }, {
      id: `${c.id}-line-${sequence}`,
      seed: c.seed + sequence++,
      roughness: c.roughness,
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
  };
  const parts: ScenePart[] = [];
  for (const tick of yAxis.ticks) {
    parts.push(
      {
        markup: `<path d="M ${plot.left} ${
          y(tick)
        } H ${plot.right}" fill="none" stroke="${COLORS.grid}" stroke-width="1" stroke-dasharray="4 6"/>`,
        bounds: {
          x: plot.left,
          y: y(tick) - 0.5,
          width: plot.right - plot.left,
          height: 1,
        },
        obstacles: [], // Grid lines do not reserve space for annotations.
      },
    );
    parts.push(
      text(
        numberLabel(tick, true),
        plot.left - 14,
        y(tick) + 5,
        13,
        "end",
        MUTED,
      ),
    );
  }
  for (const tick of (isBar ? categories : xAxis!.ticks)) {
    parts.push(line(x(tick), plot.bottom, x(tick), plot.bottom + 5));
    parts.push(
      text(
        isBar ? String(tick) : numberLabel(Number(tick)),
        x(tick),
        plot.bottom + 25,
        13,
        "middle",
        MUTED,
        isBar ? band - 8 : Infinity,
      ),
    );
  }
  parts.push(line(plot.left, plot.top, plot.left, plot.bottom));
  parts.push(line(plot.left, plot.bottom, plot.right, plot.bottom));
  parts.push(
    registerTarget(
      targets,
      `${namespace}.x-label`,
      text(
        chart.xLabel,
        (plot.left + plot.right) / 2,
        plot.bottom + 58,
        16,
        "middle",
        INK,
        c.width - 150,
      ),
      "text",
    ),
  );
  parts.push(
    registerTarget(
      targets,
      `${namespace}.y-label`,
      rotateLabel(
        text(chart.yLabel, 0, 0, 16, "middle", INK, plot.bottom - plot.top),
        25,
        (plot.top + plot.bottom) / 2,
      ),
      "text",
      true,
    ),
  );

  series.forEach((s, i) => {
    const color = GRAPH_COLORS[i % GRAPH_COLORS.length];
    if (chart.chartStyle === "area" && s.points.length > 1) {
      const coords = s.points.map((p) => `${x(p.x)} ${y(p.y)}`).join(" L ");
      const path = `M ${x(s.points[0].x)} ${y(0)} L ${coords} L ${
        x(s.points.at(-1)!.x)
      } ${y(0)} Z`;
      const areaBounds = {
        x: x(s.points[0].x),
        y: Math.min(y(0), ...s.points.map((p) => y(p.y))),
        width: x(s.points.at(-1)!.x) - x(s.points[0].x),
        height: Math.max(y(0), ...s.points.map((p) => y(p.y))) -
          Math.min(y(0), ...s.points.map((p) => y(p.y))),
      };
      const areaId = `${c.id}-area-${i}`;
      if (areaBounds.width > 0 && areaBounds.height > 0) {
        parts.push({
          markup:
            `<defs><clipPath id="${areaId}"><path d="${path}"/></clipPath></defs><g clip-path="url(#${areaId})">${
              handwritten({ type: "rectangle", ...areaBounds }, {
                id: `${areaId}-fill`,
                seed: c.seed + i,
                roughness: c.roughness,
                hatchGap: c.hatchGap,
                fill: color,
                stroke: "none",
              })
            }</g>`,
          bounds: areaBounds,
          obstacles: [],
        });
      }
    }
    s.points.forEach((p, j) => {
      if (
        j > 0 && (chart.chartStyle === "line" || chart.chartStyle === "area")
      ) {
        const previous = s.points[j - 1];
        parts.push(
          line(x(previous.x), y(previous.y), x(p.x), y(p.y), color, 2.7),
        );
      }
    });
    // Exact point markers preserve the data position despite the line wobble.
    for (const p of s.points) {
      if (isBar) {
        const bx = x(p.x) - band * 0.36 + i * barWidth;
        const top = Math.min(y(0), y(p.y));
        const bar = p.y === 0
          ? line(bx, y(0), bx + barWidth * 0.9, y(0), color, 2)
          : renderHandwritten({
            type: "rectangle",
            x: bx,
            y: top,
            width: barWidth * 0.9,
            height: Math.abs(y(p.y) - y(0)),
          }, {
            id: `${c.id}-bar-${i}-${s.points.indexOf(p)}`,
            seed: c.seed + i + s.points.indexOf(p),
            roughness: c.roughness,
            hatchGap: c.hatchGap,
            fill: color,
            stroke: color,
          });
        parts.push(
          registerTarget(
            targets,
            p.id ? `${namespace}.${p.id}.mark` : undefined,
            {
              ...bar,
              markup: `<g><title>${
                escapeXml(`${s.name}: ${p.x}, ${p.y}`)
              }</title>${bar.markup}</g>`,
            },
            "mark",
          ),
        );
        continue;
      }
      parts.push(
        registerTarget(
          targets,
          p.id ? `${namespace}.${p.id}.mark` : undefined,
          {
            markup: `<circle cx="${x(p.x)}" cy="${
              y(p.y)
            }" r="4.5" fill="${color}"><title>${
              escapeXml(`${s.name}: ${p.x}, ${p.y.toLocaleString("en-US")}`)
            }</title></circle>`,
            bounds: { x: x(p.x) - 4.5, y: y(p.y) - 4.5, width: 9, height: 9 },
          },
          "mark",
        ),
      );
    }
    const lx = 92 + legendEntries[i].x;
    const ly = c.height - 24 - (legendRows - 1 - legendEntries[i].row) * 26;
    if (chart.chartStyle === "scatter") {
      parts.push({
        markup: `<circle cx="${lx + 12}" cy="${
          ly - 5
        }" r="4.5" fill="${color}"/>`,
        bounds: { x: lx + 7.5, y: ly - 9.5, width: 9, height: 9 },
      });
    } else if (isBar || chart.chartStyle === "area") {
      parts.push(
        renderHandwritten({
          type: "rectangle",
          x: lx + 3,
          y: ly - 14,
          width: 18,
          height: 18,
        }, {
          id: `${c.id}-legend-${i}`,
          seed: c.seed + i,
          roughness: c.roughness * 0.4,
          hatchGap: 5,
          fill: color,
          stroke: color,
        }),
      );
    } else parts.push(line(lx, ly - 5, lx + 23, ly - 5, color, 2.7));
    parts.push(
      registerTarget(
        targets,
        s.id ? `${namespace}.${s.id}.legend-label` : undefined,
        text(s.name, lx + 33, ly, 13, "start", INK, 155),
        "text",
      ),
    );
  });
  return group(chart.title, parts, c.width, namespace, targets, {
    x: plot.left,
    y: plot.top,
    width: plot.right - plot.left,
    height: plot.bottom - plot.top,
  });
}

/** Pie angles stay exact; the pen effect is applied to fills and borders. */
export function renderCircularGraph(
  chart: CircularChart,
  options: GraphOptions,
): string {
  return renderCircularGraphDrawing(chart, options).markup;
}

export function renderCircularGraphDrawing(
  chart: CircularChart,
  options: GraphOptions,
): TargetedDrawing {
  const c = settings(options);
  const namespace = chart.id ?? c.id;
  const targets = new Map<string, RenderTarget>();
  if (
    chart.slices.length < 1 ||
    chart.slices.some((s) => !Number.isFinite(s.value) || s.value <= 0)
  ) {
    throw new Error(
      "A pie chart needs at least one positive, finite slice value.",
    );
  }
  const total = chart.slices.reduce((sum, s) => sum + s.value, 0);
  if (!Number.isFinite(total)) {
    throw new Error("Pie total exceeds the supported numeric range.");
  }
  const style = chart.chartStyle ?? "pie";
  if (!["pie", "donut"].includes(style)) {
    throw new Error("Unsupported circular chart style.");
  }
  let angle = -Math.PI / 2;
  const entries = chart.slices.map((slice) => {
    const startAngle = angle;
    angle += slice.value / total * Math.PI * 2;
    return { slice, startAngle, endAngle: angle };
  });
  if (entries.length * 48 > c.height - 130) {
    throw new Error("Increase graph height to fit the slice legend.");
  }
  const cx = c.width * 0.3;
  const cy = (c.height + 65) / 2;
  const r = Math.min(c.width * 0.22, (c.height - 155) / 2);
  const circle = { type: "circle", cx, cy, r } as const;
  const parts: ScenePart[] = [];
  const borders: Drawing[] = [];
  const percentages: Drawing[] = [];
  entries.forEach(
    ({ slice, startAngle: angle, endAngle }, i) => {
      const outerRadius = r;
      const innerRadius = style === "donut" ? r * CIRCULAR_STYLE.donutHole : 0;
      const point = (a: number, radius = outerRadius) => ({
        x: cx + Math.cos(a) * radius,
        y: cy + Math.sin(a) * radius,
      });
      const fraction = slice.value / total;
      const start = point(angle);
      const end = point(endAngle);
      // Sector extrema, including cardinal directions on this arc. The outer
      // circle still owns painted export bounds; this box identifies the wedge.
      const extrema = [
        point(angle, innerRadius),
        point(endAngle, innerRadius),
        start,
        end,
      ];
      for (
        let a = Math.ceil(angle / (Math.PI / 2)) * (Math.PI / 2);
        a < endAngle;
        a += Math.PI / 2
      ) {
        extrema.push(point(a), point(a, innerRadius));
      }
      const left = Math.min(...extrema.map((p) => p.x));
      const top = Math.min(...extrema.map((p) => p.y));
      const sectorBounds = {
        x: left,
        y: top,
        width: Math.max(...extrema.map((p) => p.x)) - left,
        height: Math.max(...extrema.map((p) => p.y)) - top,
      };
      const color = GRAPH_COLORS[i % GRAPH_COLORS.length];
      const id = `${c.id}-slice-${i}`;
      // Generate strokes only inside this sector. Keep the SVG clip as a guard
      // for bent strokes and for the shared circle-shaped background wash.
      // Two arcs also support a complete 360-degree slice. The hole is genuinely transparent.
      const arc = (
        radius: number,
        from: number,
        to: number,
        clockwise: number,
      ) => {
        const mid = point((from + to) / 2, radius), end = point(to, radius);
        return `A ${radius} ${radius} 0 0 ${clockwise} ${mid.x} ${mid.y} A ${radius} ${radius} 0 0 ${clockwise} ${end.x} ${end.y}`;
      };
      const insideEnd = point(endAngle, innerRadius);
      const sector = innerRadius === 0 && fraction < 1
        ? `M ${cx} ${cy} L ${start.x} ${start.y} A ${outerRadius} ${outerRadius} 0 ${
          fraction > 0.5 ? 1 : 0
        } 1 ${end.x} ${end.y} Z`
        : `M ${start.x} ${start.y} ${
          arc(outerRadius, angle, endAngle, 1)
        } L ${insideEnd.x} ${insideEnd.y} ${
          innerRadius ? arc(innerRadius, endAngle, angle, 0) : ""
        } Z`;
      parts.push(
        {
          markup:
            `<defs><clipPath id="${id}-sector" clipPathUnits="userSpaceOnUse"><path d="${sector}"/></clipPath></defs>`,
          bounds: null,
        },
      );
      parts.push(
        registerTarget(
          targets,
          slice.id ? `${namespace}.${slice.id}.mark` : undefined,
          {
            markup: `<g clip-path="url(#${id}-sector)"><title>${
              escapeXml(`${slice.label}: ${slice.value}`)
            }</title>${
              handwritten(circle, {
                id,
                seed: c.seed,
                fillSeed: c.seed + i,
                hatchSector: { startAngle: angle, endAngle },
                roughness: c.roughness,
                hatchGap: c.hatchGap,
                fill: color,
                stroke: "none",
              })
            }</g>`,
            bounds: null,
            obstacles: [], // The complete pie disk reserves the filled area below.
          },
          "mark",
          false,
          sectorBounds,
        ), // Fill is contained by the measured outer circle below.
      );
      if (slice.id) {
        const mid = (angle + endAngle) / 2;
        targets.get(`${namespace}.${slice.id}.mark`)!.anchor = {
          point: point(mid),
          direction: { x: Math.cos(mid), y: Math.sin(mid) },
        };
      }
      borders.push(
        renderHandwritten({
          type: "line",
          x1: point(angle, innerRadius).x,
          y1: point(angle, innerRadius).y,
          x2: start.x,
          y2: start.y,
        }, {
          id: `${id}-border`,
          seed: c.seed + i,
          roughness: c.roughness,
          stroke: INK,
          strokeWidth: 1.6,
        }),
      );
      const percent = `${Number((fraction * 100).toFixed(1))}%`;
      // Small slices use the legend only, avoiding overlapping interior labels.
      if (fraction >= 0.08) {
        const mid = (angle + endAngle) / 2;
        percentages.push(
          registerTarget(
            targets,
            slice.id ? `${namespace}.${slice.id}.percentage` : undefined,
            text(
              percent,
              cx +
                Math.cos(mid) *
                  (innerRadius ? (innerRadius + outerRadius) / 2 : r * 0.66),
              cy +
                Math.sin(mid) *
                  (innerRadius ? (innerRadius + outerRadius) / 2 : r * 0.66) +
                5,
              16,
              "middle",
            ),
            "text",
          ),
        );
      }
      const lx = c.width * 0.6;
      const ly = cy - entries.length * 24 + i * 48 + 12;
      parts.push(
        renderHandwritten({
          type: "rectangle",
          x: lx,
          y: ly - 13,
          width: 18,
          height: 18,
        }, {
          id: `${id}-legend`,
          seed: c.seed + i,
          roughness: c.roughness * 0.4,
          hatchGap: 5,
          fill: color,
          stroke: color,
          strokeWidth: 1.5,
        }),
      );
      parts.push(
        registerTarget(
          targets,
          slice.id ? `${namespace}.${slice.id}.legend-label` : undefined,
          text(
            slice.label,
            lx + 30,
            ly,
            15,
            "start",
            INK,
            c.width - lx - 60,
          ),
          "text",
        ),
      );
      parts.push(
        text(
          `${slice.value.toLocaleString("en-US")} · ${percent}`,
          lx + 30,
          ly + 18,
          12,
          "start",
          MUTED,
          c.width - lx - 60,
        ),
      );
    },
  );
  if (style === "donut") {
    borders.push(
      renderHandwritten({ ...circle, r: r * CIRCULAR_STYLE.donutHole }, {
        id: `${c.id}-ring-${Math.round(CIRCULAR_STYLE.donutHole * 100)}`,
        seed: c.seed,
        roughness: c.roughness,
      }),
    );
  }
  parts.push(
    ...borders.map((b) => ({ ...b, obstacles: [] })),
    {
      ...renderHandwritten(circle, {
        id: `${c.id}-outline`,
        seed: c.seed,
        roughness: c.roughness,
      }),
      obstacles: [{
        kind: "area",
        bounds: { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r },
        circle: { cx, cy, r },
      }],
    },
    ...percentages,
  );
  return group(chart.title, parts, c.width, namespace, targets, {
    x: cx - r,
    y: cy - r,
    width: 2 * r,
    height: 2 * r,
  });
}

/** Standalone export helper for demos; group renderers also work in a board. */
export function renderGraphSvg(chart: Graph, options: GraphOptions) {
  const c = settings(options);
  const drawing = chart.type === "xy_chart"
    ? renderXyGraphDrawing(chart, c)
    : renderCircularGraphDrawing(chart, c);
  const bounds = exportBounds(drawing.bounds);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" role="img" aria-label="${
      escapeXml(chart.title)
    }"><title>${
      escapeXml(chart.title)
    }</title>${GRAPH_FONT_DEFS}${drawing.markup}</svg>`;
  return { svg, width: bounds.width, height: bounds.height };
}

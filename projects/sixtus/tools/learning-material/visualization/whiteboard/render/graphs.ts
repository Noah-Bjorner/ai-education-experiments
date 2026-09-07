import type { WhiteboardSpec } from "../schema.ts";
import { escapeXml } from "../../static/shared/svg.ts";
import { handwritten } from "./handwritten.ts";
import { fitGraphText, GRAPH_FONT_DEFS, GRAPH_FONT_STYLE } from "./font.ts";

export type XyChart = Extract<
  WhiteboardSpec["children"][number],
  { type: "xy_chart" }
>;
export type PieChart = Extract<
  WhiteboardSpec["children"][number],
  { type: "pie_chart" }
>;
export type Graph = XyChart | PieChart;

/** Colors are assigned in series/slice order. */
export const GRAPH_COLORS = [
  "#477bbb",
  "#b7754a",
  "#56896b",
  "#9170aa",
  "#bc6478",
  "#89843f",
];
const INK = "#263449";
const MUTED = "#677184";
const BACKGROUND = "#fffdf9";

export type GraphOptions = {
  /** Must be unique when several graph groups share one SVG. */
  id: string;
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
  color = INK,
  maxWidth = Infinity,
): string {
  const visible = fitGraphText(value, size, maxWidth);
  return `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${color}"><title>${
    escapeXml(value)
  }</title>${escapeXml(visible)}</text>`;
}

function group(title: string, body: string): string {
  return `<g style="${GRAPH_FONT_STYLE}" role="img" aria-label="${
    escapeXml(title)
  }"><title>${escapeXml(title)}</title>${body}</g>`;
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

/** Numeric line charts only for now. Returns a group in local coordinates. */
export function renderXyGraph(chart: XyChart, options: GraphOptions): string {
  const c = settings(options);
  if (chart.chartStyle !== "line") {
    throw new Error(
      `XY chart style '${chart.chartStyle}' is not implemented yet.`,
    );
  }
  if (!chart.series.length || chart.series.some((s) => !s.points.length)) {
    throw new Error(
      "A line chart needs at least one series, each with at least one point.",
    );
  }
  // Copy before sorting, so rendering never changes the saved spec.
  const series = chart.series.map((s) => ({
    ...s,
    points: s.points.map((p) => {
      if (
        typeof p.x !== "number" || !Number.isFinite(p.x) ||
        !Number.isFinite(p.y)
      ) {
        throw new Error("Line charts require finite numeric X and Y values.");
      }
      return { x: p.x, y: p.y };
    }).sort((a, b) => a.x - b.x),
  }));

  const legendColumns = Math.floor((c.width - 100) / 200);
  const legendRows = Math.ceil(series.length / legendColumns);
  const plot = {
    left: 92,
    right: c.width - 42,
    top: 90,
    bottom: c.height - 88 - legendRows * 26,
  };
  if (plot.bottom - plot.top < 150) {
    throw new Error("Increase graph height to fit the series legend.");
  }
  const xAxis = axis(series.flatMap((s) => s.points.map((p) => p.x)));
  // Start positive Y axes at zero; negative data extends below zero.
  const yAxis = axis(series.flatMap((s) => s.points.map((p) => p.y)), true);
  const x = (value: number) =>
    plot.left + xAxis.scale(value) * (plot.right - plot.left);
  const y = (value: number) =>
    plot.bottom - yAxis.scale(value) * (plot.bottom - plot.top);
  let sequence = 0;
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    stroke = INK,
    strokeWidth = 1.6,
  ) =>
    handwritten({ type: "line", x1, y1, x2, y2 }, {
      id: `${c.id}-line-${sequence}`,
      seed: c.seed + sequence++,
      roughness: c.roughness,
      stroke,
      strokeWidth,
    });
  const parts = [
    text(chart.title, c.width / 2, 40, 25, "middle", INK, c.width - 60),
  ];
  for (const tick of yAxis.ticks) {
    parts.push(
      `<path d="M ${plot.left} ${
        y(tick)
      } H ${plot.right}" fill="none" stroke="#e0e4e9"/>`,
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
  for (const tick of xAxis.ticks) {
    parts.push(line(x(tick), plot.bottom, x(tick), plot.bottom + 5));
    parts.push(
      text(numberLabel(tick), x(tick), plot.bottom + 25, 13, "middle", MUTED),
    );
  }
  parts.push(line(plot.left, plot.top, plot.left, plot.bottom));
  parts.push(line(plot.left, plot.bottom, plot.right, plot.bottom));
  parts.push(
    text(
      chart.xLabel,
      (plot.left + plot.right) / 2,
      plot.bottom + 58,
      16,
      "middle",
      INK,
      c.width - 150,
    ),
  );
  parts.push(
    `<g transform="translate(25 ${(plot.top + plot.bottom) / 2}) rotate(-90)">${
      text(chart.yLabel, 0, 0, 16, "middle", INK, plot.bottom - plot.top)
    }</g>`,
  );

  series.forEach((s, i) => {
    const color = GRAPH_COLORS[i % GRAPH_COLORS.length];
    s.points.forEach((p, j) => {
      if (j > 0) {
        const previous = s.points[j - 1];
        parts.push(
          line(x(previous.x), y(previous.y), x(p.x), y(p.y), color, 2.7),
        );
      }
    });
    // Exact point markers preserve the data position despite the line wobble.
    for (const p of s.points) {
      parts.push(
        `<circle cx="${x(p.x)}" cy="${
          y(p.y)
        }" r="4.5" fill="${color}" stroke="${BACKGROUND}" stroke-width="2"><title>${
          escapeXml(`${s.name}: ${p.x}, ${p.y.toLocaleString("en-US")}`)
        }</title></circle>`,
      );
    }
    const lx = 92 + (i % legendColumns) * 200;
    const ly = c.height - 24 -
      (legendRows - 1 - Math.floor(i / legendColumns)) * 26;
    parts.push(line(lx, ly - 5, lx + 23, ly - 5, color, 2.7));
    parts.push(text(s.name, lx + 33, ly, 13, "start", INK, 155));
  });
  return group(chart.title, parts.join("\n"));
}

/** Pie angles stay exact; the pen effect is applied to fills and borders. */
export function renderPieGraph(chart: PieChart, options: GraphOptions): string {
  const c = settings(options);
  if (
    chart.slices.length < 2 ||
    chart.slices.some((s) => !Number.isFinite(s.value) || s.value <= 0)
  ) {
    throw new Error(
      "A pie chart needs at least two positive, finite slice values.",
    );
  }
  const total = chart.slices.reduce((sum, s) => sum + s.value, 0);
  if (!Number.isFinite(total)) {
    throw new Error("Pie total exceeds the supported numeric range.");
  }
  if (chart.slices.length * 48 > c.height - 130) {
    throw new Error("Increase graph height to fit the slice legend.");
  }
  const cx = c.width * 0.3;
  const cy = (c.height + 65) / 2;
  const r = Math.min(c.width * 0.22, (c.height - 155) / 2);
  const circle = { type: "circle", cx, cy, r } as const;
  const parts = [
    text(chart.title, c.width / 2, 40, 25, "middle", INK, c.width - 60),
  ];
  const borders: string[] = [];
  const percentages: string[] = [];
  let angle = -Math.PI / 2; // Begin at 12 o'clock, then move clockwise.
  const point = (a: number) => ({
    x: cx + Math.cos(a) * r,
    y: cy + Math.sin(a) * r,
  });
  chart.slices.forEach((slice, i) => {
    const fraction = slice.value / total;
    const endAngle = angle + fraction * Math.PI * 2;
    const start = point(angle);
    const end = point(endAngle);
    const color = GRAPH_COLORS[i % GRAPH_COLORS.length];
    const id = `${c.id}-slice-${i}`;
    // A sector clips a hatched circle, so hatch generation stays in handwritten.ts.
    const sector = `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${
      fraction > 0.5 ? 1 : 0
    } 1 ${end.x} ${end.y} Z`;
    parts.push(
      `<defs><clipPath id="${id}-sector" clipPathUnits="userSpaceOnUse"><path d="${sector}"/></clipPath></defs>`,
    );
    parts.push(
      `<g clip-path="url(#${id}-sector)"><title>${
        escapeXml(`${slice.label}: ${slice.value}`)
      }</title>${
        handwritten(circle, {
          id,
          seed: c.seed,
          roughness: c.roughness,
          hatchGap: c.hatchGap,
          fill: color,
          stroke: "none",
        })
      }</g>`,
    );
    borders.push(
      handwritten({ type: "line", x1: cx, y1: cy, x2: start.x, y2: start.y }, {
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
        `<g stroke="${BACKGROUND}" stroke-width="5" paint-order="stroke" stroke-linejoin="round">${
          text(
            percent,
            cx + Math.cos(mid) * r * 0.66,
            cy + Math.sin(mid) * r * 0.66 + 5,
            16,
            "middle",
          )
        }</g>`,
      );
    }
    const lx = c.width * 0.6;
    const ly = cy - chart.slices.length * 24 + i * 48 + 12;
    parts.push(
      handwritten({
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
      text(slice.label, lx + 30, ly, 15, "start", INK, c.width - lx - 60),
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
    angle = endAngle;
  });
  parts.push(
    ...borders,
    handwritten(circle, {
      id: `${c.id}-outline`,
      seed: c.seed,
      roughness: c.roughness,
    }),
    ...percentages,
  );
  return group(chart.title, parts.join("\n"));
}

/** Standalone export helper for demos; group renderers also work in a board. */
export function renderGraphSvg(chart: Graph, options: GraphOptions) {
  const c = settings(options);
  const body = chart.type === "xy_chart"
    ? renderXyGraph(chart, c)
    : renderPieGraph(chart, c);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}" viewBox="0 0 ${c.width} ${c.height}" role="img" aria-label="${
      escapeXml(chart.title)
    }"><title>${
      escapeXml(chart.title)
    }</title>${GRAPH_FONT_DEFS}${body}</svg>`;
  return { svg, width: c.width, height: c.height };
}

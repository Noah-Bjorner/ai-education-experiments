import {
  type CoordinateElement,
  type CoordinatePlot,
  coordinatePlotSchema,
} from "../children/coordinate-plot.ts";
import type { Bounds, Point } from "./bounds.ts";
import { expandBounds, unionBounds } from "./bounds.ts";
import { fitGraphText, GRAPH_FONT_STYLE, graphTextBounds } from "./font.ts";
import type { GraphOptions } from "./graphs.ts";
import {
  registerTarget,
  type RenderObstacle,
  type RenderTarget,
  type ScenePart,
  type TargetedDrawing,
} from "./targets.ts";
import { COLORS, SERIES_COLORS } from "./theme.ts";
import { escapeXml } from "./svg.ts";
import { segmentHitsBox } from "./placement.ts";
import {
  clipCoordinateLine,
  compileCoordinateExpression,
  coordinateEndpointValue,
  sampleCoordinateFunction,
} from "./coordinate-math.ts";

const fmt = (n: number) => Number(n.toFixed(4));
const inside = (p: Point, b: Bounds) =>
  p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
const overlaps = (a: Bounds, b: Bounds) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height &&
  a.y + a.height > b.y;
const segmentBounds = (a: Point, b: Point): Bounds => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(b.x - a.x),
  height: Math.abs(b.y - a.y),
});

export function coordinateTicks(
  axis: CoordinatePlot["axes"]["x"],
  pixels: number,
) {
  if (axis.ticks) return [...axis.ticks].sort((a, b) => a.value - b.value);
  const span = axis.max - axis.min;
  const raw = span / Math.max(2, Math.floor(pixels / 64));
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = axis.tickStep ??
    ([1, 2, 5, 10].find((n) => n * power >= raw)! * power);
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error("Coordinate tick spacing is outside numerical precision.");
  }
  const first = Math.ceil(axis.min / step), last = Math.floor(axis.max / step);
  if (![first, last].every(Number.isSafeInteger) || last - first > 100) {
    throw new Error(
      "Coordinate axis needs at most 101 ticks; increase tickStep or use explicit ticks.",
    );
  }
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => {
    const value = Number(((first + i) * step).toPrecision(12));
    return { value, label: String(Object.is(value, -0) ? 0 : value) };
  });
}

/** Coordinate geometry stays exact; handwriting comes from the shared font.
 * Numerical helpers own sampling/clipping; this module owns visible scene parts.
 */
export function renderCoordinatePlotDrawing(
  input: CoordinatePlot,
  options: GraphOptions,
): TargetedDrawing {
  const plot = coordinatePlotSchema.parse(input);
  const width = options.width ?? 800, height = options.height ?? 520;
  if (![width, height].every(Number.isFinite) || width < 600 || height < 400) {
    throw new Error("Coordinate plots need width >= 600 and height >= 400.");
  }
  if (!/^[a-zA-Z][\w-]*$/.test(options.id)) {
    throw new Error("Coordinate renderer id must be a simple SVG identifier.");
  }
  const id = plot.id ?? options.id;
  const { x: xAxis, y: yAxis } = plot.axes;
  const xSpan = xAxis.max - xAxis.min, ySpan = yAxis.max - yAxis.min;
  let sx = (width - 160) / xSpan, sy = (height - 160) / ySpan;
  if (plot.axes.scale !== "independent") sx = sy = Math.min(sx, sy);
  const box: Bounds = {
    x: 80 + (width - 160 - xSpan * sx) / 2,
    y: 80 + (height - 160 - ySpan * sy) / 2,
    width: xSpan * sx,
    height: ySpan * sy,
  };
  if (
    ![sx, sy, ...Object.values(box)].every(Number.isFinite) || box.width < 40 ||
    box.height < 40
  ) {
    throw new Error(
      "Coordinate ranges cannot fit a readable plane; use independent scaling or a different window.",
    );
  }
  const project = (x: number, y: number): Point => ({
    x: box.x + (x - xAxis.min) * sx,
    y: box.y + (yAxis.max - y) * sy,
  });
  const mathBox = { x: xAxis.min, y: yAxis.min, width: xSpan, height: ySpan };
  const targets = new Map<string, RenderTarget>();
  const furniture: ScenePart[] = [],
    marks: ScenePart[] = [],
    labels: ScenePart[] = [];
  const obstacles: RenderObstacle[] = [];
  const maskId = `${options.id}-coordinate-holes`,
    clipId = `${options.id}-coordinate-clip`;
  const holes: Point[] = [];
  const pendingLabels: {
    element: CoordinateElement;
    anchors: Point[];
    color: string;
  }[] = [];

  function text(
    value: string,
    x: number,
    y: number,
    size = 14,
    anchor = "start",
    color: string = COLORS.ink,
    maxWidth = width - 32,
  ): ScenePart {
    const shown = fitGraphText(value, size, maxWidth);
    const bounds = graphTextBounds(shown, size, x, y, anchor);
    return {
      markup: `<text x="${fmt(x)}" y="${
        fmt(y)
      }" font-size="${size}" text-anchor="${anchor}" fill="${color}"><title>${
        escapeXml(value)
      }</title>${escapeXml(shown)}</text>`,
      bounds,
      obstacles: bounds ? [{ bounds, kind: "text" }] : [],
    };
  }
  function addText(part: ScenePart, target?: string) {
    const registered = registerTarget(targets, target, part, "text");
    labels.push(registered);
    obstacles.push(...registered.obstacles ?? []);
  }
  function stroke(a: Point, b: Point, color: string, size = 1): ScenePart {
    const bounds = expandBounds(segmentBounds(a, b), size / 2)!;
    return {
      markup: `<path d="M${fmt(a.x)} ${fmt(a.y)}L${fmt(b.x)} ${
        fmt(b.y)
      }" fill="none" stroke="${color}" stroke-width="${size}"/>`,
      bounds,
      obstacles: [{ bounds, kind: "stroke", segment: { a, b } }],
    };
  }
  const xticks = coordinateTicks(xAxis, box.width),
    yticks = coordinateTicks(yAxis, box.height);
  const origin = project(
    Math.max(xAxis.min, Math.min(xAxis.max, 0)),
    Math.max(yAxis.min, Math.min(yAxis.max, 0)),
  );
  if (plot.axes.grid !== false) {
    for (const t of xticks) {
      const x = project(t.value, 0).x;
      furniture.push(
        stroke({ x, y: box.y }, { x, y: box.y + box.height }, COLORS.grid),
      );
    }
    for (const t of yticks) {
      const y = project(0, t.value).y;
      furniture.push(
        stroke({ x: box.x, y }, { x: box.x + box.width, y }, COLORS.grid),
      );
    }
  }
  const axes = [
    stroke(
      { x: box.x, y: origin.y },
      { x: box.x + box.width, y: origin.y },
      COLORS.ink,
      1.5,
    ),
    stroke(
      { x: origin.x, y: box.y },
      { x: origin.x, y: box.y + box.height },
      COLORS.ink,
      1.5,
    ),
  ];
  furniture.push(...axes);
  obstacles.push(...axes.flatMap((p) => p.obstacles ?? []));
  // Ticks are never silently dropped or truncated. Reject illegible dense specifications.
  const tickBoxes: Bounds[] = [];
  for (const t of xticks) {
    const p = project(t.value, 0);
    furniture.push(
      stroke(
        { x: p.x, y: origin.y - 3 },
        { x: p.x, y: origin.y + 3 },
        COLORS.ink,
      ),
    );
    const part = text(
      t.label,
      p.x,
      origin.y + 22,
      13,
      "middle",
      COLORS.textMuted,
      Infinity,
    );
    if (
      part.bounds &&
      tickBoxes.some((b) => overlaps(expandBounds(b, 3)!, part.bounds!))
    ) {
      throw new Error(
        "X tick labels overlap; increase tick spacing or shorten labels.",
      );
    }
    if (part.bounds) tickBoxes.push(part.bounds);
    addText(part);
  }
  const yTickBoxes: Bounds[] = [];
  for (const t of yticks) {
    const p = project(0, t.value);
    furniture.push(
      stroke(
        { x: origin.x - 3, y: p.y },
        { x: origin.x + 3, y: p.y },
        COLORS.ink,
      ),
    );
    if (t.value === 0 && xticks.some((t) => t.value === 0)) continue;
    const part = text(
      t.label,
      origin.x - 9,
      p.y + 4,
      13,
      "end",
      COLORS.textMuted,
      Infinity,
    );
    if (
      part.bounds &&
      yTickBoxes.some((b) => overlaps(expandBounds(b, 3)!, part.bounds!))
    ) {
      throw new Error(
        "Y tick labels overlap; increase tick spacing or shorten labels.",
      );
    }
    if (part.bounds) yTickBoxes.push(part.bounds);
    addText(part);
  }
  addText(text(plot.title, width / 2, 36, 25, "middle"), `${id}.title`);
  addText(
    text(
      xAxis.label ?? "x",
      box.x + box.width / 2,
      box.y + box.height + 58,
      16,
      "middle",
    ),
    `${id}.x-label`,
  );
  // Horizontal y label above the plane avoids rotating mathematical symbols.
  addText(
    text(yAxis.label ?? "y", box.x - 16, box.y - 20, 16, "end"),
    `${id}.y-label`,
  );

  for (const [index, element] of plot.elements.entries()) {
    const color = SERIES_COLORS[index % SERIES_COLORS.length];
    const segments: [Point, Point][] = [];
    const markers: { p: Point; open: boolean }[] = [];
    const arrows: [Point, Point][] = [];
    const addSegment = (a: Point, b: Point) => {
      const s = clipCoordinateLine(a, b, box);
      if (s) segments.push(s);
    };
    const addMarker = (p: Point, open: boolean) => {
      if (!inside(p, box)) return;
      markers.push({ p, open });
      if (open) holes.push(p);
    };
    switch (element.type) {
      case "point":
        addMarker(
          project(...element.position as [number, number]),
          element.marker === "open",
        );
        break;
      case "line": {
        const clipped = clipCoordinateLine(
          { x: element.from[0], y: element.from[1] },
          { x: element.to[0], y: element.to[1] },
          mathBox,
          element.extend,
        );
        if (clipped) {
          const [a, b] = clipped.map((p) => project(p.x, p.y));
          segments.push([a, b]);
          const startContinues = element.extend === "start" ||
            element.extend === "both";
          const endContinues = element.extend === "end" ||
            element.extend === "both";
          if (
            (element.arrowheads === "start" || element.arrowheads === "both") &&
            (startContinues ||
              inside(project(element.from[0], element.from[1]), box))
          ) arrows.push([b, a]);
          if (
            (element.arrowheads === "end" || element.arrowheads === "both") &&
            (endContinues || inside(project(element.to[0], element.to[1]), box))
          ) arrows.push([a, b]);
        }
        break;
      }
      case "polygon": {
        for (let i = 0; i < element.vertices.length; i++) {
          const a = element.vertices[i],
            b = element.vertices[(i + 1) % element.vertices.length];
          const clipped = clipCoordinateLine({ x: a[0], y: a[1] }, {
            x: b[0],
            y: b[1],
          }, mathBox);
          if (clipped) {
            segments.push(
              clipped.map((p) => project(p.x, p.y)) as [Point, Point],
            );
          }
        }
        break;
      }
      case "circle": {
        const radius = element.radius * Math.max(sx, sy);
        if (!Number.isFinite(radius)) {
          throw new Error(
            `Circle '${element.id}' exceeds numerical plotting range.`,
          );
        }
        const count = Math.max(
          64,
          Math.ceil(Math.PI * Math.sqrt(radius / 0.15)),
        );
        if (count > 8192) {
          throw new Error(
            `Circle '${element.id}' is too large for this window; adjust its radius or the axes.`,
          );
        }
        let a = project(element.center[0] + element.radius, element.center[1]);
        for (let i = 1; i <= count; i++) {
          const theta = 2 * Math.PI * i / count;
          const b = project(
            element.center[0] + element.radius * Math.cos(theta),
            element.center[1] + element.radius * Math.sin(theta),
          );
          addSegment(a, b);
          a = b;
        }
        break;
      }
      case "function": {
        const f = compileCoordinateExpression(element.expression);
        const domains = element.domain ??
          [{ min: null, max: null, includeMin: false, includeMax: false }];
        for (const domain of domains) {
          const min = Math.max(xAxis.min, domain.min ?? -Infinity),
            max = Math.min(xAxis.max, domain.max ?? Infinity);
          if (min < max) {
            segments.push(
              ...sampleCoordinateFunction(f, min, max, project, box),
            );
          }
          if (!element.endpointMarkers) continue;
          for (
            const [x, included, direction] of [[
              domain.min,
              domain.includeMin,
              1,
            ], [domain.max, domain.includeMax, -1]] as const
          ) {
            if (x === null || x < xAxis.min || x > xAxis.max) continue;
            const span = Math.min(
              xSpan,
              (domain.max ?? xAxis.max) - (domain.min ?? xAxis.min),
            );
            const y = included
              ? f(x)
              : coordinateEndpointValue(f, x, direction, span, 0.05 / sy);
            if (y !== null && Number.isFinite(y)) {
              addMarker(project(x, y), !included);
            }
          }
        }
        break;
      }
    }
    const parts: ScenePart[] = [];
    if (segments.length) {
      // Merge adjacent segments into continuous paths; retain breaks between branches.
      let path = "", last: Point | undefined;
      for (const [a, b] of segments) {
        if (!last || Math.hypot(last.x - a.x, last.y - a.y) > 1e-7) {
          path += `M${fmt(a.x)} ${fmt(a.y)}`;
        }
        path += `L${fmt(b.x)} ${fmt(b.y)}`;
        last = b;
      }
      const segmentObstacles: RenderObstacle[] = segments.map(([a, b]) => ({
        bounds: expandBounds(segmentBounds(a, b), 1.25)!,
        kind: "stroke",
        segment: { a, b },
      }));
      parts.push({
        markup:
          `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5"${
            "stroke" in element && element.stroke === "dashed"
              ? ' stroke-dasharray="7 5"'
              : ""
          } mask="url(#${maskId})"/>`,
        bounds: unionBounds(segmentObstacles.map((o) => o.bounds)),
        obstacles: segmentObstacles,
      });
    }
    for (const [a, b] of arrows) {
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      for (const sign of [-1, 1]) {
        const p = {
          x: b.x - 10 * Math.cos(angle + sign * 0.4),
          y: b.y - 10 * Math.sin(angle + sign * 0.4),
        };
        parts.push(stroke(p, b, color, 2.5));
      }
    }
    for (const { p, open } of markers) {
      const bounds = { x: p.x - 5, y: p.y - 5, width: 10, height: 10 };
      parts.push({
        markup: `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="4" fill="${
          open ? "none" : color
        }" stroke="${color}" stroke-width="2"/>`,
        bounds,
        obstacles: [{
          bounds,
          kind: "shape",
          circle: { cx: p.x, cy: p.y, r: 5 },
        }],
      });
    }
    if (!parts.length) continue;
    const mark = registerTarget(targets, `${id}.${element.id}.mark`, {
      markup: parts.map((p) => p.markup).join(""),
      bounds: unionBounds(parts.map((p) => p.bounds)),
      obstacles: parts.flatMap((p) => p.obstacles ?? []),
    }, "mark");
    marks.push(mark);
    obstacles.push(...mark.obstacles ?? []);
    const anchors = markers.map((m) => m.p);
    if (!anchors.length) {
      for (const fraction of [0.5, 0.75, 0.25, 0.9, 0.1]) {
        const s = segments[
          Math.min(
            segments.length - 1,
            Math.floor(segments.length * fraction),
          )
        ];
        if (s) {
          anchors.push({ x: (s[0].x + s[1].x) / 2, y: (s[0].y + s[1].y) / 2 });
        }
      }
    }
    if (element.label) pendingLabels.push({ element, anchors, color });
  }

  // Place labels after collecting all geometry, so later elements cannot overwrite them.
  let legendRow = 0;
  for (const { element, anchors, color } of pendingLabels) {
    let chosen: ScenePart | undefined;
    for (const p of anchors) {
      for (
        const [dx, dy, anchor] of [[10, -10, "start"], [-10, -10, "end"], [
          10,
          24,
          "start",
        ], [-10, 24, "end"]] as const
      ) {
        const candidate = text(
          element.label!,
          p.x + dx,
          p.y + dy,
          14,
          anchor,
          color,
          Math.min(240, box.width),
        );
        const b = expandBounds(candidate.bounds, 4);
        if (
          !b || !inside({ x: b.x, y: b.y }, box) ||
          !inside({ x: b.x + b.width, y: b.y + b.height }, box)
        ) continue;
        if (
          obstacles.some((o) =>
            o.segment
              ? segmentHitsBox(o.segment.a, o.segment.b, b)
              : overlaps(o.bounds, b)
          )
        ) continue;
        chosen = candidate;
        break;
      }
      if (chosen) break;
    }
    if (!chosen) {
      const y = box.y + box.height + 88 + legendRow++ * 24;
      labels.push(
        stroke({ x: box.x, y: y - 5 }, { x: box.x + 20, y: y - 5 }, color, 2.5),
      );
      chosen = text(
        element.label!,
        box.x + 30,
        y,
        14,
        "start",
        color,
        width - box.x - 50,
      );
    }
    addText(chosen, `${id}.${element.id}.label`);
  }
  for (const annotation of plot.annotations ?? []) {
    for (const target of annotation.targetIds) {
      if (!targets.has(target)) {
        throw new Error(
          `Coordinate annotation target '${target}' is outside the visible window.`,
        );
      }
    }
  }
  const defs = `<defs><clipPath id="${clipId}"><rect x="${box.x - 5}" y="${
    box.y - 5
  }" width="${box.width + 10}" height="${
    box.height + 10
  }"/></clipPath><mask id="${maskId}" maskUnits="userSpaceOnUse" x="${
    box.x - 8
  }" y="${box.y - 8}" width="${box.width + 16}" height="${
    box.height + 16
  }"><rect x="${box.x - 8}" y="${box.y - 8}" width="${
    box.width + 16
  }" height="${box.height + 16}" fill="white"/>${
    holes.map((p) =>
      `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="4" fill="black"/>`
    ).join("")
  }</mask></defs>`;
  return {
    markup:
      `<g style="${GRAPH_FONT_STYLE}" stroke-linecap="round" stroke-linejoin="round">${defs}<g mask="url(#${maskId})">${
        furniture.map((p) => p.markup).join("")
      }</g><g clip-path="url(#${clipId})">${
        marks.map((p) => p.markup).join("")
      }</g>${labels.map((p) => p.markup).join("")}</g>`,
    bounds: unionBounds(
      [...furniture, ...marks, ...labels].map((p) => p.bounds),
    ),
    targets,
    obstacles,
    focusBounds: box,
  };
}

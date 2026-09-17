// Keep this server utility's dependency pinned without changing the shared import map.
// deno-lint-ignore no-import-prefix
import { createSVGWindow } from "npm:svgdom@0.1.23";

import { type Box, elementPath } from "./geometry.ts";
import { makeStrokePlan, type StrokePlan } from "./stroke-plan.ts";
import { appendStrokeMasks } from "./masks.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const MARKER = "data-drawing-animation";

export type DrawingAnimationOptions = {
  /** Default: strokes. Use wipe to retain the original rectangular reveal. */
  mode?: "strokes" | "wipe";
  /** Pause between pen strokes in seconds. Default: 0.04. */
  strokeGap?: number;
  /** Bitmap dimension for centerline extraction (64–512). Default: 256. */
  resolution?: number;
  /** Return the original SVG unchanged when false. Default: true. */
  enabled?: boolean;
  /** Seconds before the first path starts. Default: 0. */
  startTime?: number;
  /** Total seconds, including gaps. Mutually exclusive with `speed`. */
  duration?: number;
  /** Timeline multiplier. Default: 1 (natural pace). Mutually exclusive with `duration`. */
  speed?: number;
  /** Seconds between paths. Default: 0.025. */
  gap?: number;
  /** Row-center tolerance in root SVG units. Default: half the median path height. */
  rowTolerance?: number;
  /** Use a different prefix for each SVG mounted inline on the same page. */
  idPrefix?: string;
};

type Item = {
  path: SVGGraphicsElement;
  box: Box;
  parentMatrix: DOMMatrix;
  plan: StrokePlan;
};

function transformedBox(box: Box, matrix: DOMMatrix): Box {
  const corners = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ].map(([x, y]) => ({
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  }));
  const x = Math.min(...corners.map((p) => p.x));
  const y = Math.min(...corners.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...corners.map((p) => p.x)) - x,
    height: Math.max(...corners.map((p) => p.y)) - y,
  };
}

function parentElement(node: Element): Element | null {
  return node.parentNode?.nodeType === 1 ? node.parentNode as Element : null;
}

function inherited(path: Element, property: string): string | null {
  for (let node: Element | null = path; node; node = parentElement(node)) {
    const inline = node.getAttribute("style")?.split(";").find((entry) =>
      entry.split(":")[0].trim() === property
    )?.split(":").slice(1).join(":").trim();
    const value = inline || node.getAttribute(property);
    if (value && value !== "inherit") return value;
  }
  return null;
}

function readingOrder(items: Item[], tolerance: number): Item[] {
  const rows: { center: number; items: Item[] }[] = [];
  for (
    const item of [...items].sort((a, b) =>
      (a.box.y + a.box.height / 2) - (b.box.y + b.box.height / 2)
    )
  ) {
    const center = item.box.y + item.box.height / 2;
    const row = rows.find((row) => Math.abs(row.center - center) <= tolerance);
    if (row) row.items.push(item);
    else rows.push({ center, items: [item] });
  }
  return rows.flatMap((row) => row.items.sort((a, b) => a.box.x - b.box.x));
}

/**
 * Server-side SVG string -> standalone SVG with seekable SMIL mask animations.
 * Filled outlines use inferred pen routes; stroked shapes follow their geometry.
 * Large solid fills and unsupported cases use a rectangular wipe fallback.
 * Designed for trusted, static whiteboard SVGs with outlined text and SVG
 * transform attributes. Live <text>, <use> and CSS geometry are not supported. This function is not an SVG sanitizer.
 */
export function applyDrawingAnimation(
  svg: string,
  options: DrawingAnimationOptions = {},
): string {
  if (options.enabled === false) return svg;
  const {
    startTime = 0,
    gap = 0.025,
    strokeGap = 0.04,
    resolution = 256,
    mode = "strokes",
    idPrefix = "drawing",
    speed = 1,
  } = options;
  if (mode !== "strokes" && mode !== "wipe") {
    throw new Error("Invalid drawing mode");
  }
  if (!Number.isInteger(resolution) || resolution < 64 || resolution > 512) {
    throw new Error("resolution must be an integer from 64 to 512");
  }
  if (options.duration !== undefined && options.speed !== undefined) {
    throw new Error("speed and duration are mutually exclusive");
  }
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new Error("speed must be a finite number greater than 0");
  }
  for (
    const [name, value] of Object.entries({
      startTime,
      gap,
      strokeGap,
      duration: options.duration,
      rowTolerance: options.rowTolerance,
    })
  ) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`${name} must be a finite non-negative number`);
    }
  }
  if (!/^[A-Za-z_][\w.-]*$/.test(idPrefix)) {
    throw new Error("idPrefix must be a valid SVG ID prefix");
  }

  // svgdom supplies path bounds and transform matrices without a browser.
  const document = createSVGWindow().document as Document;
  const container = document.documentElement;
  container.innerHTML = svg;
  const root = container.firstElementChild as SVGSVGElement | null;
  if (
    !root || root.localName !== "svg" || container.children.length !== 1 ||
    root.namespaceURI !== SVG_NS
  ) throw new Error("Expected one SVG root element");
  if (root.hasAttribute(MARKER)) {
    throw new Error(
      "SVG already has a drawing animation; use the original SVG",
    );
  }
  if (root.querySelector("animate, animateTransform, animateMotion, set")) {
    throw new Error("Expected a static SVG without existing SMIL animations");
  }

  const rootInverse = root.getScreenCTM()!.inverse();
  const items: Item[] = [];
  for (
    const path of Array.from(
      root.querySelectorAll<SVGGraphicsElement>(
        "path, line, circle, ellipse, rect, polyline, polygon",
      ),
    )
  ) {
    if (
      path.closest("defs, mask, clipPath, pattern, marker, symbol") ||
      path.closest('[data-drawing="static"]') ||
      inherited(path, "visibility") === "hidden"
    ) continue;
    let hidden = false;
    for (let node: Element | null = path; node; node = parentElement(node)) {
      if (inherited(node, "display") === "none") hidden = true;
    }
    if (hidden) continue;
    const d = elementPath(path);
    if (!d.trim()) continue;
    const matrix = rootInverse.multiply(path.getScreenCTM()!);
    const box = transformedBox(path.getBBox(), matrix);
    if (!Object.values(box).every(Number.isFinite)) {
      throw new Error(`Could not measure path ${path.id || "(unnamed)"}`);
    }
    if (box.width === 0 && box.height === 0) continue;
    const parent = path.parentNode as unknown as SVGGraphicsElement;
    const local = path.getBBox();
    const special = [
      "marker-start",
      "marker-mid",
      "marker-end",
      "filter",
      "vector-effect",
    ].some((key) => {
      const value = inherited(path, key);
      return value !== null && value !== "none";
    });
    const plan: StrokePlan = mode === "wipe" || special
      ? {
        kind: "wipe",
        strokes: [],
        fallback: special ? "unsupported-decoration" : undefined,
      }
      : makeStrokePlan(d, matrix, Math.max(local.width, local.height), {
        fill: path.localName === "line"
          ? "none"
          : inherited(path, "fill") ?? "black",
        stroke: inherited(path, "stroke") ?? "none",
        strokeWidth: Number.parseFloat(inherited(path, "stroke-width") ?? "1"),
        fillRule: inherited(path, "fill-rule") === "evenodd"
          ? "evenodd"
          : "nonzero",
      }, resolution);
    items.push({
      plan,
      path,
      box,
      parentMatrix: rootInverse.multiply(parent.getScreenCTM()!),
    });
  }
  if (!items.length) return svg;

  const heights = items.map(({ box }) => box.height).filter((h) => h > 0).sort((
    a,
    b,
  ) => a - b);
  const tolerance = options.rowTolerance ??
    (heights[Math.floor(heights.length / 2)] ?? 1) / 2;
  const ordered = readingOrder(items, tolerance);
  const weights = ordered.map(({ plan, box }) =>
    mode === "wipe" ? 1 : Math.max(
      1,
      plan.kind === "wipe"
        ? box.width
        : plan.strokes.reduce((sum, stroke) => sum + stroke.length, 0),
    )
  );
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  // `speed` compresses the whole 1x timeline. `duration` keeps gap lengths
  // fixed and only stretches ink, matching the previous fit-to-slot behavior.
  const scale = options.duration === undefined ? 1 / speed : 1;
  const timedGap = gap * scale;
  const timedStrokeGap = strokeGap * scale;
  const internalGaps = ordered.map(({ plan }) =>
    Math.max(0, plan.strokes.length - 1) * timedStrokeGap
  );
  const pauseTime = (items.length - 1) * timedGap +
    internalGaps.reduce((sum, value) => sum + value, 0);
  const naturalInk = mode === "wipe" ? items.length * 0.12 : totalWeight / 100;
  const duration = options.duration ?? (naturalInk + pauseTime / scale) / speed;
  const inkTime = duration - pauseTime;
  if (inkTime <= 0) {
    throw new Error("duration must leave positive drawing time after gaps");
  }
  let cursor = startTime;

  const create = (name: string, attrs: Record<string, string | number>) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, String(value));
    }
    return node;
  };
  const ids = new Set(
    Array.from(root.querySelectorAll("[id]")).map((node) => node.id),
  );
  if (root.id) ids.add(root.id);
  const definitions = create("defs", { "data-drawing-defs": "true" });
  root.insertBefore(definitions, root.firstChild);

  ordered.forEach(({ path, box, parentMatrix, plan }, index) => {
    const begin = cursor;
    const pathDuration = index === ordered.length - 1
      ? startTime + duration - begin
      : inkTime * weights[index] / totalWeight + internalGaps[index];
    cursor += pathDuration + timedGap;
    let id = `${idPrefix}-mask-${index}`;
    while (ids.has(id)) id += "-";
    ids.add(id);
    // Leave room for stroke caps/joins. The mask is attached to a wrapper so
    // existing masks, clips, IDs and transforms on the original path survive.
    const strokeWidth =
      Number.parseFloat(inherited(path, "stroke-width") ?? "1") || 0;
    const matrix = rootInverse.multiply(path.getScreenCTM()!);
    const scale = Math.hypot(matrix.a, matrix.b, matrix.c, matrix.d);
    const miter =
      Number.parseFloat(inherited(path, "stroke-miterlimit") ?? "4") || 4;
    const padding = 1 + strokeWidth * Math.max(1, scale) * Math.max(1, miter);
    const expanded = {
      x: box.x - padding,
      y: box.y - padding,
      width: box.width + 2 * padding,
      height: box.height + 2 * padding,
    };
    const inverse = parentMatrix.inverse();
    const region = transformedBox(expanded, inverse);
    if (
      ![
        ...Object.values(region),
        inverse.a,
        inverse.b,
        inverse.c,
        inverse.d,
        inverse.e,
        inverse.f,
      ].every(Number.isFinite)
    ) {
      throw new Error("Cannot animate a path with a singular transform");
    }
    const mask = create("mask", {
      id,
      maskUnits: "userSpaceOnUse",
      maskContentUnits: "userSpaceOnUse",
      ...region,
      style: "mask-type:luminance",
    });
    const brushTransform =
      `matrix(${inverse.a} ${inverse.b} ${inverse.c} ${inverse.d} ${inverse.e} ${inverse.f})`;
    if (plan.kind === "wipe") {
      const brush = create("rect", {
        x: expanded.x,
        y: expanded.y,
        width: 0,
        height: expanded.height,
        transform: brushTransform,
        style: "fill:white;stroke:none;opacity:1;fill-opacity:1",
      });
      brush.appendChild(
        create("animate", {
          attributeName: "width",
          from: 0,
          to: expanded.width,
          begin: `${begin}s`,
          dur: `${pathDuration}s`,
          fill: "freeze",
          calcMode: "linear",
        }),
      );
      mask.appendChild(brush);
    } else {
      appendStrokeMasks(
        mask,
        plan,
        begin,
        pathDuration,
        timedStrokeGap,
        brushTransform,
        create,
      );
    }
    definitions.appendChild(mask);
    const wrapper = create("g", {
      mask: `url(#${id})`,
      "data-drawing-method": plan.kind,
      ...(plan.fallback ? { "data-drawing-fallback": plan.fallback } : {}),
      "data-drawing-index": index,
      "data-drawing-start": begin,
      "data-drawing-duration": pathDuration,
    });
    path.parentNode!.insertBefore(wrapper, path);
    wrapper.appendChild(path);
    // End on the exact original artwork, including subpixel rasterization edges
    // and sharp stroke joins that an approximate centerline brush may miss.
    wrapper.appendChild(
      create("set", {
        attributeName: "mask",
        to: "none",
        begin: `${begin + pathDuration}s`,
        fill: "freeze",
      }),
    );
  });
  root.setAttribute(MARKER, mode === "wipe" ? "wipe-v1" : "strokes-v1");
  root.setAttribute("data-drawing-start", String(startTime));
  root.setAttribute("data-drawing-duration", String(duration));
  return root.outerHTML;
}

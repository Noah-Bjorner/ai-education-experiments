// Keep this server utility's dependency pinned without changing the shared import map.
// deno-lint-ignore no-import-prefix
import { createSVGWindow } from "npm:svgdom@0.1.23";

import type { WhiteboardFigureContent } from "../schema.ts";
import { type Box, elementPath } from "./geometry.ts";
import { makeStrokePlan, type StrokePlan } from "./stroke-plan.ts";
import { appendStrokeMasks } from "./masks.ts";
import { prepareWriting } from "./text.ts";
import {
  type MarkMotion,
  markWeight,
  penLift,
  strokeMotion,
  timeAt,
} from "./motion.ts";
import {
  type DrawingBeat,
  FIGURE_ANIMATION_POLICIES,
  INSTANT_WEIGHT,
  planDrawingBeats,
} from "./policy.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const MARKER = "data-drawing-animation";
const DRAWABLE = "path, line, circle, ellipse, rect, polyline, polygon";

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
  /** Extra multiplier for writing (annotation glyphs and math). Default: 1. */
  textSpeed?: number;
  /** Extra multiplier for non-text marks/lines. Default: 1. */
  markSpeed?: number;
  /** Per-type replacements for the writing/mark defaults, including that figure's annotations. */
  figureSpeeds?: Partial<
    Record<WhiteboardFigureContent["type"], {
      textSpeed?: number;
      markSpeed?: number;
    }>
  >;
  /** Natural pen motion for graphics (default); linear retains the original timing. */
  markMotion?: MarkMotion;
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

/** Writing and graphical marks share masks, but have independent movement. */
function isWriting(path: Element): boolean {
  if (
    path.closest("[data-drawing-text], [data-mml-node]") ||
    path.hasAttribute("data-c")
  ) return true;
  const base = path.closest('[data-layer="base"]');
  return !!base?.closest(
    '[data-figure-type="math_expressions"]',
  );
}

type Work =
  | { kind: "instant"; hosts: Element[]; hold?: number }
  | {
    kind: "stroke";
    hosts: Element[];
    item: Item;
    pointReveals?: DrawingBeat["pointReveals"];
  };

type CreateSvg = (
  name: string,
  attrs: Record<string, string | number>,
) => Element;

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

function collectItems(
  scopes: Element[],
  rootInverse: DOMMatrix,
  mode: "strokes" | "wipe",
  resolution: number,
): Item[] {
  const items: Item[] = [];
  for (const scope of scopes) {
    for (
      const path of Array.from(
        scope.querySelectorAll<SVGGraphicsElement>(DRAWABLE),
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
      // Marker silhouettes retain their authored gesture. Recovering a skeleton
      // from their filled edges would introduce spurs and accidental retracing.
      const centerline = path.getAttribute("data-marker-centerline");
      const markerWidth = Number(path.getAttribute("data-marker-width"));
      const authoredMarker = centerline !== null && centerline.trim() !== "" &&
        Number.isFinite(markerWidth) && markerWidth > 0;
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
        : authoredMarker
        ? makeStrokePlan(
          centerline!,
          matrix,
          Math.max(local.width, local.height),
          {
            fill: "none",
            stroke: "black",
            strokeWidth: markerWidth,
            fillRule: "nonzero",
          },
          resolution,
        )
        : makeStrokePlan(d, matrix, Math.max(local.width, local.height), {
          fill: path.localName === "line"
            ? "none"
            : inherited(path, "fill") ?? "black",
          stroke: inherited(path, "stroke") ?? "none",
          strokeWidth: Number.parseFloat(
            inherited(path, "stroke-width") ?? "1",
          ),
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
  }
  return items;
}

function itemWeight(
  item: Item,
  mode: "strokes" | "wipe",
  natural: boolean,
): number {
  if (natural) {
    return item.plan.kind === "wipe"
      ? markWeight(item.box.width)
      : item.plan.strokes.reduce(
        (sum, stroke) => sum + markWeight(stroke.length),
        0,
      );
  }
  return mode === "wipe" ? 1 : Math.max(
    1,
    item.plan.kind === "wipe"
      ? item.box.width
      : item.plan.strokes.reduce((sum, stroke) => sum + stroke.length, 0),
  );
}

function scheduleBeats(
  beats: DrawingBeat[],
  rootInverse: DOMMatrix,
  mode: "strokes" | "wipe",
  resolution: number,
  tolerance: number | undefined,
): Work[] {
  const work: Work[] = [];
  for (const beat of beats) {
    if (beat.treatment === "instant") {
      work.push({ kind: "instant", hosts: beat.hosts, hold: beat.hold });
      continue;
    }
    const items = collectItems(beat.hosts, rootInverse, mode, resolution);
    if (!items.length) {
      work.push({ kind: "instant", hosts: beat.hosts });
      continue;
    }
    const heights = items.map(({ box }) => box.height).filter((h) => h > 0)
      .sort((a, b) => a - b);
    const rowTolerance = tolerance ??
      (heights[Math.floor(heights.length / 2)] ?? 1) / 2;
    const ordered = beat.pathOrder === "document"
      ? items
      : readingOrder(items, rowTolerance);
    for (const item of ordered) {
      work.push({
        kind: "stroke",
        hosts: beat.hosts,
        item,
        pointReveals: beat.pointReveals?.filter((r) => r.path === item.path),
      });
    }
  }
  return work;
}

function revealHosts(
  hosts: Element[],
  begin: number,
  revealed: Set<Element>,
  create: CreateSvg,
) {
  for (const host of hosts) {
    if (revealed.has(host)) continue;
    revealed.add(host);
    host.setAttribute("visibility", "hidden");
    const setter = create("set", {
      attributeName: "visibility",
      to: "visible",
      begin: `${begin}s`,
      fill: "freeze",
    });
    if (host.firstChild) host.insertBefore(setter, host.firstChild);
    else host.appendChild(setter);
  }
}

/**
 * Server-side SVG string -> standalone SVG with seekable SMIL mask animations.
 * Tagged whiteboard figures follow a teaching plan (charts appear, math/text
 * draw, annotations wait). Untagged SVGs keep geometry-only reading order.
 * Designed for trusted, static whiteboard SVGs with outlined text and SVG
 * transform attributes. Tagged annotation text uses bundled font outlines;
 * other live text, <use> and CSS geometry are not drawn. Not an SVG sanitizer.
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
    textSpeed = 1,
    markSpeed = 1,
    markMotion = "natural",
  } = options;
  if (markMotion !== "natural" && markMotion !== "linear") {
    throw new Error("Invalid mark motion");
  }
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
  for (const [name, value] of Object.entries({ textSpeed, markSpeed })) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be a finite number greater than 0`);
    }
  }
  for (const [type, overrides] of Object.entries(options.figureSpeeds ?? {})) {
    if (!Object.hasOwn(FIGURE_ANIMATION_POLICIES, type)) {
      throw new Error(`Unknown figure speed type: ${type}`);
    }
    if (
      !overrides || typeof overrides !== "object" || Array.isArray(overrides)
    ) {
      throw new Error(`figureSpeeds.${type} must be an object`);
    }
    for (const [name, value] of Object.entries(overrides)) {
      if (name !== "textSpeed" && name !== "markSpeed") {
        throw new Error(`Unknown figure speed setting: ${type}.${name}`);
      }
      if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
        throw new Error(
          `figureSpeeds.${type}.${name} must be a finite number greater than 0`,
        );
      }
    }
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

  const finishWriting = prepareWriting(root);
  const rootInverse = root.getScreenCTM()!.inverse();
  const beats = planDrawingBeats(root);
  let work: Work[];
  if (beats) {
    work = scheduleBeats(
      beats,
      rootInverse,
      mode,
      resolution,
      options.rowTolerance,
    );
  } else {
    const items = collectItems([root], rootInverse, mode, resolution);
    if (!items.length) return svg;
    const heights = items.map(({ box }) => box.height).filter((h) => h > 0)
      .sort((a, b) => a - b);
    const tolerance = options.rowTolerance ??
      (heights[Math.floor(heights.length / 2)] ?? 1) / 2;
    work = readingOrder(items, tolerance).map((item) => ({
      kind: "stroke" as const,
      hosts: [],
      item,
    }));
  }
  if (!work.length) return svg;

  const writing = work.map((entry) =>
    entry.kind === "stroke" && isWriting(entry.item.path)
  );
  const natural = work.map((entry, i) =>
    entry.kind === "stroke" && !writing[i] && mode === "strokes" &&
    markMotion === "natural"
  );
  const rates = work.map((entry, i) => {
    if (entry.kind === "instant") return 1;
    const type = entry.item.path.closest("[data-figure-type]")?.getAttribute(
      "data-figure-type",
    ) as WhiteboardFigureContent["type"] | undefined;
    const overrides = type ? options.figureSpeeds?.[type] : undefined;
    return writing[i]
      ? overrides?.textSpeed ?? textSpeed
      : overrides?.markSpeed ?? markSpeed;
  });
  const weights = work.map((entry, index) =>
    entry.kind === "instant"
      ? (entry.hold === 0 ? 0 : mode === "wipe" ? 1 : INSTANT_WEIGHT)
      : itemWeight(entry.item, mode, natural[index]) / rates[index]
  );
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  // `speed` compresses the whole 1x timeline. `duration` keeps gap lengths
  // fixed and only stretches ink, matching the previous fit-to-slot behavior.
  const scale = options.duration === undefined ? 1 / speed : 1;
  const timedGap = gap * scale;
  const timedStrokeGap = strokeGap * scale;
  const strokePauses = work.map((entry, index) => {
    if (entry.kind === "instant") return [];
    const strokes = entry.item.plan.strokes;
    return strokes.slice(1).map((stroke, i) =>
      (natural[index]
        ? penLift(timedStrokeGap, strokes[i].points.at(-1), stroke.points[0])
        : timedStrokeGap) / rates[index]
    );
  });
  const internalGaps = strokePauses.map((pauses) =>
    pauses.reduce((sum, pause) => sum + pause, 0)
  );
  const gaps = work.map((entry, i) => {
    const next = work[i + 1];
    if (!next) return 0;
    if (
      (entry.kind === "instant" && entry.hold === 0) ||
      (next.kind === "instant" && next.hold === 0)
    ) return 0;
    if (
      entry.kind !== "stroke" || next.kind !== "stroke" || !natural[i] ||
      !natural[i + 1]
    ) return timedGap;
    return penLift(
      timedGap,
      entry.item.plan.strokes.at(-1)?.points.at(-1),
      next.item.plan.strokes[0]?.points[0],
    ) / rates[i];
  });
  const pauseTime = gaps.reduce((sum, pause) => sum + pause, 0) +
    internalGaps.reduce((sum, value) => sum + value, 0);
  const naturalInk = mode === "wipe" ? totalWeight * 0.12 : totalWeight / 100;
  const duration = options.duration ?? (naturalInk + pauseTime / scale) / speed;
  const inkTime = duration - pauseTime;
  if (inkTime <= 0) {
    throw new Error("duration must leave positive drawing time after gaps");
  }
  let cursor = startTime;

  const create: CreateSvg = (name, attrs) => {
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
  const revealed = new Set<Element>();

  work.forEach((entry, index) => {
    const begin = cursor;
    const pathDuration = entry.kind === "instant" && entry.hold === 0
      ? 0
      : index === work.length - 1
      ? startTime + duration - begin
      : inkTime * weights[index] / totalWeight + internalGaps[index];
    cursor += pathDuration + gaps[index];
    if (entry.kind === "instant") {
      revealHosts(entry.hosts, begin, revealed, create);
      entry.hosts.forEach((host, hostIndex) => {
        if (hostIndex > 0) return;
        host.setAttribute("data-drawing-method", "instant");
        host.setAttribute("data-drawing-index", String(index));
        host.setAttribute("data-drawing-start", String(begin));
        host.setAttribute("data-drawing-duration", String(pathDuration));
      });
      return;
    }
    revealHosts(entry.hosts, begin, revealed, create);
    const { path, box, parentMatrix, plan } = entry.item;
    for (const reveal of entry.pointReveals ?? []) {
      const progress = plan.kind === "wipe"
        ? 1
        : natural[index]
        ? timeAt(strokeMotion(plan.strokes[0]), reveal.progress)
        : reveal.progress;
      const at = begin + pathDuration * progress;
      revealHosts([reveal.host], at, revealed, create);
      reveal.host.setAttribute("data-drawing-start", String(at));
      reveal.host.setAttribute("data-drawing-duration", "0");
      reveal.host.setAttribute("data-drawing-method", "instant");
    }

    let id = `${idPrefix}-mask-${index}`;
    while (ids.has(id)) id += "-";
    ids.add(id);
    // Leave room for stroke caps/joins. The mask is attached to a wrapper so
    // existing masks, clips, IDs and transforms on the original path survive.
    const strokeWidth =
      Number.parseFloat(inherited(path, "stroke-width") ?? "1") || 0;
    const matrix = rootInverse.multiply(path.getScreenCTM()!);
    const matrixScale = Math.hypot(matrix.a, matrix.b, matrix.c, matrix.d);
    const miter =
      Number.parseFloat(inherited(path, "stroke-miterlimit") ?? "4") || 4;
    const padding = 1 +
      strokeWidth * Math.max(1, matrixScale) * Math.max(1, miter);
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
          ...(natural[index]
            ? { calcMode: "spline", keyTimes: "0;1", keySplines: "0.3 0 0.3 1" }
            : {}),
        }),
      );
      mask.appendChild(brush);
    } else {
      appendStrokeMasks(
        mask,
        plan,
        begin,
        pathDuration,
        timedStrokeGap / rates[index],
        brushTransform,
        create,
        natural[index],
        strokePauses[index],
      );
    }
    definitions.appendChild(mask);
    const wrapper = create("g", {
      mask: `url(#${id})`,
      "data-drawing-method": plan.kind,
      "data-drawing-motion": natural[index] ? "natural" : "linear",
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
  finishWriting();
  root.setAttribute(MARKER, mode === "wipe" ? "wipe-v1" : "strokes-v1");
  root.setAttribute("data-drawing-start", String(startTime));
  root.setAttribute("data-drawing-duration", String(duration));
  return root.outerHTML;
}

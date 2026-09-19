import type { AnnotationType } from "../figures/shared.ts";
import type { WhiteboardFigureContent } from "../schema.ts";

type Treatment = "instant" | "stroke";
type PathOrder = "reading" | "document";

type PartStep = {
  parts: readonly string[];
  treatment: Treatment;
  pathOrder?: PathOrder;
  sequence?: "connected-points";
  /** Reveal the selected parts together when their count exceeds this limit. */
  maxAnimatedParts?: number;
};

type DrawingPolicy = {
  attachPoints?: boolean;
  base: Treatment;
  pathOrder?: PathOrder;
  /** Optional recipe, activated only when this semantic part is present. */
  split?: { whenPart: string; steps: readonly PartStep[] };
};

/** Renderers name parts; only this table decides their treatment and order. */
export const FIGURE_ANIMATION_POLICIES = {
  xy_chart: {
    base: "instant",
    split: {
      whenPart: "series",
      steps: [
        { parts: ["framework"], treatment: "instant" },
        {
          parts: ["series"],
          treatment: "stroke",
          pathOrder: "document",
          sequence: "connected-points",
          maxAnimatedParts: 3,
        },
      ],
    },
  },
  pie_chart: { base: "instant" },
  distribution: { base: "instant" },
  coordinate_plot: { base: "instant" },
  math_expressions: { base: "stroke" },
  geometry: {
    attachPoints: true,
    base: "stroke",
    split: {
      whenPart: "points",
      steps: [
        { parts: ["construction"], treatment: "stroke", pathOrder: "document" },
        { parts: ["points"], treatment: "stroke", pathOrder: "document" },
        { parts: ["labels"], treatment: "stroke", pathOrder: "document" },
        { parts: ["markings"], treatment: "stroke", pathOrder: "document" },
      ],
    },
  },
  text: {
    base: "stroke",
    split: {
      whenPart: "writing",
      steps: [
        { parts: ["writing"], treatment: "stroke", pathOrder: "document" },
        { parts: ["box"], treatment: "stroke", pathOrder: "document" },
      ],
    },
  },
} satisfies Record<WhiteboardFigureContent["type"], DrawingPolicy>;

const indicatorThenText: DrawingPolicy = {
  base: "stroke",
  split: {
    whenPart: "indicator",
    steps: [
      { parts: ["indicator"], treatment: "stroke", pathOrder: "document" },
      { parts: ["text"], treatment: "stroke", pathOrder: "document" },
    ],
  },
};

/** Shared teaching marks have their own recipes, independent of figure type. */
export const ANNOTATION_ANIMATION_POLICIES: Record<
  AnnotationType,
  DrawingPolicy
> = {
  highlight: { base: "stroke" },
  callout: indicatorThenText,
  group: indicatorThenText,
  number: { base: "stroke", pathOrder: "document" },
  strikeout: { base: "stroke" },
};

/** Board units at the natural 100 units/second pace (~0.2s). */
export const INSTANT_WEIGHT = 20;

export type DrawingBeat = {
  pointReveals?: { host: Element; path: Element; progress: number }[];
  hosts: Element[];
  treatment: Treatment;
  /** Reading order is the default; connected chart segments use data order. */
  pathOrder?: PathOrder;
  /** Instant point reveals consume no drawing time or pause. */
  hold?: 0;
};

function connectedPoints(host: Element): DrawingBeat[] {
  const points = Array.from(host.querySelectorAll("[data-series-point]"));
  if (!points.length) {
    return [{ hosts: [host], treatment: "stroke", pathOrder: "document" }];
  }
  const segments = Array.from(host.querySelectorAll("[data-series-segment]"));
  const result: DrawingBeat[] = [];
  const used = new Set<Element>();
  const ids = new Set<string>();
  points.forEach((point, index) => {
    const id = point.getAttribute("data-series-point")!;
    if (ids.has(id)) throw new Error("Duplicate series point identity");
    ids.add(id);
    const incoming = segments.filter((s) =>
      s.getAttribute("data-series-segment") === id
    );
    if (incoming.length !== (index === 0 ? 0 : 1)) {
      throw new Error(
        "Series points must have one incoming segment after the first point",
      );
    }
    if (incoming.length) {
      used.add(incoming[0]);
      result.push({
        hosts: incoming,
        treatment: "stroke",
        pathOrder: "document",
      });
    }
    result.push({ hosts: [point], treatment: "instant", hold: 0 });
  });
  if (used.size !== segments.length) {
    throw new Error("Unmatched series segment");
  }
  for (const node of Array.from(host.querySelectorAll(PAINT))) {
    if (node.closest(NON_PAINT) || node.closest('[data-drawing="static"]')) {
      continue;
    }
    if (
      !result.some((beat) => beat.hosts.some((part) => part.contains(node)))
    ) {
      throw new Error("Connected series parts must cover all artwork");
    }
  }
  return result;
}

const PAINT =
  "path, line, circle, ellipse, rect, polyline, polygon, text, use, image, foreignObject";
const NON_PAINT = "defs, mask, clipPath, pattern, marker, symbol";

function planPartBeats(
  base: Element,
  policy: DrawingPolicy,
  attribute = "data-figure-part",
): DrawingBeat[] {
  const parts = Array.from(base.querySelectorAll(`[${attribute}]`))
    .filter((part) => !part.closest('[data-drawing="static"]'));
  const split = policy.split;
  if (
    !split ||
    !parts.some((part) => part.getAttribute(attribute) === split.whenPart)
  ) {
    return [{
      hosts: [base],
      treatment: policy.base,
      pathOrder: policy.pathOrder,
    }];
  }

  const beats = split.steps.map((step): DrawingBeat => ({
    hosts: parts.filter((part) =>
      step.parts.includes(part.getAttribute(attribute)!)
    ),
    treatment: step.treatment,
    pathOrder: step.pathOrder,
  })).filter((beat) => beat.hosts.length > 0);
  const hosts = beats.flatMap((beat) => beat.hosts);
  if (hosts.some((host) => host.localName !== "g")) {
    throw new Error("Figure animation parts must be SVG groups");
  }
  // Splitting replaces the parent beat. Catch incomplete/overlapping renderer
  // tags here rather than leaving artwork visible early or drawing it twice.
  if (
    hosts.some((host, index) =>
      hosts.some((other, otherIndex) =>
        index !== otherIndex && other.contains(host)
      )
    )
  ) throw new Error("Figure animation parts must not overlap");
  for (const node of Array.from(base.querySelectorAll(PAINT))) {
    if (node.closest(NON_PAINT) || node.closest('[data-drawing="static"]')) {
      continue;
    }
    if (!hosts.some((host) => host.contains(node))) {
      throw new Error("Figure animation parts must cover the entire base");
    }
  }
  return beats.flatMap((beat) => {
    const step = split.steps.find((step) =>
      beat.hosts.some((host) =>
        step.parts.includes(host.getAttribute(attribute)!)
      )
    );
    if (
      step?.maxAnimatedParts !== undefined &&
      beat.hosts.length > step.maxAnimatedParts
    ) return [{ hosts: beat.hosts, treatment: "instant" }];
    return step?.sequence === "connected-points"
      ? beat.hosts.flatMap(connectedPoints)
      : [beat];
  });
}

function annotationOrder(node: Element): [number, number] {
  return [
    Number(node.getAttribute("data-annotation-index") ?? 1e9),
    Number(node.getAttribute("data-annotation-sequence") ?? 0),
  ];
}

/**
 * Teaching beats from tagged whiteboard markup. Untagged SVGs return null so
 * the drawing pass keeps its original geometry-only reading order.
 */
export function planDrawingBeats(root: Element): DrawingBeat[] | null {
  const figures = Array.from(
    root.querySelectorAll("[data-figure-id][data-figure-type]"),
  );
  if (!figures.length) return null;
  const beats: DrawingBeat[] = [];
  for (const figure of figures) {
    const type = figure.getAttribute("data-figure-type") ?? "";
    const base = figure.querySelector("[data-layer='base']") ?? figure;
    const policy =
      (FIGURE_ANIMATION_POLICIES as Record<string, DrawingPolicy>)[type] ??
        { base: "stroke" };
    const baseBeats = planPartBeats(base, policy);
    if (policy.attachPoints) {
      const points = new Map(
        Array.from(base.querySelectorAll("[data-geometry-point]")).map(
          (p) => [p.getAttribute("data-geometry-point")!, p],
        ),
      );
      const claimed = new Set<Element>();
      for (const beat of baseBeats) {
        for (const host of beat.hosts) {
          for (
            const path of Array.from(
              host.querySelectorAll("[data-geometry-points]"),
            )
          ) {
            const hits: { id: string; progress: number }[] = JSON.parse(
              path.getAttribute("data-geometry-points")!,
            );
            for (const hit of hits) {
              const point = points.get(hit.id);
              if (!point || claimed.has(point)) continue;
              claimed.add(point);
              (beat.pointReveals ??= []).push({
                host: point,
                path,
                progress: hit.progress,
              });
            }
          }
        }
      }
      for (const beat of baseBeats) {
        beat.hosts = beat.hosts.filter((h) => !claimed.has(h));
      }
    }
    beats.push(...baseBeats.filter((b) => b.hosts.length));
    const annotations = Array.from(
      figure.querySelectorAll("[data-annotation-type]"),
    ).filter((node) => !node.parentElement?.closest("[data-annotation-type]"))
      .sort((a, b) => {
        const [ai, as] = annotationOrder(a);
        const [bi, bs] = annotationOrder(b);
        return ai - bi || as - bs;
      });
    for (const host of annotations) {
      const annotationType = host.getAttribute(
        "data-annotation-type",
      ) as AnnotationType;
      const annotationBeats = planPartBeats(
        host,
        ANNOTATION_ANIMATION_POLICIES[annotationType] ?? { base: "stroke" },
        "data-annotation-part",
      );
      beats.push(...annotationBeats);
    }
  }
  return beats;
}

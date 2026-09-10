import { escapeXml } from "./svg.ts";
import {
  type Bounds,
  type Drawing,
  type Point,
  unionBounds,
} from "./bounds.ts";
import { GRAPH_FONT_STYLE, graphTextBounds, measureGraphText } from "./font.ts";
import { renderHandwritten } from "./handwritten.ts";
import type { PendingCallout } from "./annotations.ts";
import type {
  RenderObstacle,
  RenderTarget,
  TargetedDrawing,
} from "./targets.ts";
import { COLORS } from "./theme.ts";
import {
  center,
  clearRoute,
  distance,
  inflate,
  obstacleHitsBox,
  port,
  routeConnector,
  routeScore,
} from "./placement.ts";

const FONT_SIZE = 15, LINE_HEIGHT = 21, LABEL_WIDTH = 190;
const directions = [
  { side: "right", x: 1, y: 0 },
  { side: "bottom-right", x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { side: "bottom", x: 0, y: 1 },
  { side: "bottom-left", x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { side: "left", x: -1, y: 0 },
  { side: "top-left", x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { side: "top", x: 0, y: -1 },
  { side: "top-right", x: Math.SQRT1_2, y: -Math.SQRT1_2 },
];

export type CalloutPlacement = {
  childId: string;
  annotationIndex: number;
  type: "arrow" | "line" | "bracket";
  targetIds: string[];
  labelBounds: Bounds | null;
  paths: Point[][];
  bounds: Bounds;
  side: string;
  usedGutter: boolean;
};
type Label = { lines: string[]; bounds: Bounds };
type Candidate = {
  label: Bounds | null;
  side: string;
  gutter: boolean;
  path?: Point[];
  score: number;
};
type Job = {
  item: PendingCallout;
  targets: RenderTarget[];
  bounds: Bounds;
  label: Label | null;
  preferred: Point;
  anchor: Point;
  candidates: Candidate[];
};

/** Wrap without truncation, including explicit newlines and overlong words. */
function measureLabel(content: string): Label {
  const lines: string[] = [];
  for (const paragraph of content.normalize("NFC").split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const joined = line ? `${line} ${word}` : word;
      if (measureGraphText(joined, FONT_SIZE) <= LABEL_WIDTH) {
        line = joined;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      for (const char of word) {
        if (line && measureGraphText(line + char, FONT_SIZE) > LABEL_WIDTH) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    lines.push(line);
  }
  const bounds = unionBounds(
    lines.map((line, i) =>
      graphTextBounds(line, FONT_SIZE, 0, i * LINE_HEIGHT)
    ),
  );
  if (!bounds) throw new Error("Callout text must contain visible characters.");
  return { lines, bounds };
}

function labelDrawing(label: Label, box: Bounds): Drawing {
  const x = box.x - label.bounds.x, y = box.y - label.bounds.y;
  return {
    markup: `<g data-callout-label="true">${
      label.lines.map((line, i) =>
        `<text x="${x}" y="${
          y + i * LINE_HEIGHT
        }" font-size="${FONT_SIZE}" fill="${COLORS.ink}">${
          escapeXml(line)
        }</text>`
      ).join("\n")
    }</g>`,
    bounds: box,
  };
}

function directionPenalty(job: Job, box: Bounds) {
  const c = center(box), dx = c.x - job.anchor.x, dy = c.y - job.anchor.y;
  const d = Math.hypot(dx, dy) || 1;
  return (1 - (dx * job.preferred.x + dy * job.preferred.y) / d) * 50;
}

function nearbyCandidates(job: Job): Candidate[] {
  const { width: w, height: h } = job.label!.bounds;
  const result: Candidate[] = [];
  for (const gap of [24, 48, 80, 120]) {
    for (const dir of directions) {
      const reach = job.targets[0].anchor
        ? 0
        : Math.abs(dir.x) * job.bounds.width / 2 +
          Math.abs(dir.y) * job.bounds.height / 2;
      const offset = reach + gap + Math.abs(dir.x) * w / 2 +
        Math.abs(dir.y) * h / 2;
      const label = {
        x: job.anchor.x + dir.x * offset - w / 2,
        y: job.anchor.y + dir.y * offset - h / 2,
        width: w,
        height: h,
      };
      result.push({
        label,
        side: dir.side,
        gutter: false,
        score: directionPenalty(job, label),
      });
    }
  }
  return result;
}

function gutterCandidates(
  job: Job,
  occupied: Bounds,
  count: number,
): Candidate[] {
  const { width: w, height: h } = job.label!.bounds;
  const result: Candidate[] = [];
  for (let step = 0; step <= count + 3; step++) {
    for (
      const sign of step ? [-1, 1] : [1]
    ) {
      const dx = step * sign * (w + 24), dy = step * sign * (h + 24);
      for (
        const [side, x, y] of [
          [
            "right",
            occupied.x + occupied.width + 32,
            job.anchor.y - h / 2 + dy,
          ],
          ["left", occupied.x - w - 32, job.anchor.y - h / 2 + dy],
          ["top", job.anchor.x - w / 2 + dx, occupied.y - h - 32],
          [
            "bottom",
            job.anchor.x - w / 2 + dx,
            occupied.y + occupied.height + 32,
          ],
        ] as const
      ) {
        const label = { x, y, width: w, height: h };
        result.push({
          label,
          side,
          gutter: true,
          score: 35 + directionPenalty(job, label),
        });
      }
    }
  }
  return result;
}

function bracketCandidates(job: Job, occupied: Bounds): Candidate[] {
  const b = job.bounds, result: Candidate[] = [];
  const w = job.label?.bounds.width ?? 0, h = job.label?.bounds.height ?? 0;
  const vertical = b.height >= b.width ||
    (job.targets.length > 1 &&
      Math.abs(
          center(job.targets[0].bounds).y -
            center(job.targets.at(-1)!.bounds).y,
        ) >
        Math.abs(
          center(job.targets[0].bounds).x -
            center(job.targets.at(-1)!.bounds).x,
        ));
  for (const side of ["right", "left", "bottom", "top"]) {
    const outerGap = side === "right"
      ? occupied.x + occupied.width - b.x - b.width + 20
      : side === "left"
      ? b.x - occupied.x + 20
      : side === "bottom"
      ? occupied.y + occupied.height - b.y - b.height + 20
      : b.y - occupied.y + 20;
    for (const gap of [...new Set([14, 28, 48, 80, Math.max(20, outerGap)])]) {
      let path: Point[], label: Bounds;
      if (side === "right" || side === "left") {
        const sign = side === "right" ? 1 : -1,
          x = side === "right" ? b.x + b.width + gap : b.x - gap;
        path = [{ x: x - sign * 8, y: b.y - 4 }, { x, y: b.y - 4 }, {
          x,
          y: b.y + b.height + 4,
        }, { x: x - sign * 8, y: b.y + b.height + 4 }];
        label = {
          x: side === "right" ? x + 14 : x - w - 14,
          y: b.y + b.height / 2 - h / 2,
          width: w,
          height: h,
        };
      } else {
        const sign = side === "bottom" ? 1 : -1,
          y = side === "bottom" ? b.y + b.height + gap : b.y - gap;
        path = [{ x: b.x - 4, y: y - sign * 8 }, { x: b.x - 4, y }, {
          x: b.x + b.width + 4,
          y,
        }, { x: b.x + b.width + 4, y: y - sign * 8 }];
        label = {
          x: b.x + b.width / 2 - w / 2,
          y: side === "bottom" ? y + 14 : y - h - 14,
          width: w,
          height: h,
        };
      }
      result.push({
        label: job.label ? label : null,
        side,
        path,
        gutter: gap === outerGap,
        score: gap * 2 +
          (((side === "left" || side === "right") === vertical) ? 0 : 250) +
          (side === "left" ? 8 : 0),
      });
    }
  }
  return result;
}

function arrowHead(path: Point[]): Point[][] {
  const end = path.at(-1)!, prev = path.at(-2)!;
  const length = distance(prev, end) || 1,
    dx = (end.x - prev.x) / length,
    dy = (end.y - prev.y) / length;
  return [[{ x: end.x - dx * 9 - dy * 4, y: end.y - dy * 9 + dx * 4 }, end, {
    x: end.x - dx * 9 + dy * 4,
    y: end.y - dy * 9 - dx * 4,
  }]];
}

/** Measure all messages, place the most constrained first, and reserve each result. */
export function renderCallouts(
  pending: PendingCallout[],
  scene: TargetedDrawing,
  emphasisObstacles: RenderObstacle[],
  options: { id: string; roughness?: number; seed?: number },
): {
  drawing: Drawing;
  placements: CalloutPlacement[];
  obstacles: RenderObstacle[];
} {
  const obstacles = [...scene.obstacles, ...emphasisObstacles];
  const parts: Drawing[] = [], placements: CalloutPlacement[] = [];
  const roughness = Math.min(options.roughness ?? 1.5, 0.65);
  const clearance = 6 + roughness * 2;
  const occupiedBounds = () =>
    unionBounds([scene.bounds, ...obstacles.map((o) => o.bounds)])!;
  const jobs = pending.map((item): Job => {
    const targets = item.annotation.targetIds.map((id) => {
      const target = scene.targets.get(id);
      if (!target) throw new Error(`Unknown callout target '${id}'.`);
      return target;
    });
    const bounds = unionBounds(targets.map((t) => t.bounds))!;
    const anchor = targets[0].anchor?.point ?? center(bounds),
      f = center(scene.focusBounds);
    const direction = targets[0].anchor?.direction ??
      {
        x: (anchor.x - f.x) / scene.focusBounds.width,
        y: (anchor.y - f.y) / scene.focusBounds.height,
      };
    const length = Math.hypot(direction.x, direction.y);
    const preferred = length
      ? { x: direction.x / length, y: direction.y / length }
      : { x: 0, y: -1 };
    const job: Job = {
      item,
      targets,
      bounds,
      anchor,
      preferred,
      label: item.annotation.content === null
        ? null
        : measureLabel(item.annotation.content),
      candidates: [],
    };
    job.candidates = item.annotation.type === "bracket"
      ? bracketCandidates(job, occupiedBounds())
      : nearbyCandidates(job);
    return job;
  });
  const freeCount = (job: Job) =>
    job.candidates.filter((c) =>
      (!c.label ||
        obstacles.every((o) => !obstacleHitsBox(o, c.label!, clearance))) &&
      (!c.path || clearRoute(c.path, obstacles, clearance))
    ).length;
  jobs.sort((a, b) =>
    freeCount(a) - freeCount(b) ||
    (b.label ? b.label.bounds.width * b.label.bounds.height : 0) -
      (a.label ? a.label.bounds.width * a.label.bounds.height : 0) ||
    a.item.annotationIndex - b.item.annotationIndex
  );

  for (const job of jobs) {
    const type = job.item.annotation.type as CalloutPlacement["type"];
    const ownIds = new Set(job.item.annotation.targetIds);
    const hard = obstacles.filter((o) => {
      if (o.ownerId && ownIds.has(o.ownerId)) return false;
      // A percentage inside a pie needs a route into its own filled region.
      // Other text and data strokes remain barriers; hatching is not an obstacle.
      if (
        o.kind === "area" &&
        job.targets.some((t) => !t.anchor && obstacleHitsBox(o, t.bounds))
      ) return false;
      return true;
    });
    const soft: RenderObstacle[] = [];
    let selected: (Candidate & { paths: Point[][] }) | null = null;
    const select = (candidates: Candidate[], detailed: boolean) => {
      const free = candidates.filter((c) =>
        !c.label ||
        obstacles.every((o) => !obstacleHitsBox(o, c.label!, clearance))
      )
        .sort((a, b) =>
          (a.score + (a.label ? distance(center(a.label), job.anchor) : 0)) -
          (b.score + (b.label ? distance(center(b.label), job.anchor) : 0))
        );
      for (const candidate of detailed ? free.slice(0, 8) : free) {
        let paths: Point[][] | undefined;
        let endpointPenalty = 0;
        if (type === "bracket") {
          if (!clearRoute(candidate.path!, obstacles, clearance)) continue;
          paths = [candidate.path!];
        } else {
          const label = candidate.label!;
          const target = job.targets[0];
          // End at the outside of existing emphasis on this target when present.
          const emphasized = unionBounds([
            target.bounds,
            ...emphasisObstacles.filter((o) =>
              o.ownerId === job.item.annotation.targetIds[0]
            ).map((o) => o.bounds),
          ])!;
          const barriers = [...hard, { kind: "text" as const, bounds: label }];
          // A marker at an axis intersection may need more room for the tip.
          // Prefer the closest endpoint, then try a slightly larger stand-off.
          for (const gap of target.anchor ? [9] : [9, 18, 28]) {
            const end = target.anchor
              ? {
                x: target.anchor.point.x + target.anchor.direction.x * gap,
                y: target.anchor.point.y + target.anchor.direction.y * gap,
              }
              : port(emphasized, center(label), gap);
            // Exit the padded rectangle, not a fixed distance along a diagonal:
            // a diagonal distance can still leave the start inside its padding.
            const start = port(inflate(label, clearance + 3), end, 1);
            const aim = target.anchor?.point ??
              port(target.bounds, center(label), 0);
            // A detached tip must not appear to point at an intervening tick or
            // label. Data strokes incident on the target may meet it naturally.
            const gapBarriers = barriers.filter((o) =>
              o.kind !== "stroke" && o.kind !== "area"
            );
            if (!clearRoute([end, aim], gapBarriers, 1.5)) continue;
            let route = routeConnector(
              start,
              end,
              barriers,
              soft,
              clearance,
              detailed,
            );
            if (!route || route.length < 2) continue;
            const toward = { x: aim.x - end.x, y: aim.y - end.y };
            const incoming = {
              x: end.x - route.at(-2)!.x,
              y: end.y - route.at(-2)!.y,
            };
            const alignment = (toward.x * incoming.x + toward.y * incoming.y) /
              (Math.hypot(toward.x, toward.y) *
                  Math.hypot(incoming.x, incoming.y) || 1);
            if (alignment < 0.95) {
              const length = Math.hypot(toward.x, toward.y) || 1;
              const approach = {
                x: end.x - toward.x / length * 20,
                y: end.y - toward.y / length * 20,
              };
              if (!clearRoute([approach, end], barriers, clearance)) continue;
              const leading = routeConnector(
                start,
                approach,
                barriers,
                soft,
                clearance,
                detailed,
              );
              if (!leading) continue;
              route = [...leading, end];
            }
            const proposal = [
              route,
              ...(type === "arrow" ? arrowHead(route) : []),
            ];
            if (
              !proposal.every((p) => clearRoute(p, barriers, 2 + roughness))
            ) continue;
            paths = proposal;
            endpointPenalty = (gap - 9) * 3;
            break;
          }
        }
        if (!paths) continue;
        const score = candidate.score + endpointPenalty +
          (type === "bracket" ? 0 : routeScore(paths[0], soft, clearance));
        if (!selected || score < selected.score) {
          selected = { ...candidate, score, paths };
        }
      }
    };
    const nearby = type === "bracket"
      ? bracketCandidates(job, occupiedBounds())
      : job.candidates;
    select(nearby, false);
    if (!selected) select(nearby, true);
    if (type !== "bracket") {
      const gutters = gutterCandidates(job, occupiedBounds(), jobs.length);
      select(gutters, false);
      if (!selected) select(gutters, true);
    }
    if (!selected) {
      throw new Error(
        `Could not place ${type} annotation ${job.item.annotationIndex} in '${job.item.childId}' without overlapping content. Increase the child allocation or simplify the annotations.`,
      );
    }
    // Assignment happens in the local candidate-search closure.
    const chosen = selected as Candidate & { paths: Point[][] };
    const id = `${options.id}-annotation-${job.item.annotationIndex}`;
    const strokes: Drawing[] = [];
    let sequence = 0;
    for (const path of chosen.paths) {
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        const drawing = renderHandwritten({
          type: "line",
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
        }, {
          id: `${id}-stroke-${sequence}`,
          roughness,
          seed: (options.seed ?? 10) + job.item.annotationIndex * 31 +
            sequence++,
          stroke: COLORS.ink,
          strokeWidth: 1.6,
        });
        strokes.push(drawing);
        obstacles.push({
          bounds: drawing.bounds!,
          kind: "annotation",
          segment: { a, b },
        });
      }
    }
    if (job.label && chosen.label) {
      strokes.push(labelDrawing(job.label, chosen.label));
      obstacles.push({ bounds: chosen.label, kind: "text" });
    }
    const bounds = unionBounds(strokes.map((s) => s.bounds))!;
    parts.push({
      markup: `<g id="${id}" data-annotation-type="${type}" data-target-ids="${
        escapeXml(job.item.annotation.targetIds.join(" "))
      }">${strokes.map((s) => s.markup).join("\n")}</g>`,
      bounds,
    });
    placements.push({
      childId: job.item.childId,
      annotationIndex: job.item.annotationIndex,
      type,
      targetIds: [...job.item.annotation.targetIds],
      labelBounds: chosen.label,
      paths: chosen.paths,
      bounds,
      side: chosen.side,
      usedGutter: chosen.gutter,
    });
  }
  return {
    drawing: {
      markup: parts.length
        ? `<g data-layer="callouts" style="${GRAPH_FONT_STYLE}">${
          parts.map((p) => p.markup).join("\n")
        }</g>`
        : "",
      bounds: unionBounds(parts.map((p) => p.bounds)),
    },
    placements,
    obstacles,
  };
}

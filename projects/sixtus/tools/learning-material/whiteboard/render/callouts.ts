import { escapeXml } from "./svg.ts";
import {
  type Bounds,
  type Drawing,
  type Point,
  unionBounds,
} from "./bounds.ts";
import { GRAPH_FONT_STYLE } from "./font.ts";
import { textBlock } from "./text-block.ts";
import { renderHandwritten } from "./handwritten.ts";
import type {
  AnnotationDiagnostic,
  AnnotationOptions,
  ResolvedCallout,
} from "./annotation-types.ts";
import { ANNOTATION_LAYOUT as LAYOUT } from "./annotation-layout.ts";
import type {
  RenderObstacle,
  RenderTarget,
  TargetedDrawing,
} from "./targets.ts";
import { COLORS, HAND_DRAWING, LINE_HEIGHT, TYPE_SCALE } from "./theme.ts";
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
  figureId: string;
  annotationIndex: number;
  type: "arrow" | "line" | "bracket";
  targetIds: string[];
  labelBounds: Bounds | null;
  paths: Point[][];
  bounds: Bounds;
  side: string;
  usedGutter: boolean;
};
type Label = Drawing & { bounds: Bounds };
type Candidate = {
  label: Bounds | null;
  side: string;
  gutter: boolean;
  path?: Point[];
  score: number;
};
type Job = {
  request: ResolvedCallout;
  targets: RenderTarget[];
  bounds: Bounds;
  label: Label | null;
  preferred: Point;
  anchor: Point;
  candidates: Candidate[];
};

/** Callouts share the same wrapping and glyph measurement as other text. */
function measureLabel(content: string): Label {
  const block = textBlock(
    content,
    LAYOUT.labelWidth,
    TYPE_SCALE.annotation,
    LINE_HEIGHT.annotation,
    0,
    0,
    "currentColor",
  );
  return { ...block, bounds: block.bounds! };
}

function labelDrawing(label: Label, box: Bounds, color: string): Drawing {
  return {
    markup: `<g data-callout-label="true" data-annotation-part="text" color="${
      escapeXml(color)
    }" transform="translate(${box.x - label.bounds.x} ${
      box.y - label.bounds.y
    })">${label.markup}</g>`,
    bounds: box,
  };
}

function directionPenalty(job: Job, box: Bounds) {
  const c = center(box), dx = c.x - job.anchor.x, dy = c.y - job.anchor.y;
  const d = Math.hypot(dx, dy) || 1;
  return (1 - (dx * job.preferred.x + dy * job.preferred.y) / d) *
    LAYOUT.directionPenalty;
}

function nearbyCandidates(job: Job): Candidate[] {
  const { width: w, height: h } = job.label!.bounds;
  const result: Candidate[] = [];
  for (
    const gap of LAYOUT.nearbyGaps
  ) {
    for (const dir of directions) {
      const reach = job.targets[0].attachment.type === "anchor"
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
  for (let step = 0; step <= count + LAYOUT.gutterExtraSteps; step++) {
    for (
      const sign of step ? [-1, 1] : [1]
    ) {
      const dx = step * sign * (w + LAYOUT.gutterStepGap),
        dy = step * sign * (h + LAYOUT.gutterStepGap);
      for (
        const [side, x, y] of [
          [
            "right",
            occupied.x + occupied.width + LAYOUT.gutterGap,
            job.anchor.y - h / 2 + dy,
          ],
          [
            "left",
            occupied.x - w - LAYOUT.gutterGap,
            job.anchor.y - h / 2 + dy,
          ],
          ["top", job.anchor.x - w / 2 + dx, occupied.y - h - LAYOUT.gutterGap],
          [
            "bottom",
            job.anchor.x - w / 2 + dx,
            occupied.y + occupied.height + LAYOUT.gutterGap,
          ],
        ] as const
      ) {
        const label = { x, y, width: w, height: h };
        result.push({
          label,
          side,
          gutter: true,
          score: LAYOUT.gutterPenalty + directionPenalty(job, label),
        });
      }
    }
  }
  return result;
}

function bracketCandidates(job: Job, occupied: Bounds): Candidate[] {
  const b = job.bounds, result: Candidate[] = [];
  const w = job.label?.bounds.width ?? 0, h = job.label?.bounds.height ?? 0;
  const centers = job.targets.map((t) => center(t.bounds));
  const spanX = Math.max(...centers.map((p) => p.x)) -
    Math.min(...centers.map((p) => p.x));
  const spanY = Math.max(...centers.map((p) => p.y)) -
    Math.min(...centers.map((p) => p.y));
  const vertical = b.height >= b.width ||
    (job.targets.length > 1 && spanY > spanX);
  for (const side of ["right", "left", "bottom", "top"]) {
    const outerGap = side === "right"
      ? occupied.x + occupied.width - b.x - b.width + LAYOUT.bracketOuterGap
      : side === "left"
      ? b.x - occupied.x + LAYOUT.bracketOuterGap
      : side === "bottom"
      ? occupied.y + occupied.height - b.y - b.height + LAYOUT.bracketOuterGap
      : b.y - occupied.y + LAYOUT.bracketOuterGap;
    for (
      const gap of [
        ...new Set([
          ...LAYOUT.bracketGaps,
          Math.max(LAYOUT.bracketOuterGap, outerGap),
        ]),
      ]
    ) {
      let path: Point[], label: Bounds;
      if (side === "right" || side === "left") {
        const sign = side === "right" ? 1 : -1,
          x = side === "right" ? b.x + b.width + gap : b.x - gap;
        path = [
          { x: x - sign * LAYOUT.bracketCap, y: b.y - LAYOUT.bracketPadding },
          { x, y: b.y - LAYOUT.bracketPadding },
          {
            x,
            y: b.y + b.height + LAYOUT.bracketPadding,
          },
          {
            x: x - sign * LAYOUT.bracketCap,
            y: b.y + b.height + LAYOUT.bracketPadding,
          },
        ];
        label = {
          x: side === "right"
            ? x + LAYOUT.bracketLabelGap
            : x - w - LAYOUT.bracketLabelGap,
          y: b.y + b.height / 2 - h / 2,
          width: w,
          height: h,
        };
      } else {
        const sign = side === "bottom" ? 1 : -1,
          y = side === "bottom" ? b.y + b.height + gap : b.y - gap;
        path = [
          { x: b.x - LAYOUT.bracketPadding, y: y - sign * LAYOUT.bracketCap },
          { x: b.x - LAYOUT.bracketPadding, y },
          {
            x: b.x + b.width + LAYOUT.bracketPadding,
            y,
          },
          {
            x: b.x + b.width + LAYOUT.bracketPadding,
            y: y - sign * LAYOUT.bracketCap,
          },
        ];
        label = {
          x: b.x + b.width / 2 - w / 2,
          y: side === "bottom"
            ? y + LAYOUT.bracketLabelGap
            : y - h - LAYOUT.bracketLabelGap,
          width: w,
          height: h,
        };
      }
      result.push({
        label: job.label ? label : null,
        side,
        path,
        gutter: gap === Math.max(LAYOUT.bracketOuterGap, outerGap),
        score: gap * LAYOUT.bracketGapPenalty +
          (((side === "left" || side === "right") === vertical)
            ? 0
            : LAYOUT.bracketOrientationPenalty) +
          (side === "left" ? LAYOUT.bracketLeftPenalty : 0),
      });
    }
  }
  return result;
}

/** Choose the nearest visible stroke, including disconnected function branches. */
function strokeAnchor(target: RenderTarget, toward: Point) {
  const attachment = target.attachment;
  if (attachment.type === "anchor") {
    const length = Math.hypot(attachment.direction.x, attachment.direction.y);
    return {
      point: attachment.point,
      direction: {
        x: attachment.direction.x / length,
        y: attachment.direction.y / length,
      },
    };
  }
  let closest: Point | undefined, best = Infinity;
  for (
    const { a, b } of attachment.type === "segments" ? attachment.segments : []
  ) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((toward.x - a.x) * dx + (toward.y - a.y) * dy) /
          (dx * dx + dy * dy || 1),
      ),
    );
    const point = { x: a.x + t * dx, y: a.y + t * dy };
    const length = distance(point, toward);
    if (length > 0 && length < best) {
      closest = point;
      best = length;
    }
  }
  return closest && {
    point: closest,
    direction: {
      x: (toward.x - closest.x) / best,
      y: (toward.y - closest.y) / best,
    },
  };
}

function arrowHead(path: Point[]): Point[][] {
  const end = path.at(-1)!, prev = path.at(-2)!;
  const length = distance(prev, end) || 1,
    dx = (end.x - prev.x) / length,
    dy = (end.y - prev.y) / length;
  return [[
    {
      x: end.x - dx * LAYOUT.arrowLength - dy * LAYOUT.arrowHalfWidth,
      y: end.y - dy * LAYOUT.arrowLength + dx * LAYOUT.arrowHalfWidth,
    },
    end,
    {
      x: end.x - dx * LAYOUT.arrowLength + dy * LAYOUT.arrowHalfWidth,
      y: end.y - dy * LAYOUT.arrowLength - dx * LAYOUT.arrowHalfWidth,
    },
  ]];
}

type PlacedCandidate = Candidate & { paths: Point[][] };
type Evaluation = { layout: PlacedCandidate } | {
  reason: "invalid-geometry" | "label-overlap" | "blocked-route";
};
type Context = {
  obstacles: RenderObstacle[];
  attachmentBounds: Map<string, Bounds>;
  clearance: number;
  roughness: number;
};

/** Explicit ownership/permission affects connectors only, never message placement. */
export function connectorObstacles(
  obstacles: RenderObstacle[],
  targetIds: string[],
): RenderObstacle[] {
  const own = new Set(targetIds);
  return obstacles.filter((o) =>
    !(o.ownerId && own.has(o.ownerId)) &&
    !o.connectorPassThroughFor?.some((id) => own.has(id))
  );
}

const finiteBox = (b: Bounds) =>
  [b.x, b.y, b.width, b.height, b.x + b.width, b.y + b.height].every(
    Number.isFinite,
  ) && b.width >= 0 && b.height >= 0;
const validPaths = (paths: Point[][]) =>
  paths.length > 0 &&
  paths.every((path) =>
    path.length >= 2 &&
    path.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) &&
    path.slice(1).every((p, i) => distance(path[i], p) >= 0.01)
  );
const overlapCost = (candidate: Candidate, context: Context) =>
  candidate.label
    ? context.obstacles.filter((o) =>
      (o.kind === "text" || o.kind === "annotation") &&
      obstacleHitsBox(o, candidate.label!, context.clearance)
    ).length * LAYOUT.overlapPenalty
    : 0;

/** Evaluate one proposal without drawing or reserving any scene geometry. */
function evaluateCandidate(
  job: Job,
  candidate: Candidate,
  context: Context,
  hard: RenderObstacle[],
  detailed: boolean,
  relaxed: boolean,
): Evaluation {
  const { clearance, roughness, obstacles } = context;
  if (candidate.label && !finiteBox(candidate.label)) {
    return { reason: "invalid-geometry" };
  }
  if (
    !relaxed && candidate.label &&
    obstacles.some((o) => obstacleHitsBox(o, candidate.label!, clearance))
  ) return { reason: "label-overlap" };
  const type = job.request.type;
  let paths: Point[][] | undefined;
  let endpointPenalty = 0;
  if (type === "bracket") {
    if (
      !candidate.path ||
      (!relaxed && !clearRoute(candidate.path, obstacles, clearance))
    ) return { reason: "blocked-route" };
    paths = [candidate.path];
  } else {
    const label = candidate.label!;
    // Leave visible shaft behind the head, even for the nearest label or fallback.
    const minimumLeg =
      LAYOUT.arrowHalfWidth * 2 * LAYOUT.visibleShaftWidthRatio +
      (type === "arrow" ? LAYOUT.arrowLength : 0);
    const target = job.targets[0];
    const emphasized = context.attachmentBounds.get(job.request.targetIds[0]);
    const attachment = emphasized
      ? undefined
      : strokeAnchor(target, center(label));
    const barriers: RenderObstacle[] = [...hard, {
      kind: "text",
      bounds: label,
    }];
    for (const gap of LAYOUT.endpointGaps) {
      const end = attachment
        ? {
          x: attachment.point.x + attachment.direction.x * gap,
          y: attachment.point.y + attachment.direction.y * gap,
        }
        : port(emphasized ?? target.bounds, center(label), gap);
      const start = port(
        inflate(label, clearance + LAYOUT.labelExitPadding),
        end,
        1,
      );
      const aim = attachment?.point ?? port(target.bounds, center(label), 0);
      const gapBarriers = barriers.filter((o) =>
        o.kind !== "stroke" && o.kind !== "area"
      );
      if (
        !relaxed && !clearRoute([end, aim], gapBarriers, LAYOUT.aimClearance)
      ) continue;
      let route = routeConnector(start, end, barriers, clearance, detailed) ??
        (relaxed ? [start, end] : null);
      if (!route || !validPaths([route])) continue;
      const toward = { x: aim.x - end.x, y: aim.y - end.y };
      const incoming = {
        x: end.x - route.at(-2)!.x,
        y: end.y - route.at(-2)!.y,
      };
      const alignment = (toward.x * incoming.x + toward.y * incoming.y) /
        (Math.hypot(toward.x, toward.y) * Math.hypot(incoming.x, incoming.y) ||
          1);
      if (alignment < LAYOUT.approachAlignment) {
        const length = Math.hypot(toward.x, toward.y) || 1;
        const approachLength = Math.max(LAYOUT.approachLength, minimumLeg);
        const approach = {
          x: end.x - toward.x / length * approachLength,
          y: end.y - toward.y / length * approachLength,
        };
        if (!relaxed && !clearRoute([approach, end], barriers, clearance)) {
          continue;
        }
        const leading = routeConnector(
          start,
          approach,
          barriers,
          clearance,
          detailed,
        );
        if (!relaxed && !leading) continue;
        if (leading) route = [...leading, end];
      }
      if (distance(route.at(-2)!, end) + 1e-6 < minimumLeg) continue;
      const proposal = [route, ...(type === "arrow" ? arrowHead(route) : [])];
      if (
        !validPaths(proposal) ||
        (!relaxed &&
          !proposal.every((p) =>
            clearRoute(p, barriers, LAYOUT.pathClearance + roughness)
          ))
      ) continue;
      paths = proposal;
      endpointPenalty = (gap - LAYOUT.endpointGaps[0]) * LAYOUT.endpointPenalty;
      break;
    }
  }
  if (!paths || !validPaths(paths)) return { reason: "blocked-route" };
  const score = candidate.score + endpointPenalty +
    (type === "bracket" ? 0 : routeScore(paths[0])) +
    (relaxed ? overlapCost(candidate, context) : 0);
  return Number.isFinite(score)
    ? { layout: { ...candidate, score, paths } }
    : { reason: "invalid-geometry" };
}

/** Equal scores retain candidate enumeration order, including across search stages. */
function better(
  a: PlacedCandidate | null,
  b: PlacedCandidate | null,
): PlacedCandidate | null {
  return b && (!a || b.score < a.score) ? b : a;
}
function selectCandidates(
  job: Job,
  candidates: Candidate[],
  context: Context,
  detailed = false,
  relaxed = false,
): PlacedCandidate | null {
  const hard = connectorObstacles(context.obstacles, job.request.targetIds);
  const ranked = candidates.map((candidate, order) => ({ candidate, order }))
    .filter(({ candidate: c }) =>
      !c.label ||
      (finiteBox(c.label) && (relaxed || context.obstacles.every((o) =>
        !obstacleHitsBox(o, c.label!, context.clearance)
      )))
    )
    .map((item) => ({
      ...item,
      cost: item.candidate.score +
        (item.candidate.label
          ? distance(center(item.candidate.label), job.anchor)
          : 0) +
        (relaxed ? overlapCost(item.candidate, context) : 0),
    }))
    .sort((a, b) => a.cost - b.cost || a.order - b.order);
  let selected: PlacedCandidate | null = null;
  for (
    const { candidate } of detailed
      ? ranked.slice(0, LAYOUT.detailedCandidates)
      : ranked
  ) {
    const evaluated = evaluateCandidate(
      job,
      candidate,
      context,
      hard,
      detailed,
      relaxed,
    );
    if ("layout" in evaluated) selected = better(selected, evaluated.layout);
  }
  return selected;
}

function createJobs(
  requests: ResolvedCallout[],
  scene: TargetedDrawing,
  context: Context,
  occupied: Bounds,
): Job[] {
  const jobs = requests.map((request): Job => {
    const targets = request.targets;
    const bounds = unionBounds(targets.map((t) => t.bounds))!;
    const attachment = targets[0].attachment;
    // Brackets describe a group; their preference cannot depend on its first member.
    const fixed = request.type !== "bracket" && attachment.type === "anchor"
      ? attachment
      : null;
    const anchor = fixed?.point ?? center(bounds),
      f = center(scene.focusBounds);
    const direction = fixed?.direction ??
      {
        x: (anchor.x - f.x) / Math.max(1, scene.focusBounds.width),
        y: (anchor.y - f.y) / Math.max(1, scene.focusBounds.height),
      };
    const length = Math.hypot(direction.x, direction.y);
    const job: Job = {
      request,
      targets,
      bounds,
      anchor,
      preferred: length
        ? { x: direction.x / length, y: direction.y / length }
        : { x: 0, y: -1 },
      label: request.text === null ? null : measureLabel(request.text),
      candidates: [],
    };
    job.candidates = request.type === "bracket"
      ? bracketCandidates(job, occupied)
      : nearbyCandidates(job);
    return job;
  });
  // Cache this once instead of recomputing collision checks inside a sort comparator.
  return jobs.map((job) => ({
    job,
    free: job.candidates.filter((c) =>
      (!c.label ||
        context.obstacles.every((o) =>
          !obstacleHitsBox(o, c.label!, context.clearance)
        )) &&
      (!c.path || clearRoute(c.path, context.obstacles, context.clearance))
    ).length,
  }))
    .sort((a, b) =>
      a.free - b.free ||
      (b.job.label ? b.job.label.bounds.width * b.job.label.bounds.height : 0) -
        (a.job.label
          ? a.job.label.bounds.width * a.job.label.bounds.height
          : 0) ||
      a.job.request.annotationIndex - b.job.request.annotationIndex
    )
    .map(({ job }) => job);
}

/** Paint selected geometry and report its measured obstacles; no layout decisions. */
function drawCallout(
  job: Job,
  chosen: PlacedCandidate,
  options: AnnotationOptions,
  roughness: number,
) {
  const color = options.color ?? COLORS.ink;
  const request = job.request, type = request.type;
  const id = `${options.id}-annotation-${request.annotationIndex}`;
  const strokes: Drawing[] = [], obstacles: RenderObstacle[] = [];
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
        seed: (options.seed ?? 10) + request.annotationIndex * 31 + sequence++,
        stroke: color,
        strokeWidth: LAYOUT.strokeWidth,
      });
      strokes.push(drawing);
      obstacles.push({
        bounds: drawing.bounds!,
        kind: "annotation",
        segment: { a, b },
      });
    }
  }
  const indicator = `<g data-annotation-part="indicator">${
    strokes.map((s) => s.markup).join("\n")
  }</g>`;
  if (job.label && chosen.label) {
    strokes.push(labelDrawing(job.label, chosen.label, color));
    obstacles.push({ bounds: chosen.label, kind: "text" });
  }
  const bounds = unionBounds(strokes.map((s) => s.bounds))!;
  const drawing: Drawing = {
    markup:
      `<g id="${id}" data-annotation-type="${request.intent}" data-annotation-mark="${type}" data-annotation-index="${request.annotationIndex}" data-target-ids="${
        escapeXml(request.targetIds.join(" "))
      }">${indicator}${
        job.label && chosen.label ? strokes.at(-1)!.markup : ""
      }</g>`,
    bounds,
  };
  const placement: CalloutPlacement = {
    figureId: request.figureId,
    annotationIndex: request.annotationIndex,
    type,
    targetIds: [...request.targetIds],
    labelBounds: chosen.label,
    paths: chosen.paths,
    bounds,
    side: chosen.side,
    usedGutter: chosen.gutter,
  };
  return { drawing, placement, obstacles };
}

/** Place and reserve one complete annotation at a time, in deterministic order. */
export function renderCallouts(
  requests: ResolvedCallout[],
  scene: TargetedDrawing,
  emphasis: {
    obstacles: RenderObstacle[];
    attachmentBounds: Map<string, Bounds>;
  },
  options: AnnotationOptions,
): {
  drawing: Drawing;
  placements: CalloutPlacement[];
  obstacles: RenderObstacle[];
  diagnostics: AnnotationDiagnostic[];
} {
  const roughness = Math.min(
    options.roughness ?? HAND_DRAWING.roughness,
    LAYOUT.maxRoughness,
  );
  const context: Context = {
    obstacles: [...scene.obstacles, ...emphasis.obstacles],
    attachmentBounds: emphasis.attachmentBounds,
    clearance: LAYOUT.clearance + roughness * LAYOUT.roughnessClearance,
    roughness,
  };
  const occupiedBounds = () =>
    unionBounds([scene.bounds, ...context.obstacles.map((o) => o.bounds)]) ??
      scene.focusBounds;
  const jobs = createJobs(requests, scene, context, occupiedBounds());
  const parts: Drawing[] = [],
    placements: CalloutPlacement[] = [],
    diagnostics: AnnotationDiagnostic[] = [];
  for (const job of jobs) {
    const nearby = job.request.type === "bracket"
      ? bracketCandidates(job, occupiedBounds())
      : job.candidates;
    let chosen = selectCandidates(job, nearby, context);
    if (!chosen) chosen = selectCandidates(job, nearby, context, true);
    const gutters = job.request.type === "bracket"
      ? []
      : gutterCandidates(job, occupiedBounds(), jobs.length);
    chosen = better(chosen, selectCandidates(job, gutters, context));
    if (!chosen) chosen = selectCandidates(job, gutters, context, true);
    if (!chosen) {
      chosen = selectCandidates(
        job,
        [...gutters, ...nearby],
        context,
        false,
        true,
      );
      const { figureId, annotationIndex, targetIds, type } = job.request;
      diagnostics.push({
        figureId,
        annotationIndex,
        targetIds: [...targetIds],
        code: chosen ? "overlap-fallback" : "unplaceable",
        message: chosen
          ? `Could not place ${type} annotation ${annotationIndex} in '${figureId}' without overlapping content; using a fallback placement.`
          : `Could not place ${type} annotation ${annotationIndex} in '${figureId}'; skipping.`,
      });
    }
    if (!chosen) continue;
    const result = drawCallout(job, chosen, options, roughness);
    parts.push(result.drawing);
    placements.push(result.placement);
    context.obstacles.push(...result.obstacles);
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
    obstacles: context.obstacles,
    diagnostics,
  };
}

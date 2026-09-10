import { WhiteboardOutput, type WhiteboardSpec } from "../schema.ts";
import { escapeXml } from "./svg.ts";
import {
  type Bounds,
  type Drawing,
  exportBounds,
  unionBounds,
} from "./bounds.ts";
import { GRAPH_FONT_DEFS } from "./font.ts";
import {
  type GraphOptions,
  renderCircularGraphDrawing,
  renderXyGraphDrawing,
} from "./graphs.ts";
import { type LayoutOptions, layoutWhiteboard } from "./layout.ts";
import { renderEmphasisAnnotations } from "./annotations.ts";
import { type CalloutPlacement, renderCallouts } from "./callouts.ts";
import { renderMathExpressionsDrawing } from "./math-expressions.ts";
import type { TargetedDrawing } from "./targets.ts";

export type WhiteboardRenderOptions = LayoutOptions & {
  /** Prefix for internal SVG definitions; semantic target IDs come from the spec. */
  id?: string;
  roughness?: number;
  hatchGap?: number;
  seed?: number;
};

export type SvgRenderStage = {
  svg: string;
  width: number;
  height: number;
  bounds: Bounds;
};
export type WhiteboardRenderResult = SvgRenderStage & {
  stages: {
    base: SvgRenderStage;
    emphasis: SvgRenderStage;
    callouts: SvgRenderStage;
  };
  calloutPlacements: CalloutPlacement[];
  childPlacements: ReturnType<typeof layoutWhiteboard>["children"];
};

type Child = WhiteboardSpec["children"][number];

/** Dispatch base content by family; future diagram and asset types belong here. */
function renderBaseChild(child: Child, options: GraphOptions): TargetedDrawing {
  switch (child.type) {
    case "xy_chart":
      return renderXyGraphDrawing(child, options);
    case "pie_chart":
      return renderCircularGraphDrawing(child, options);
    case "math_expressions":
      return renderMathExpressionsDrawing(child, options);
    default:
      throw new Error("Unsupported whiteboard child type.");
  }
}

function compose(
  children: Drawing[],
  placements: ReturnType<typeof layoutWhiteboard>["children"],
  childIds: string[],
): Drawing {
  return {
    markup: children.map((drawing, i) => {
      const { x, y } = placements[i];
      return `<g data-child-id="${
        escapeXml(childIds[i])
      }" transform="translate(${x} ${y})">${drawing.markup}</g>`;
    }).join("\n"),
    bounds: unionBounds(children.map((drawing, i) =>
      drawing.bounds && ({
        ...drawing.bounds,
        x: drawing.bounds.x + placements[i].x,
        y: drawing.bounds.y + placements[i].y,
      })
    )),
  };
}

function exportSvg(drawing: Drawing, title: string): SvgRenderStage {
  const bounds = exportBounds(drawing.bounds);
  return {
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" role="img" aria-label="${
        escapeXml(title)
      }"><title>${
        escapeXml(title)
      }</title>${GRAPH_FONT_DEFS}${drawing.markup}</svg>`,
    width: bounds.width,
    height: bounds.height,
    bounds,
  };
}

/** Shared entry point: base SVG -> emphasis -> callout placement -> final SVG.
 * Each stage preserves the base markup and its measured target geometry.
 * No LLM calls, SVG parsing, file writes, or uploads happen in this pipeline.
 */
export function renderWhiteboardSvg(
  input: WhiteboardSpec,
  options: WhiteboardRenderOptions = {},
): WhiteboardRenderResult {
  const spec = WhiteboardOutput.parse(input);
  const { children: placements } = layoutWhiteboard(spec, options);
  const usedChildIds = new Set<string>();
  for (const child of spec.children) {
    if (child.id) {
      if (usedChildIds.has(child.id)) {
        throw new Error(`Duplicate child ID '${child.id}'.`);
      }
      usedChildIds.add(child.id);
    }
    const content = child.type === "pie_chart"
      ? child.slices
      : child.type === "xy_chart"
      ? child.series.flatMap((s) => [s, ...s.points])
      : child.expressions;
    const ids = content.flatMap((element) => element.id ? [element.id] : []);
    if (new Set(ids).size !== ids.length) {
      throw new Error(
        `Duplicate element ID in child '${child.id ?? child.title}'.`,
      );
    }
  }
  const childIds = spec.children.map((child, i) => {
    if (child.id) return child.id;
    let id = `child-${i + 1}`;
    while (usedChildIds.has(id)) id += "-auto";
    usedChildIds.add(id);
    return id;
  });
  const graphOptions = placements.map((p, i): GraphOptions => ({
    id: `${options.id ?? "whiteboard"}-child-${i}`,
    width: p.width,
    height: p.height,
    roughness: options.roughness ?? 1.5,
    hatchGap: options.hatchGap ?? 9,
    seed: options.seed ?? 10,
  }));
  const title = spec.children.map((child) => child.title).join("; ");

  // 1. Build the complete base SVG and retain child-local target geometry.
  const baseChildren = spec.children.map((child, i) =>
    renderBaseChild(
      { ...child, id: childIds[i] },
      graphOptions[i],
    )
  );
  const base = exportSvg(compose(baseChildren, placements, childIds), title);

  // 2. Add emphasis without changing or regenerating the base drawing.
  const emphasisResults = baseChildren.map((drawing, i) =>
    renderEmphasisAnnotations(
      spec.children[i].annotations ?? [],
      drawing.targets,
      {
        ...graphOptions[i],
        childId: childIds[i],
      },
    )
  );
  const emphasizedChildren = baseChildren.map((drawing, i): Drawing => ({
    markup: drawing.markup + emphasisResults[i].drawing.markup,
    bounds: unionBounds([drawing.bounds, emphasisResults[i].drawing.bounds]),
  }));
  const emphasis = exportSvg(
    compose(emphasizedChildren, placements, childIds),
    title,
  );

  // 3. Place messages and route connectors around base content and emphasis.
  const calloutResults = baseChildren.map((drawing, i) =>
    renderCallouts(
      emphasisResults[i].pendingCallouts,
      drawing,
      emphasisResults[i].obstacles,
      graphOptions[i],
    )
  );
  const completeChildren = emphasizedChildren.map((drawing, i): Drawing => ({
    markup: drawing.markup + calloutResults[i].drawing.markup,
    bounds: unionBounds([drawing.bounds, calloutResults[i].drawing.bounds]),
  }));
  // 4. Expand inter-child spacing for gutters without changing base geometry.
  // A larger viewBox alone would leave callouts overlapping neighboring charts.
  const childPlacements = placements.map((p) => ({ ...p }));
  for (let i = 1; i < childPlacements.length; i++) {
    const previous = childPlacements[i - 1], current = childPlacements[i];
    const a = completeChildren[i - 1].bounds!, b = completeChildren[i].bounds!;
    const gap = options.gap ?? 32;
    if (spec.layout === "split") {
      current.x = Math.max(current.x, previous.x + a.x + a.width + gap - b.x);
    } else if (spec.layout === "stack") {
      current.y = Math.max(current.y, previous.y + a.y + a.height + gap - b.y);
    }
  }
  // Future asset processing belongs before this final composition/export.
  const callouts = exportSvg(
    compose(completeChildren, childPlacements, childIds),
    title,
  );
  return {
    ...callouts,
    stages: { base, emphasis, callouts },
    calloutPlacements: calloutResults.flatMap((r) => r.placements),
    childPlacements,
  };
}

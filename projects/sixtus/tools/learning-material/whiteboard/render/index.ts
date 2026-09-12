import { renderFreeformDrawing } from "./freeform.ts";
import { renderTextFigureDrawing } from "./text.ts";
import {
  type WhiteboardFigureContent,
  WhiteboardOutput,
  type WhiteboardSpec,
} from "../schema.ts";
import { escapeXml } from "./svg.ts";
import {
  type Bounds,
  type Drawing,
  exportBounds,
  unionBounds,
} from "./bounds.ts";
import { GRAPH_FONT_DEFS, GRAPH_FONT_STYLE } from "./font.ts";
import {
  type GraphOptions,
  renderCircularGraphDrawing,
  renderXyGraphDrawing,
} from "./graphs.ts";
import {
  figureAllocation,
  type FigurePlacement,
  placeFigures,
  type PlacementOptions,
} from "./figure-placement.ts";
import { renderEmphasisAnnotations } from "./annotations.ts";
import { type CalloutPlacement, renderCallouts } from "./callouts.ts";
import { renderMathExpressionsDrawing } from "./math-expressions.ts";
import { renderCoordinatePlotDrawing } from "./coordinate-plot.ts";
import { renderGeometryDrawing } from "./geometry.ts";
import type { TargetedDrawing } from "./targets.ts";
import {
  COLORS,
  LINE_HEIGHT,
  SERIES_COLORS,
  SPACING,
  TYPE_SCALE,
} from "./theme.ts";
import { textBlock } from "./text-block.ts";
import { boardTitleDisplay, withTitleBox } from "./titles.ts";

export type WhiteboardRenderOptions = PlacementOptions & {
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
  figurePlacements: FigurePlacement[];
};

type Figure = WhiteboardFigureContent;

/** Dispatch base content by family; future diagram and asset types belong here. */
function renderBaseFigure(
  figure: Figure,
  options: GraphOptions,
): TargetedDrawing {
  switch (figure.type) {
    case "text":
      return renderTextFigureDrawing(figure, options);
    case "freeform":
      return renderFreeformDrawing(figure, options);
    case "xy_chart":
      return renderXyGraphDrawing(figure, options);
    case "pie_chart":
      return renderCircularGraphDrawing(figure, options);
    case "geometry":
      return renderGeometryDrawing(figure, options);
    case "math_expressions":
      return renderMathExpressionsDrawing(figure, options);
    case "coordinate_plot":
      return renderCoordinatePlotDrawing(figure, options);
    default:
      throw new Error("Unsupported whiteboard figure type.");
  }
}

function compose(
  figures: Drawing[],
  placements: FigurePlacement[],
  figureIds: string[],
): Drawing {
  return {
    markup: figures.map((drawing, i) => {
      const { x, y } = placements[i];
      return `<g data-figure-id="${
        escapeXml(figureIds[i])
      }" transform="translate(${x} ${y})">${drawing.markup}</g>`;
    }).join("\n"),
    bounds: unionBounds(figures.map((drawing, i) =>
      drawing.bounds && ({
        ...drawing.bounds,
        x: drawing.bounds.x + placements[i].x,
        y: drawing.bounds.y + placements[i].y,
      })
    )),
  };
}

function renderBoardTitle(
  title: string,
  figures: Drawing,
  options: { id: string; roughness?: number; seed?: number },
): Drawing {
  const union = exportBounds(figures.bounds);
  const titleText = textBlock(
    boardTitleDisplay(title),
    Math.max(union.width, TYPE_SCALE.boardTitle * 4),
    TYPE_SCALE.boardTitle,
    LINE_HEIGHT.boardTitle,
    0,
    0,
    COLORS.ink,
    "center",
  );
  const boxed = withTitleBox(titleText, {
    ...options,
    id: `${options.id}-box`,
  });
  const b = boxed.bounds!;
  const dx = union.x + union.width / 2 -
    (titleText.bounds!.x + titleText.bounds!.width / 2);
  const dy = union.y - SPACING.boardTitleGap - (b.y + b.height);
  return {
    markup:
      `<g data-board-title="" style="${GRAPH_FONT_STYLE}" transform="translate(${dx} ${dy})">${boxed.markup}</g>`,
    bounds: { ...b, x: b.x + dx, y: b.y + dy },
  };
}

function withBoardTitle(drawing: Drawing, boardTitle: Drawing | null): Drawing {
  if (!boardTitle) return drawing;
  return {
    markup: boardTitle.markup + "\n" + drawing.markup,
    bounds: unionBounds([boardTitle.bounds, drawing.bounds]),
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
  const allocation = figureAllocation(options);
  for (const figure of spec.figures) {
    const content = figure.type === "pie_chart"
      ? figure.slices
      : figure.type === "xy_chart"
      ? figure.series.flatMap((s) => [s, ...s.points])
      : figure.type === "geometry"
      ? [
        ...figure.points,
        ...figure.objects,
        ...figure.labels,
        ...figure.markings,
      ]
      : (figure.type === "coordinate_plot" || figure.type === "freeform")
      ? figure.elements
      : figure.type === "text"
      ? []
      : figure.expressions;
    const ids = content.flatMap((element) => element.id ? [element.id] : []);
    if (new Set(ids).size !== ids.length) {
      throw new Error(
        `Duplicate element ID in figure '${figure.id}'.`,
      );
    }
  }
  const figureIds = spec.figures.map((figure) => figure.id);
  const graphOptions = spec.figures.map((_, i): GraphOptions => ({
    id: `${options.id ?? "whiteboard"}-figure-${i}`,
    width: allocation.width,
    height: allocation.height,
    roughness: options.roughness ?? 1.5,
    hatchGap: options.hatchGap ?? 9,
    seed: options.seed ?? 10,
  }));
  const title = spec.title ??
    (spec.figures.map((figure) => figure.title).filter((
      value,
    ): value is string => value !== null).join("; ") || "Whiteboard");

  // 1. Build the complete base SVG and retain figure-local target geometry.
  const baseFigures = spec.figures.map((
    { anchor: _anchor, side: _side, ...figure },
    i,
  ) =>
    renderBaseFigure(
      figure,
      graphOptions[i],
    )
  );

  const annotationOptions = graphOptions.map((options, i) => ({
    ...options,
    color: spec.figures[i].type === "math_expressions" ||
        spec.figures[i].type === "freeform"
      ? SERIES_COLORS[0]
      : COLORS.ink,
  }));

  // 2. Add emphasis without changing or regenerating the base drawing.
  const emphasisResults = baseFigures.map((drawing, i) =>
    renderEmphasisAnnotations(
      spec.figures[i].annotations ?? [],
      drawing.targets,
      {
        ...annotationOptions[i],
        figureId: figureIds[i],
      },
    )
  );
  const emphasizedFigures = baseFigures.map((drawing, i): Drawing => ({
    markup: drawing.markup + emphasisResults[i].drawing.markup,
    bounds: unionBounds([drawing.bounds, emphasisResults[i].drawing.bounds]),
  }));
  // 3. Place messages and route connectors around base content and emphasis.
  const calloutResults = baseFigures.map((drawing, i) =>
    renderCallouts(
      emphasisResults[i].pendingCallouts,
      drawing,
      emphasisResults[i].obstacles,
      annotationOptions[i],
    )
  );
  const completeFigures = emphasizedFigures.map((drawing, i): Drawing => ({
    markup: drawing.markup + calloutResults[i].drawing.markup,
    bounds: unionBounds([drawing.bounds, calloutResults[i].drawing.bounds]),
  }));
  // 4. Place complete measured figures once, then reuse translations in every stage.
  const figurePlacements = placeFigures(spec, completeFigures, options);
  const completeComposed = compose(
    completeFigures,
    figurePlacements,
    figureIds,
  );
  const boardTitle = spec.title !== null
    ? renderBoardTitle(spec.title, completeComposed, {
      id: `${options.id ?? "whiteboard"}-board-title`,
      roughness: options.roughness ?? 1.5,
      seed: options.seed ?? 10,
    })
    : null;
  const base = exportSvg(
    withBoardTitle(
      compose(baseFigures, figurePlacements, figureIds),
      boardTitle,
    ),
    title,
  );
  const emphasis = exportSvg(
    withBoardTitle(
      compose(emphasizedFigures, figurePlacements, figureIds),
      boardTitle,
    ),
    title,
  );
  // Future asset processing belongs before this final composition/export.
  const callouts = exportSvg(
    withBoardTitle(completeComposed, boardTitle),
    title,
  );
  return {
    ...callouts,
    stages: { base, emphasis, callouts },
    calloutPlacements: calloutResults.flatMap((r) => r.placements),
    figurePlacements,
  };
}

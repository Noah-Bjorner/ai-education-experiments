import {
  figureOptionsKey,
  type FigurePreparationResult,
  type PreparedFigure,
  prepareFigure,
} from "./prepare.ts";
import { ALLOCATION_GROWTH, type FigureRenderOptions } from "./options.ts";
import { contextualize, renderError, type RenderIssue } from "./issues.ts";
import {
  type WhiteboardFontMode,
  WhiteboardOutput,
  type WhiteboardSpec,
} from "../schema.ts";
import { escapeXml } from "./svg.ts";
import {
  balanceAround,
  type Bounds,
  type Drawing,
  exportBounds,
  unionBounds,
} from "./bounds.ts";
import { GRAPH_FONT_STYLE, graphFontDefs } from "./font.ts";
import {
  figureAllocation,
  type FigurePlacement,
  placeFigures,
  type PlacementOptions,
} from "./figure-placement.ts";
import type { AnnotationDiagnostic } from "./annotation-types.ts";
import { type CalloutPlacement } from "./callouts.ts";
import {
  COLORS,
  HAND_DRAWING,
  LINE_HEIGHT,
  SPACING,
  TYPE_SCALE,
} from "./theme.ts";
import { textBlock } from "./text-block.ts";
import { boardTitleDisplay, withTitleBox } from "./titles.ts";

export type WhiteboardRenderOptions = PlacementOptions & {
  /** Prefix for internal SVG definitions; semantic target IDs come from the spec. */
  id?: string;
  /** Defaults to embedding; hosted uses the shared font URL. */
  fontMode?: WhiteboardFontMode;
  /** Hand imperfection: 0 clean, 0.7 steady, 1.5 natural, 3 loose. */
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
  annotationDiagnostics: AnnotationDiagnostic[];
  diagnostics: RenderIssue[];
  figurePlacements: FigurePlacement[];
  /** Painted union before optical centering; `bounds` is the shared viewBox. */
  contentBounds: Bounds;
};

function compose(
  figures: Drawing[],
  placements: FigurePlacement[],
  meta: { id: string; type: string }[],
): Drawing {
  return {
    markup: figures.map((drawing, i) => {
      const { x, y } = placements[i];
      return `<g data-figure-id="${escapeXml(meta[i].id)}" data-figure-type="${
        escapeXml(meta[i].type)
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
  center: Drawing,
  options: { id: string; roughness?: number; seed?: number },
): Drawing {
  const union = exportBounds(figures.bounds);
  const focus = exportBounds(center.bounds);
  const titleText = textBlock(
    boardTitleDisplay(title),
    Math.max(focus.width, TYPE_SCALE.boardTitle * 4),
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
  const dx = focus.x + focus.width / 2 -
    (titleText.bounds!.x + titleText.bounds!.width / 2);
  const dy = union.y - SPACING.boardTitleGap - (b.y + b.height);
  return {
    markup:
      `<g data-board-title="" data-drawing="static" style="${GRAPH_FONT_STYLE}" transform="translate(${dx} ${dy})">${boxed.markup}</g>`,
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

function exportSvg(
  drawing: Drawing,
  title: string,
  frame: Bounds,
  fontMode?: WhiteboardFontMode,
): SvgRenderStage {
  const bounds = exportBounds(frame);
  return {
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" role="img" aria-label="${
        escapeXml(title)
      }"><title>${escapeXml(title)}</title>${
        graphFontDefs(fontMode)
      }${drawing.markup}</svg>`,
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
  const prepared = prepareWhiteboardFigures(spec, options).map((result) => {
    if (!result.ok) throw result.error;
    return result.figure;
  });
  return composeWhiteboard(spec, prepared, options);
}

/**
 * Prepare every figure with the same options the board will render with.
 * Deterministic and model-free, so the spec stage can run it to catch content
 * that cannot be drawn before the board is reported as generated.
 */
export function prepareWhiteboardFigures(
  input: WhiteboardSpec,
  options: WhiteboardRenderOptions = {},
): FigurePreparationResult[] {
  const spec = WhiteboardOutput.parse(input);
  return spec.figures.map((figure, i) => {
    const { anchor: _anchor, side: _side, ...content } = figure;
    return prepareFigure(content, figureOptions(options, i));
  });
}

/** Compose drawings prepared with the same figure order/options in this request. */
export function composeWhiteboard(
  input: WhiteboardSpec,
  prepared: PreparedFigure[],
  options: WhiteboardRenderOptions = {},
): WhiteboardRenderResult {
  const spec = WhiteboardOutput.parse(input);
  if (
    prepared.length !== spec.figures.length || prepared.some((p, i) => {
      const { anchor: _anchor, side: _side, ...content } = spec.figures[i];
      return p.source !== JSON.stringify(content) ||
        p.optionsKey !== figureOptionsKey(figureOptions(options, i));
    })
  ) {
    throw renderError(
      "INVALID_OPTIONS",
      "Prepared figures must match the board content, order, and rendering options.",
      { stage: "composition" },
    );
  }
  const figureMeta = spec.figures.map((figure, i) => ({
    id: figure.id,
    type: prepared[i].type,
  }));
  const title = spec.title ??
    (spec.figures.map((figure) => figure.title).filter(Boolean).join("; ") ||
      "Whiteboard");
  const baseFigures = prepared.map((figure) => figure.base);
  const emphasizedFigures = prepared.map((figure) => figure.emphasis);
  const completeFigures = prepared.map((figure) => figure.complete);
  // 4. Place complete measured figures once, then reuse translations in every stage.
  const figurePlacements = placeFigures(spec, completeFigures, options);
  const baseComposed = compose(baseFigures, figurePlacements, figureMeta);
  const emphasisComposed = compose(
    emphasizedFigures,
    figurePlacements,
    figureMeta,
  );
  const completeComposed = compose(
    completeFigures,
    figurePlacements,
    figureMeta,
  );
  const boardTitle = spec.title !== null
    ? prepareBoardTitle(spec.title, completeComposed, baseComposed, {
      id: `${options.id ?? "whiteboard"}-board-title`,
      roughness: options.roughness ?? HAND_DRAWING.roughness,
      seed: options.seed ?? 10,
    })
    : null;
  const baseDrawing = withBoardTitle(baseComposed, boardTitle);
  const emphasisDrawing = withBoardTitle(emphasisComposed, boardTitle);
  const completeDrawing = withBoardTitle(completeComposed, boardTitle);
  const contentBounds = exportBounds(completeDrawing.bounds);
  const frame = balanceAround(
    exportBounds(baseDrawing.bounds),
    contentBounds,
  );
  const base = exportSvg(baseDrawing, title, frame, options.fontMode);
  const emphasis = exportSvg(emphasisDrawing, title, frame, options.fontMode);
  // Future asset processing belongs before this final composition/export.
  const callouts = exportSvg(completeDrawing, title, frame, options.fontMode);
  return {
    ...callouts,
    contentBounds,
    stages: { base, emphasis, callouts },
    diagnostics: prepared.flatMap((figure) => figure.diagnostics),
    calloutPlacements: prepared.flatMap((figure) => figure.calloutPlacements),
    annotationDiagnostics: prepared.flatMap((figure) =>
      figure.annotationDiagnostics
    ),
    figurePlacements,
  };
}

function prepareBoardTitle(
  ...args: Parameters<typeof renderBoardTitle>
): Drawing {
  try {
    return renderBoardTitle(...args);
  } catch (error) {
    throw contextualize(error, { stage: "title", path: ["title"] });
  }
}

/** Landscape packs figures side by side, so width grows less freely than in a single column. */
const LANDSCAPE_WIDTH_GROWTH = 1.5;

export function figureOptions(
  options: WhiteboardRenderOptions,
  index: number,
): FigureRenderOptions {
  const { width, height } = figureAllocation(options);
  return {
    id: `${options.id ?? "whiteboard"}-figure-${index}`,
    width,
    height,
    maxWidth: width *
      (options.orientation === "landscape"
        ? LANDSCAPE_WIDTH_GROWTH
        : ALLOCATION_GROWTH.maxScale),
    maxHeight: height * ALLOCATION_GROWTH.maxScale,
    roughness: options.roughness,
    hatchGap: options.hatchGap,
    seed: options.seed,
  };
}

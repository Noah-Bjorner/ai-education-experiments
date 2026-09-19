import { drawingBuilder, transformDrawing } from "./drawing.ts";
import { contextualize, renderError } from "./issues.ts";
import { resolveFigureOptions } from "./options.ts";
import type { MathExpressions } from "../figures/math-expressions.ts";
import { escapeXml } from "./svg.ts";
import { unionBounds } from "./bounds.ts";
import { GRAPH_FONT_STYLE } from "./font.ts";
import type { FigureRenderOptions as GraphOptions } from "./options.ts";
import { renderMathLatex } from "./latex.ts";
import { type TargetedDrawing } from "./targets.ts";
import { COLORS, SPACING, TYPE_SCALE } from "./theme.ts";
import { withFigureTitle } from "./titles.ts";

const move = transformDrawing;
export function renderMathExpressionsDrawing(
  figure: MathExpressions,
  options: GraphOptions,
): TargetedDrawing {
  const { width, height } = resolveFigureOptions(options);
  if (width < 160 || height < 140) {
    throw renderError(
      "INVALID_OPTIONS",
      "Math rendering needs dimensions at least 160 × 140.",
    );
  }
  const namespace = figure.id ?? options.id;
  const scene = drawingBuilder();
  const rows = figure.expressions.map((expression) => {
    try {
      return renderMathLatex(expression.latex, TYPE_SCALE.mathDisplay);
    } catch (error) {
      throw contextualize(error, {
        elementId: expression.id,
        path: ["expressions", figure.expressions.indexOf(expression), "latex"],
      });
    }
  });
  const rowGap = SPACING.mathRowGap;
  const rowWidths = rows.map((row) =>
    Math.max(row.width, (row.bounds?.x ?? 0) + (row.bounds?.width ?? 0)) -
    Math.min(0, row.bounds?.x ?? 0)
  );
  const naturalWidth = Math.max(...rowWidths);
  const limit = width - SPACING.sectionGap * 2;
  if (!Number.isFinite(naturalWidth) || naturalWidth > limit) {
    const widest = figure.expressions[rowWidths.indexOf(naturalWidth)];
    // The board keeps one display size, so a long row asks for a wider
    // allocation; past the ceiling the author must split it.
    throw renderError(
      "CONTENT_DOES_NOT_FIT",
      `Expression '${widest.id}' is too long for one row at the shared display size; split it at a relation (such as =) into shorter rows.`,
      {
        elementId: widest.id,
        path: ["expressions"],
        required: Number.isFinite(naturalWidth)
          ? { width: naturalWidth + SPACING.sectionGap * 2 }
          : "grow",
      },
    );
  }
  const expressions = scene.parts;
  let y = 78;
  rows.forEach((row, i) => {
    y += row.ascent;
    const moved = move(row, (width - row.width) / 2, y);
    scene.add({
      id: `${namespace}.${figure.expressions[i].id}.expression`,
      drawing: {
        ...moved,
        markup: `<g aria-label="${
          escapeXml(figure.expressions[i].latex)
        }">${moved.markup}</g>`,
      },
      kind: "text",
    });
    y += row.descent + rowGap;
  });
  const focusBounds = unionBounds(expressions.map((part) => part.bounds))!;
  return withFigureTitle(
    scene.finish(
      focusBounds,
      `<g style="${GRAPH_FONT_STYLE};color:${COLORS.ink}">${
        expressions.map((part) => part.markup).join("")
      }</g>`,
    ),
    figure.title,
    namespace,
    options,
  );
}

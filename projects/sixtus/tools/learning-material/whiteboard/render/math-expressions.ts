import type { MathExpressions } from "../figures/math-expressions.ts";
import { escapeXml } from "./svg.ts";
import { type Bounds, type Drawing, unionBounds } from "./bounds.ts";
import { GRAPH_FONT_STYLE } from "./font.ts";
import type { GraphOptions } from "./graphs.ts";
import { renderMathLatex } from "./latex.ts";
import {
  registerTarget,
  type RenderTarget,
  type ScenePart,
  type TargetedDrawing,
} from "./targets.ts";
import { COLORS, SPACING, TYPE_SCALE } from "./theme.ts";
import { withFigureTitle } from "./titles.ts";

function move(
  drawing: Drawing,
  x: number,
  y: number,
): Drawing {
  const b = drawing.bounds;
  return {
    markup: `<g transform="translate(${x} ${y})">${drawing.markup}</g>`,
    bounds: b &&
      {
        x: x + b.x,
        y: y + b.y,
        width: b.width,
        height: b.height,
      },
  };
}
export function renderMathExpressionsDrawing(
  figure: MathExpressions,
  options: GraphOptions,
): TargetedDrawing {
  const width = options.width ?? 800, height = options.height ?? 520;
  const roughness = options.roughness ?? 1.5, seed = options.seed ?? 10;
  if (
    !/^[a-zA-Z][\w-]*$/.test(options.id) ||
    ![width, height, roughness, seed].every(Number.isFinite) ||
    width < 160 || height < 140 || roughness < 0
  ) {
    throw new Error(
      "Math rendering needs a simple SVG id, finite dimensions (at least 160 × 140), and nonnegative roughness.",
    );
  }
  const namespace = figure.id ?? options.id;
  const targets = new Map<string, RenderTarget>();
  const rows = figure.expressions.map((expression) => {
    try {
      return renderMathLatex(expression.latex, TYPE_SCALE.mathDisplay);
    } catch (error) {
      throw new Error(
        `Math expression '${expression.id}': ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  });
  const rowGap = SPACING.mathRowGap;
  const naturalWidth = Math.max(
    ...rows.map((row) =>
      Math.max(row.width, (row.bounds?.x ?? 0) + (row.bounds?.width ?? 0)) -
      Math.min(0, row.bounds?.x ?? 0)
    ),
  );
  if (
    !Number.isFinite(naturalWidth) ||
    naturalWidth > width - SPACING.sectionGap * 2
  ) {
    throw new Error(
      "Math expressions do not fit legibly at the shared size; increase the width or split the expression into shorter rows.",
    );
  }
  const expressions: ScenePart[] = [];
  let y = 78;
  rows.forEach((row, i) => {
    y += row.ascent;
    expressions.push(
      registerTarget(
        targets,
        `${namespace}.${figure.expressions[i].id}.expression`,
        {
          ...move(row, (width - row.width) / 2, y),
          markup: `<g aria-label="${escapeXml(figure.expressions[i].latex)}">${
            move(row, (width - row.width) / 2, y).markup
          }</g>`,
        },
        "text",
      ),
    );
    y += row.descent + rowGap;
  });
  const bounds = unionBounds(expressions.map((part) => part.bounds))!;
  const focusBounds: Bounds = unionBounds(
    expressions.map((part) => part.bounds),
  )!;
  return withFigureTitle(
    {
      markup: `<g style="${GRAPH_FONT_STYLE};color:${COLORS.ink}">${
        expressions.map((p) => p.markup).join("")
      }</g>`,
      bounds,
      targets,
      focusBounds,
      obstacles: expressions.flatMap((p) => p.obstacles ?? []),
    },
    figure.title,
    namespace,
    options,
  );
}

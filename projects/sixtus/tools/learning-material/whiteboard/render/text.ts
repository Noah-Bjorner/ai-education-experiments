import { drawingBuilder } from "./drawing.ts";
import { renderError } from "./issues.ts";
import { resolveFigureOptions } from "./options.ts";
import { type TextFigure, textFigureSchema } from "../figures/text.ts";
import { GRAPH_FONT_STYLE } from "./font.ts";
import { textBlock } from "./text-block.ts";
import type { FigureRenderOptions as GraphOptions } from "./options.ts";
import { renderHandwritten } from "./handwritten.ts";
import { type TargetedDrawing } from "./targets.ts";
import { TEXT_FIGURE_STYLE } from "./theme.ts";
import { withFigureTitle } from "./titles.ts";

/** Width caps wrapping; the handwritten border hugs the measured text block. */
export function renderTextFigureDrawing(
  input: TextFigure,
  options: GraphOptions,
): TargetedDrawing {
  const figure = textFigureSchema.parse(input);
  const { width, roughness, seed } = resolveFigureOptions(options);
  const style = TEXT_FIGURE_STYLE;
  if (width <= style.padding * 2) {
    throw renderError(
      "INVALID_OPTIONS",
      `Text rendering needs a width greater than ${style.padding * 2}.`,
    );
  }
  const scene = drawingBuilder();
  const parts = scene.parts;
  const colors = style.roles[figure.role];
  const body = textBlock(
    figure.text,
    width - style.padding * 2,
    style.fontSize,
    style.lineHeight,
    style.padding,
    style.padding,
    colors.text,
  );
  const cardWidth = body.bounds!.width + style.padding * 2;
  const cardY = 0;
  const card = {
    x: 0,
    y: cardY,
    width: cardWidth,
    height: body.height + style.padding * 2,
  };
  const border = renderHandwritten({ type: "rectangle", ...card }, {
    id: `${options.id}-text-border`,
    seed,
    roughness,
    stroke: colors.border,
    strokeWidth: style.strokeWidth,
  });
  const borderBounds = border.bounds!;
  scene.add({
    id: undefined,
    kind: "mark",
    drawing: {
      markup:
        `<g data-figure-part="box" data-text-border="${figure.role}">${border.markup}</g>`,
      bounds: borderBounds,
      obstacles: [{
        bounds: borderBounds,
        kind: "shape",
        ownerId: `${figure.id}.text`,
      }],
    },
  });
  scene.add({
    id: `${figure.id}.text`,
    drawing: {
      markup:
        `<g data-figure-part="writing" transform="translate(0 ${cardY})">${body.markup}</g>`,
      bounds: { ...body.bounds!, y: body.bounds!.y + cardY },
    },
    kind: "text",
  });
  return withFigureTitle(
    scene.finish(
      card,
      `<g data-text-role="${figure.role}" style="${GRAPH_FONT_STYLE}">${
        parts.map((part) => part.markup).join("")
      }</g>`,
    ),
    figure.title,
    figure.id,
    options,
  );
}

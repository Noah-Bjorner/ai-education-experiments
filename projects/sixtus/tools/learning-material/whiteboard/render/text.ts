import { type TextFigure, textFigureSchema } from "../figures/text.ts";
import { unionBounds } from "./bounds.ts";
import { GRAPH_FONT_STYLE } from "./font.ts";
import { textBlock } from "./text-block.ts";
import type { GraphOptions } from "./graphs.ts";
import { renderHandwritten } from "./handwritten.ts";
import {
  registerTarget,
  type RenderTarget,
  type ScenePart,
  type TargetedDrawing,
} from "./targets.ts";
import { TEXT_FIGURE_STYLE } from "./theme.ts";
import { withFigureTitle } from "./titles.ts";

/** Width caps wrapping; the handwritten border hugs the measured text block. */
export function renderTextFigureDrawing(
  input: TextFigure,
  options: GraphOptions,
): TargetedDrawing {
  const figure = textFigureSchema.parse(input);
  const width = options.width ?? 800;
  const height = options.height ?? 520;
  const roughness = options.roughness ?? 1.5;
  const seed = options.seed ?? 10;
  const style = TEXT_FIGURE_STYLE;
  if (
    !/^[a-zA-Z][\w-]*$/.test(options.id) ||
    ![width, height, roughness, seed].every(Number.isFinite) ||
    width <= style.padding * 2 || height <= 0 || roughness < 0
  ) {
    throw new Error(
      "Text rendering needs a simple SVG id, a width greater than 32, positive height, and finite nonnegative roughness.",
    );
  }
  const targets = new Map<string, RenderTarget>();
  const parts: ScenePart[] = [];
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
    strokeDasharray: style.dashArray,
    singlePass: true,
  });
  const borderBounds = border.bounds!;
  parts.push({
    markup: `<g data-text-border="${figure.role}">${border.markup}</g>`,
    bounds: borderBounds,
    obstacles: [{
      bounds: borderBounds,
      kind: "shape",
      ownerId: `${figure.id}.text`,
    }],
  });
  parts.push(registerTarget(targets, `${figure.id}.text`, {
    markup: `<g transform="translate(0 ${cardY})">${body.markup}</g>`,
    bounds: { ...body.bounds!, y: body.bounds!.y + cardY },
  }, "text"));
  return withFigureTitle(
    {
      markup: `<g data-text-role="${figure.role}" style="${GRAPH_FONT_STYLE}">${
        parts.map((part) => part.markup).join("")
      }</g>`,
      bounds: unionBounds(parts.map((part) => part.bounds)),
      targets,
      focusBounds: card,
      obstacles: parts.flatMap((part) => part.obstacles ?? []),
    },
    figure.title,
    figure.id,
    options,
  );
}

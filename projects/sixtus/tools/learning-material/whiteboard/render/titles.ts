import { type Bounds, unionBounds } from "./bounds.ts";
import { renderHandwritten } from "./handwritten.ts";
import {
  registerTarget,
  type ScenePart,
  type TargetedDrawing,
} from "./targets.ts";
import { GRAPH_FONT_STYLE } from "./font.ts";
import { textBlock } from "./text-block.ts";
import { COLORS, LINE_HEIGHT, SPACING, TYPE_SCALE } from "./theme.ts";

type TitleEmphasisOptions = {
  id: string;
  seed?: number;
  roughness?: number;
  color?: string;
};

/** Inset matching annotation box emphasis around the target bounds. */
const TITLE_BOX_PAD = SPACING.titleBoxPadding;

function titlePen(options: TitleEmphasisOptions) {
  return {
    id: options.id,
    seed: options.seed ?? 10,
    roughness: options.roughness ?? 1.5,
    stroke: options.color ?? COLORS.ink,
    strokeWidth: 2,
  };
}

function withTitleMark(
  title: ScenePart,
  mark: ScenePart,
  attr: string,
): ScenePart {
  return {
    markup: title.markup + `<g ${attr}="">${mark.markup}</g>`,
    bounds: unionBounds([title.bounds, mark.bounds]) as Bounds,
    obstacles: [
      ...(title.obstacles ?? []),
      ...(mark.bounds
        ? [{
          bounds: mark.bounds,
          kind: "annotation" as const,
          ownerId: title.obstacles?.[0]?.ownerId,
        }]
        : []),
    ],
  };
}

/** Board titles are measured and drawn in uppercase so bounds match the ink. */
export function boardTitleDisplay(title: string): string {
  return title.toUpperCase();
}

/** Handwritten underline matching annotation emphasis, offset below glyph bottoms. */
export function withTitleUnderline(
  title: ScenePart,
  options: TitleEmphasisOptions,
): ScenePart {
  const b = title.bounds;
  if (!b) return title;
  return withTitleMark(
    title,
    renderHandwritten({
      type: "line",
      x1: b.x,
      y1: b.y + b.height + SPACING.titleUnderlineGap,
      x2: b.x + b.width,
      y2: b.y + b.height + SPACING.titleUnderlineGap,
    }, titlePen(options)),
    "data-figure-title-underline",
  );
}

/** Handwritten box matching annotation emphasis around the title glyphs. */
export function withTitleBox(
  title: ScenePart,
  options: TitleEmphasisOptions,
): ScenePart {
  const b = title.bounds;
  if (!b) return title;
  return withTitleMark(
    title,
    renderHandwritten({
      type: "rectangle",
      x: b.x - TITLE_BOX_PAD,
      y: b.y - TITLE_BOX_PAD,
      width: b.width + TITLE_BOX_PAD * 2,
      height: b.height + TITLE_BOX_PAD * 2,
    }, titlePen(options)),
    "data-board-title-box",
  );
}

/** Place a complete, wrapped heading above the body without rescaling it.
 * The gap is measured from the underline's painted edge. Titles never consume
 * the body allocation, and null titles introduce neither targets nor spacing.
 */
export function withFigureTitle(
  drawing: TargetedDrawing,
  title: string | null,
  namespace: string,
  options: { id: string; width?: number; roughness?: number; seed?: number },
): TargetedDrawing {
  if (title === null || !drawing.bounds) return drawing;
  const body = drawing.bounds;
  const text = textBlock(
    title,
    options.width ?? 800,
    TYPE_SCALE.figureTitle,
    LINE_HEIGHT.figureTitle,
    0,
    0,
    COLORS.ink,
    "center",
  );
  const marked = withTitleUnderline(text, {
    ...options,
    id: `${options.id}-title-underline`,
  });
  const b = marked.bounds!;
  const dx = body.x + body.width / 2 -
    (text.bounds!.x + text.bounds!.width / 2);
  const dy = body.y - SPACING.figureTitleGap - (b.y + b.height);
  const shift = (bounds: Bounds): Bounds => ({
    ...bounds,
    x: bounds.x + dx,
    y: bounds.y + dy,
  });
  const part = registerTarget(
    drawing.targets,
    `${namespace}.title`,
    {
      markup:
        `<g style="${GRAPH_FONT_STYLE}" transform="translate(${dx} ${dy})">${marked.markup}</g>`,
      bounds: shift(b),
      obstacles: [
        { bounds: shift(text.bounds!), kind: "text" },
        ...(marked.obstacles ?? []).map((o) => ({
          ...o,
          bounds: shift(o.bounds),
        })),
      ],
    },
    "text",
    false,
    shift(text.bounds!),
  );
  return {
    ...drawing,
    markup: part.markup + drawing.markup,
    bounds: unionBounds([part.bounds, drawing.bounds]),
    obstacles: [...drawing.obstacles, ...part.obstacles ?? []],
  };
}

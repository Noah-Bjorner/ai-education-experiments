import type { MathExpressions } from "../children/math-expressions.ts";
import { escapeXml } from "../../outdated-visualization/static/shared/svg.ts";
import { type Bounds, type Drawing, unionBounds } from "./bounds.ts";
import {
  fitGraphText,
  GRAPH_FONT_STYLE,
  graphTextBounds,
  measureGraphText,
} from "./font.ts";
import type { GraphOptions } from "./graphs.ts";
import { renderMathLatex } from "./latex.ts";
import {
  registerTarget,
  type RenderTarget,
  type TargetedDrawing,
} from "./targets.ts";
import { COLORS } from "./theme.ts";

/** Baseline-relative layout; painted bounds also include every pen stroke. */
type Box = Drawing & { width: number; ascent: number; descent: number };
function move(
  drawing: Drawing,
  x: number,
  y: number,
  sx = 1,
  sy = sx,
): Drawing {
  const b = drawing.bounds;
  return {
    markup:
      `<g transform="translate(${x} ${y}) scale(${sx} ${sy})">${drawing.markup}</g>`,
    bounds: b &&
      {
        x: x + b.x * sx,
        y: y + b.y * sy,
        width: b.width * sx,
        height: b.height * sy,
      },
  };
}
function box(parts: Drawing[], width: number, ascent = 0, descent = 0): Box {
  const bounds = unionBounds(parts.map((p) => p.bounds));
  return {
    markup: parts.map((p) => p.markup).join(""),
    bounds,
    width,
    ascent: Math.max(ascent, bounds ? -bounds.y : 0),
    descent: Math.max(descent, bounds ? bounds.y + bounds.height : 0),
  };
}
function text(value: string, size: number): Box {
  const bounds = graphTextBounds(value, size, 0, 0);
  return box(
    [{
      markup: `<text font-size="${size}" fill="${COLORS.ink}">${
        escapeXml(value.normalize("NFC"))
      }</text>`,
      bounds,
    }],
    measureGraphText(value, size),
    size * 0.75,
    size * 0.2,
  );
}

export function renderMathExpressionsDrawing(
  child: MathExpressions,
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
  const namespace = child.id ?? options.id;
  const targets = new Map<string, RenderTarget>();
  const rows = child.expressions.map((expression) => {
    try {
      return renderMathLatex(expression.latex, 36);
    } catch (error) {
      throw new Error(
        `Math expression '${expression.id}': ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  });
  const rowGap = 26;
  const naturalHeight =
    rows.reduce((sum, row) => sum + row.ascent + row.descent, 0) +
    rowGap * (rows.length - 1);
  const naturalWidth = Math.max(
    ...rows.map((row) =>
      Math.max(row.width, (row.bounds?.x ?? 0) + (row.bounds?.width ?? 0)) -
      Math.min(0, row.bounds?.x ?? 0)
    ),
  );
  const scale = Math.min(
    1,
    (width - 64) / naturalWidth,
    (height - 110) / naturalHeight,
  );
  if (!Number.isFinite(scale) || scale * 36 < 18) {
    throw new Error(
      "Math expressions do not fit legibly; increase the board size or split the content into fewer or shorter rows.",
    );
  }
  const title = text(fitGraphText(child.title, 25, width - 48), 25);
  const parts = [registerTarget(targets, `${namespace}.title`, {
    ...move(title, (width - title.width) / 2, 38),
    markup: `<title>${escapeXml(child.title)}</title>${
      move(title, (width - title.width) / 2, 38).markup
    }`,
  }, "text")];
  let y = 78;
  rows.forEach((row, i) => {
    y += row.ascent * scale;
    parts.push(
      registerTarget(
        targets,
        `${namespace}.${child.expressions[i].id}.expression`,
        {
          ...move(row, (width - row.width * scale) / 2, y, scale),
          markup: `<g aria-label="${escapeXml(child.expressions[i].latex)}">${
            move(row, (width - row.width * scale) / 2, y, scale).markup
          }</g>`,
        },
        "text",
      ),
    );
    y += (row.descent + rowGap) * scale;
  });
  const bounds = unionBounds(parts.map((part) => part.bounds))!;
  const focusBounds: Bounds = unionBounds(
    parts.slice(1).map((part) => part.bounds),
  )!;
  return {
    markup: `<g style="${GRAPH_FONT_STYLE};color:${COLORS.ink}">${
      parts.map((p) => p.markup).join("")
    }</g>`,
    bounds,
    targets,
    focusBounds,
    obstacles: parts.flatMap((p) => p.obstacles ?? []),
  };
}

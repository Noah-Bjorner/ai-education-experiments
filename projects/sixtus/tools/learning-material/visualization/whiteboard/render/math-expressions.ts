import type { MathExpressions } from "../children/math-expressions.ts";
import { escapeXml } from "../../static/shared/svg.ts";
import { type Bounds, type Drawing, unionBounds } from "./bounds.ts";
import {
  fitGraphText,
  GRAPH_FONT_STYLE,
  graphTextBounds,
  measureGraphText,
} from "./font.ts";
import type { GraphOptions } from "./graphs.ts";
import { renderHandwritten } from "./handwritten.ts";
import { type MathNode, parseMathLatex } from "./latex.ts";
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
  let sequence = 0;
  const line = (x1: number, y1: number, x2: number, y2: number, size: number) =>
    renderHandwritten({ type: "line", x1, y1, x2, y2 }, {
      id: `${options.id}-math-${sequence}`,
      seed: seed + sequence++,
      roughness: Math.min(roughness, size * 0.025),
      stroke: COLORS.ink,
      strokeWidth: size * 0.045,
    });
  const operator = (value: string, s: number): Box => {
    const left = s * 0.15, right = s * 0.7, mid = (left + right) / 2;
    const axis = -s * 0.28, half = s * 0.21;
    const parts: Drawing[] = [];
    const stroke = (x1: number, y1: number, x2: number, y2: number) =>
      parts.push(line(x1, y1, x2, y2, s));
    const horizontal = (y: number) => stroke(left, y, right, y);
    const dot = (y: number) => {
      const r = s * 0.035;
      parts.push({
        markup: `<circle cx="${mid}" cy="${y}" r="${r}" fill="${COLORS.ink}"/>`,
        bounds: { x: mid - r, y: y - r, width: r * 2, height: r * 2 },
      });
    };
    if (value === "=" || value === "≠") {
      horizontal(axis - s * 0.09);
      horizontal(axis + s * 0.09);
      if (value === "≠") {
        stroke(
          mid - s * 0.15,
          axis + half * 1.4,
          mid + s * 0.15,
          axis - half * 1.4,
        );
      }
    } else if (["<", ">", "≤", "≥"].includes(value)) {
      const reverse = value === ">" || value === "≥";
      stroke(reverse ? left : right, axis - half, reverse ? right : left, axis);
      stroke(reverse ? right : left, axis, reverse ? left : right, axis + half);
      if (value === "≤" || value === "≥") horizontal(axis + half + s * 0.12);
    } else if (value === "×") {
      stroke(left, axis - half, right, axis + half);
      stroke(left, axis + half, right, axis - half);
    } else if (value === "·") dot(axis);
    else {
      horizontal(axis);
      if (value === "+" || value === "±") {
        stroke(mid, axis - half, mid, axis + half);
      }
      if (value === "±") horizontal(axis + half + s * 0.14);
      if (value === "÷") {
        dot(axis - half);
        dot(axis + half);
      }
    }
    return box(parts, s * 0.85, s * 0.75, s * 0.2);
  };
  const layout = (node: MathNode, s: number): Box => {
    switch (node.kind) {
      case "text":
        return text(node.value, s);
      case "space":
        return box([], s * node.em);
      case "operator":
        return operator(node.value, s);
      case "row": {
        let x = 0;
        const parts: Drawing[] = [];
        let ascent = 0, descent = 0;
        for (const child of node.children) {
          const b = layout(child, s);
          parts.push(move(b, x, 0));
          x += b.width;
          ascent = Math.max(ascent, b.ascent);
          descent = Math.max(descent, b.descent);
        }
        return box(parts, x, ascent, descent);
      }
      case "fraction": {
        const n = layout(node.numerator, s * 0.85),
          d = layout(node.denominator, s * 0.85);
        const w = Math.max(n.width, d.width) + s * 0.3,
          axis = -s * 0.28,
          gap = s * 0.16;
        const ny = axis - gap - n.descent, dy = axis + gap + d.ascent;
        return box(
          [
            move(n, (w - n.width) / 2, ny),
            move(d, (w - d.width) / 2, dy),
            line(0, axis, w, axis, s),
          ],
          w,
          -ny + n.ascent,
          dy + d.descent,
        );
      }
      case "scripts": {
        const base = layout(node.base, s), parts: Drawing[] = [base];
        const sup = node.sup && layout(node.sup, s * 0.65),
          sub = node.sub && layout(node.sub, s * 0.65);
        const x = base.width + s * 0.06;
        if (sup) {
          parts.push(
            move(
              sup,
              x,
              -Math.max(s * 0.5, base.ascent - s * 0.25) - sup.descent,
            ),
          );
        }
        if (sub) {
          parts.push(
            move(
              sub,
              x,
              Math.max(base.descent + s * 0.12, s * 0.2) + sub.ascent,
            ),
          );
        }
        return box(
          parts,
          x + Math.max(sup?.width ?? 0, sub?.width ?? 0),
          base.ascent,
          base.descent,
        );
      }
      case "root": {
        const body = layout(node.body, s),
          index = node.index && layout(node.index, s * 0.5);
        const offset = index ? Math.max(0, index.width - s * 0.24) : 0;
        const x = offset + s * 0.65,
          top = -body.ascent - s * 0.14,
          bottom = body.descent;
        const parts = [
          move(body, x, 0),
          line(offset, -s * 0.15, offset + s * 0.16, -s * 0.25, s),
          line(offset + s * 0.16, -s * 0.25, offset + s * 0.32, bottom, s),
          line(offset + s * 0.32, bottom, offset + s * 0.57, top, s),
          line(offset + s * 0.57, top, x + body.width + s * 0.08, top, s),
        ];
        if (index) parts.push(move(index, 0, top + s * 0.2));
        return box(parts, x + body.width + s * 0.14, -top, bottom);
      }
      case "delimited": {
        const body = layout(node.body, s),
          left = text(node.left, s),
          right = text(node.right, s);
        const top = -body.ascent - s * 0.08,
          h = body.ascent + body.descent + s * 0.16;
        const stretch = (b: Box, x: number): Drawing => {
          const bounds = b.bounds!;
          const sy = h / bounds.height;
          return move(b, x, top - bounds.y * sy, 1, sy);
        };
        const gap = s * 0.08;
        return box(
          [
            stretch(left, 0),
            move(body, left.width + gap, 0),
            stretch(right, left.width + gap * 2 + body.width),
          ],
          left.width + right.width + gap * 2 + body.width,
          -top,
          top + h,
        );
      }
    }
  };
  const namespace = child.id ?? options.id;
  const targets = new Map<string, RenderTarget>();
  const rows = child.expressions.map((expression) => {
    try {
      return layout(parseMathLatex(expression.latex), 36);
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
    markup: `<g style="${GRAPH_FONT_STYLE}">${
      parts.map((p) => p.markup).join("")
    }</g>`,
    bounds,
    targets,
    focusBounds,
    obstacles: parts.flatMap((p) => p.obstacles ?? []),
  };
}

import { handwritten } from "./handwritten.ts";
import { renderShape, type Shape } from "./shapes.ts";
import { COLORS, SERIES_COLORS } from "./theme.ts";

// Edit these shapes or the column settings, then rerun this file.
const shapes: Shape[] = [
  { type: "circle", cx: 135, cy: 90, r: 62 },
  { type: "rectangle", x: 52, y: 30, width: 166, height: 116 },
  { type: "line", x1: 42, y1: 90, x2: 228, y2: 55 },
];
const columns = [
  { label: "Regular", roughness: 0, hatchGap: 9 },
  { label: "Light pen", roughness: 1.8, hatchGap: 9 },
  { label: "Loose sketch", roughness: 4, hatchGap: 12 },
];
const colors = [SERIES_COLORS[0], SERIES_COLORS[1], SERIES_COLORS[0]];
const cells = columns.map((column, col) => {
  const examples = shapes.map((shape, row) => {
    const markup = col === 0
      ? renderShape(shape, row === 2 ? "none" : "#e9eff5")
      : handwritten(shape, {
        id: `shape-${col}-${row}`,
        seed: row + 10,
        roughness: column.roughness,
        hatchGap: column.hatchGap,
        fill: colors[row],
      });
    return `<g transform="translate(0 ${row * 190 + 130})">${markup}</g>`;
  }).join("\n");
  return `<g transform="translate(${col * 300 + 35} 0)">
    <text x="135" y="115" text-anchor="middle" font-size="17" font-weight="600">${column.label}</text>
    ${examples}
  </g>`;
}).join("\n");

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="940" height="745" viewBox="0 0 940 745" role="img" aria-labelledby="title description">
  <title id="title">Hand-drawn shapes experiment</title>
  <desc id="description">The same circle, rectangle, and line drawn regularly, with a light pen effect, and with a loose sketch effect. Hand-drawn shapes have diagonal hatch fills.</desc>
  <rect width="940" height="745" fill="#fffdf9"/>
  <g font-family="system-ui, sans-serif" fill="${COLORS.ink}">
    <text x="40" y="48" font-size="25" font-weight="600">One shape, three treatments</text>
    <text x="40" y="76" font-size="14" fill="${COLORS.textMuted}">Same geometry · seeded border wobble · clipped diagonal fill</text>
    ${cells}
    <text x="40" y="715" font-size="13" fill="${COLORS.textMuted}">Change roughness, hatchGap, fill, or seed in handwritten-demo.ts and rerun.</text>
  </g>
</svg>`;

if (import.meta.main) {
  const output = new URL("./handwritten-demo.svg", import.meta.url);
  await Deno.writeTextFile(output, svg);
  console.log(`Wrote ${output.pathname}`);
}

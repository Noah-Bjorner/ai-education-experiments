// Run from this directory: deno test --allow-read=fonts bounds-test.ts
import {
  cubicBounds,
  exportBounds,
  rotateLabel,
  unionBounds,
} from "./bounds.ts";
import { graphTextBounds } from "./font.ts";
import { handwritten, renderHandwritten } from "./handwritten.ts";
import { type PieChart, renderGraphSvg } from "./graphs.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("Bezier bounds include curve extrema without counting unused control points", () => {
  const b = cubicBounds({ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, {
    x: 100,
    y: 0,
  });
  assert(
    b.x === 0 && b.y === 0 && b.width === 100 && b.height === 75,
    "The arch peaks at 75, not its control-point height of 100",
  );
});

Deno.test("pen bounds include full stroke width and ignore clipped hatch excess", () => {
  const line = renderHandwritten({
    type: "line",
    x1: -10,
    y1: 0,
    x2: 90,
    y2: 0,
  }, { id: "line", roughness: 0, strokeWidth: 4 });
  assert(
    JSON.stringify(line.bounds) ===
      JSON.stringify({ x: -12, y: -2, width: 104, height: 4 }),
    "Include round caps and stroke thickness",
  );
  const circle = { type: "circle", cx: 0, cy: 0, r: 60 } as const;
  const options = { id: "circle", roughness: 4, seed: 29 };
  const empty = renderHandwritten(circle, options);
  const filled = renderHandwritten(circle, { ...options, fill: "blue" });
  assert(
    JSON.stringify(empty.bounds) === JSON.stringify(filled.bounds),
    "Clipped diagonal fill must not expand the shape's export",
  );
  assert(
    empty.markup === handwritten(circle, options),
    "Keep the original string API compatible",
  );
});

Deno.test("glyph bounds include descenders, respect anchors, and omit whitespace", () => {
  const b = graphTextBounds("gj", 25, 0, 0)!;
  assert(b.y + b.height > 0, "Descenders paint below the baseline");
  const middle = graphTextBounds("gj", 25, 0, 0, "middle")!;
  assert(
    middle.x < b.x && middle.width === b.width,
    "Text anchoring shifts rather than resizes the bounds",
  );
  assert(
    graphTextBounds("   ", 25, 0, 0) === null,
    "Spaces must not enlarge painted bounds",
  );
  let rejected = false;
  try {
    graphTextBounds("Δ", 25, 0, 0);
  } catch {
    rejected = true;
  }
  assert(rejected, "Do not guess the bounds of an unavailable fallback font");
});

Deno.test("fill variation preserves the border and is reproducible per region", () => {
  const shape = { type: "circle", cx: 0, cy: 0, r: 60 } as const;
  const options = { id: "region", seed: 10, fill: "blue" };
  const a = renderHandwritten(shape, options);
  const b = renderHandwritten(shape, { ...options, fillSeed: 99 });
  const recolored = renderHandwritten(shape, { ...options, fill: "orange" });
  const hatch = (svg: string) => /<path d="([^"]+)" clip-path=/.exec(svg)![1];
  const clip = (svg: string) =>
    /<clipPath[^>]+><path d="([^"]+)"/.exec(svg)![1];
  assert(
    a.markup === renderHandwritten(shape, options).markup,
    "Same region must not flicker between renders",
  );
  assert(
    hatch(a.markup) !== hatch(b.markup),
    "Fill seed must change actual line geometry",
  );
  assert(
    hatch(a.markup) !== hatch(recolored.markup),
    "Recoloring should also vary the strokes",
  );
  assert(
    clip(a.markup) === clip(b.markup),
    "Fill variation must preserve the clipping outline",
  );
  assert(
    JSON.stringify(a.bounds) === JSON.stringify(b.bounds),
    "Fill variation must preserve tight outer bounds",
  );
});

Deno.test("rotated labels and fractional exports retain the complete bounds", () => {
  const rotated = rotateLabel(
    { markup: "", bounds: { x: -3, y: -8, width: 30, height: 11 } },
    40,
    70,
  );
  assert(
    JSON.stringify(rotated.bounds) ===
      JSON.stringify({ x: 32, y: 43, width: 11, height: 30 }),
    "Match translate followed by -90 degree rotation",
  );
  const original = { x: -0.0004, y: 0.0004, width: 100.0002, height: 50.0002 };
  const b = exportBounds(unionBounds([null, original]));
  assert(b.x <= original.x && b.y <= original.y, "Never round left/top inward");
  assert(
    b.x + b.width >= original.x + original.width &&
      b.y + b.height >= original.y + original.height,
    "Never round right/bottom inward",
  );
  assert(
    b.width - original.width < 0.002 && b.height - original.height < 0.002,
    "Do not add hidden padding",
  );
});

Deno.test("pie export follows legend content instead of a fixed canvas", () => {
  const chart: PieChart = {
    type: "pie_chart",
    title: "Books",
    slices: [{ label: "Fiction", value: 12 }, { label: "Poetry", value: 8 }],
  };
  const short = renderGraphSvg(chart, { id: "short" });
  const long = renderGraphSvg({
    ...chart,
    slices: [
      { label: "A much longer category label", value: 12 },
      chart.slices[1],
    ],
  }, { id: "long" });
  assert(
    short.width < 600 && short.height < 520,
    "Remove the default pie canvas's empty margins",
  );
  assert(
    long.width > short.width,
    "A longer visible legend should grow the export",
  );
  const viewBox = /viewBox="([^"]+)"/.exec(short.svg)![1].split(" ").map(
    Number,
  );
  assert(
    viewBox[2] === short.width && viewBox[3] === short.height,
    "Intrinsic size must match the measured viewBox",
  );
});

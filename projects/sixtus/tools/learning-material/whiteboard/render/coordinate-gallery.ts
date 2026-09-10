import {
  type CoordinatePlot,
  coordinatePlot,
} from "../children/coordinate-plot.ts";
import { renderWhiteboardSvg } from "./index.ts";
import { escapeXml } from "./svg.ts";

const base: CoordinatePlot = {
  type: "coordinate_plot",
  id: "plot",
  title: "Coordinate plane",
  axes: { x: { min: -5, max: 5 }, y: { min: -4, max: 4 } },
  elements: [],
};
export const coordinateExamples: CoordinatePlot[] = [
  coordinatePlot.example.output,
  {
    ...base,
    id: "functions",
    title: "Functions and asymptotes",
    elements: [
      {
        type: "function",
        id: "reciprocal",
        expression: "1/(x-0.3)",
        label: "1/(x − 0.3)",
      },
      {
        type: "line",
        id: "asymptote",
        from: [0.3, 0],
        to: [0.3, 1],
        extend: "both",
        stroke: "dashed",
        label: "x = 0.3",
      },
      { type: "function", id: "root", expression: "sqrt(x)", label: "√x" },
    ],
  },
  {
    ...base,
    id: "piecewise",
    title: "Piecewise functions and endpoints",
    elements: [
      {
        type: "function",
        id: "left",
        expression: "-x",
        domain: [{ min: -4, max: 0, includeMin: true, includeMax: false }],
        endpointMarkers: true,
        label: "−x for x < 0",
      },
      {
        type: "function",
        id: "right",
        expression: "x+1",
        domain: [{ min: 0, max: 3, includeMin: true, includeMax: false }],
        endpointMarkers: true,
        label: "x + 1 for x ≥ 0",
      },
    ],
  },
  {
    ...base,
    id: "geometry",
    title: "Coordinate geometry",
    elements: [
      { type: "circle", id: "unit", center: [0, 0], radius: 2, label: "r = 2" },
      {
        type: "polygon",
        id: "triangle",
        vertices: [[-4, -3], [-1, -3], [-4, -1]],
        label: "Triangle",
      },
      {
        type: "line",
        id: "vector",
        from: [0, 0],
        to: [3, 2],
        extend: "neither",
        arrowheads: "end",
        label: "v",
      },
      { type: "point", id: "a", position: [3, 2], label: "A(3, 2)" },
    ],
  },
  {
    ...base,
    id: "trig",
    title: "Trigonometric functions",
    axes: {
      x: {
        min: -Math.PI,
        max: Math.PI,
        ticks: [
          { value: -Math.PI, label: "−π" },
          { value: -Math.PI / 2, label: "−π/2" },
          { value: 0, label: "0" },
          { value: Math.PI / 2, label: "π/2" },
          { value: Math.PI, label: "π" },
        ],
      },
      y: { min: -2, max: 2 },
      scale: "independent",
    },
    elements: [
      { type: "function", id: "sine", expression: "sin(x)", label: "sin(x)" },
      {
        type: "function",
        id: "tangent",
        expression: "tan(x)",
        label: "tan(x)",
        stroke: "dashed",
      },
    ],
  },
  {
    ...base,
    id: "annotated",
    title: "The roots of a quadratic",
    elements: [
      { type: "function", id: "curve", expression: "x^2-4", label: "x² − 4" },
      { type: "point", id: "root", position: [2, 0], label: "(2, 0)" },
    ],
    annotations: [{
      type: "arrow",
      targetIds: ["annotated.root.mark"],
      content: "Here, y = 0",
    }],
  },
  { ...base, id: "blank", title: "Plot the points on this grid" },
  {
    ...base,
    id: "independent",
    title: "A different scale on each axis",
    axes: {
      x: { min: 10, max: 20, label: "Time (s)" },
      y: { min: 100, max: 200, label: "Distance (m)" },
      scale: "independent",
    },
    elements: [{
      type: "function",
      id: "distance",
      expression: "10*x",
      label: "d = 10t",
    }],
  },
];

if (import.meta.main) {
  const directory = new URL("./output-ex/coordinates/", import.meta.url);
  await Deno.mkdir(directory, { recursive: true });
  for (const example of coordinateExamples) {
    const board = { layout: "single" as const, children: [example] };
    const result = renderWhiteboardSvg(board);
    await Deno.writeTextFile(
      new URL(`${example.id}.svg`, directory),
      result.svg,
    );
    await Deno.writeTextFile(
      new URL(`${example.id}.json`, directory),
      JSON.stringify(board, null, 2),
    );
  }
  await Deno.writeTextFile(
    new URL("index.html", directory),
    `<!doctype html><meta charset="utf-8"><title>Coordinate plot gallery</title><style>body{font:16px system-ui;background:#f7f6f3;margin:24px;color:#111}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0;padding:24px;background:white}figure:nth-child(even){background:#eef5fc}img{display:block;width:100%;height:auto}figcaption{margin-top:16px}a{color:#2459ae}</style><h1>Coordinate plots</h1><main>${
      coordinateExamples.map((e) =>
        `<figure><img src="${e.id}.svg" alt="${
          escapeXml(e.title)
        }"><figcaption><a href="${e.id}.json">${e.id} spec</a> · <a href="${e.id}.svg">SVG</a></figcaption></figure>`
      ).join("")
    }</main>`,
  );
  console.log(new URL("index.html", directory).pathname);
}

import { boardExample } from "./board-example.ts";
import { type Distribution, distribution } from "../figures/distribution.ts";
import { renderWhiteboardSvg } from "./index.ts";
import { escapeXml } from "./svg.ts";

export const distributionExamples: Distribution[] = [
  distribution.example.output,
  {
    type: "distribution",
    id: "histogram",
    title: "Quiz scores",
    annotations: [{
      type: "highlight",
      targetIds: ["high"],
      text: null,
    }],
    chartStyle: "histogram",
    xLabel: "Score",
    yLabel: "Students",
    bins: [
      { id: "low", start: 50, end: 60, count: 2 },
      { id: "mid-low", start: 60, end: 70, count: 5 },
      { id: "mid", start: 70, end: 80, count: 9 },
      { id: "high", start: 80, end: 90, count: 6 },
      { id: "top", start: 90, end: 100, count: 3 },
    ],
  },
  {
    type: "distribution",
    id: "dot-plot",
    title: "Siblings",
    annotations: [],
    chartStyle: "dot_plot",
    xLabel: "Number of siblings",
    yLabel: null,
    stacks: [
      { id: "none", x: 0, count: 4 },
      { id: "one", x: 1, count: 8 },
      { id: "two", x: 2, count: 6 },
      { id: "three", x: 3, count: 2 },
      { id: "five", x: 5, count: 1 },
    ],
  },
  {
    type: "distribution",
    id: "box",
    title: "Two class quizzes",
    annotations: [{
      type: "callout",
      targetIds: ["class-b"],
      text: "Higher median",
    }],
    chartStyle: "box",
    xLabel: "Class",
    yLabel: "Score",
    groups: [
      {
        id: "class-a",
        name: "Class A",
        min: 48,
        q1: 62,
        median: 71,
        q3: 80,
        max: 92,
        outliers: [{ id: "a-low", value: 31 }],
      },
      {
        id: "class-b",
        name: "Class B",
        min: 55,
        q1: 70,
        median: 81,
        q3: 88,
        max: 97,
      },
    ],
  },
  {
    type: "distribution",
    id: "two-normals",
    title: "A wider spread",
    annotations: [],
    chartStyle: "density",
    xLabel: "x",
    yLabel: null,
    curves: [
      { id: "narrow", name: "N(0, 1)", family: "normal", mean: 0, sd: 1 },
      { id: "wide", name: "N(0, 2)", family: "normal", mean: 0, sd: 2 },
    ],
    guides: [
      { id: "mu", at: 0, label: "μ" },
    ],
  },
];

if (import.meta.main) {
  const directory = new URL("./output-ex/distribution/", import.meta.url);
  await Deno.mkdir(directory, { recursive: true });
  for (const example of distributionExamples) {
    const board = boardExample([example]);
    const result = renderWhiteboardSvg(board);
    await Deno.writeTextFile(
      new URL(`${example.id}.svg`, directory),
      result.svg,
    );
    await Deno.writeTextFile(
      new URL(`${example.id}.json`, directory),
      JSON.stringify(board, null, 2) + "\n",
    );
  }
  await Deno.writeTextFile(
    new URL("index.html", directory),
    `<!doctype html>
<meta charset="utf-8"><title>Distribution gallery</title>
<style>body{font:16px system-ui;margin:32px;background:#faf9f6;color:#111}h1{font-size:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(580px,1fr));gap:24px}figure{margin:0;padding:24px;background:white}figure:nth-child(even){background:#edf5ff}img{display:block;width:100%;height:auto}figcaption{margin-top:20px}a{color:#2459ae}</style>
<h1>Whiteboard distributions</h1>
<p>Histogram, dot plot, box plot, and density curves. Edit distribution-gallery.ts for data; render/distribution.ts for appearance.</p>
<main>${
      distributionExamples.map((example) =>
        `<figure><img src="${example.id}.svg" alt="${
          escapeXml(example.title ?? example.id ?? "distribution")
        }"><figcaption>${example.id} · <a href="${example.id}.json">Spec</a> · <a href="${example.id}.svg">SVG</a></figcaption></figure>`
      ).join("")
    }</main>`,
  );
  console.log(new URL("index.html", directory).pathname);
}

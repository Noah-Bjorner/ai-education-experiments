import { boardExample } from "./board-example.ts";
/** Edit these specs and rerun: deno run --allow-read --allow-write charts-gallery.ts */
import { type Graph, renderGraphSvg } from "./graphs.ts";

export const chartExamples: Graph[] = [
  ...(["line", "bar", "scatter", "area"] as const).map((chartStyle) => ({
    type: "xy_chart" as const,
    id: chartStyle,
    chartStyle,
    title: `${chartStyle[0].toUpperCase()}${
      chartStyle.slice(1)
    } · Illustrative results`,
    xLabel: chartStyle === "bar" ? "Quarter" : "Time",
    yLabel: "Change",
    series: [
      {
        id: "alpha",
        name: "Alpha",
        points: [2, 6, -2, 8].map((y, i) => ({
          id: `a-${i}`,
          x: chartStyle === "bar" ? `Q${i + 1}` : i + 1,
          y,
        })),
      },
      {
        id: "beta",
        name: "Beta",
        points: [4, 3, 5, 6].map((y, i) => ({
          id: `b-${i}`,
          x: chartStyle === "bar" ? `Q${i + 1}` : i + 1,
          y,
        })),
      },
    ],
  })),
  ...(["pie", "donut"] as const).map((chartStyle) => ({
    type: "pie_chart" as const,
    id: chartStyle,
    chartStyle,
    title: `${chartStyle[0].toUpperCase()}${
      chartStyle.slice(1)
    } · Book collection`,
    slices: [
      {
        id: "fiction",
        label: "Fiction",
        value: 12,
      },
      {
        id: "nonfiction",
        label: "Nonfiction",
        value: 8,
      },
    ],
  })),
];

if (import.meta.main) {
  const directory = new URL("./output-ex/charts/", import.meta.url);
  await Deno.mkdir(directory, { recursive: true });
  for (const chart of chartExamples) {
    const { svg } = renderGraphSvg(chart, { id: `gallery-${chart.id}` });
    await Deno.writeTextFile(new URL(`${chart.id}.svg`, directory), svg);
    await Deno.writeTextFile(
      new URL(`${chart.id}.json`, directory),
      JSON.stringify(boardExample([chart]), null, 2) + "\n",
    );
  }
  await Deno.writeTextFile(
    new URL("index.html", directory),
    `<!doctype html>
<meta charset="utf-8"><title>Whiteboard chart gallery</title>
<style>body{font:16px system-ui;margin:32px;background:#faf9f6;color:#111}h1{font-size:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(580px,1fr));gap:24px}figure{margin:0;padding:24px;background:white}figure:nth-child(even){background:#edf5ff}img{display:block;width:100%;height:auto}figcaption{margin-top:20px}a{color:#2459ae}</style>
<h1>Whiteboard charts — first version</h1><p>Edit charts-gallery.ts for data; graphs.ts and theme.ts for appearance. Examples use white and tinted surfaces.</p><main>${
      chartExamples.map((chart) =>
        `<figure><img src="${chart.id}.svg" alt="${
          chart.title ?? chart.id ?? "chart"
        }"><figcaption>${chart.id} · <a href="${chart.id}.json">Spec</a> · <a href="${chart.id}.svg">SVG</a></figcaption></figure>`
      ).join("")
    }</main>`,
  );
  console.log(new URL("index.html", directory).pathname);
}

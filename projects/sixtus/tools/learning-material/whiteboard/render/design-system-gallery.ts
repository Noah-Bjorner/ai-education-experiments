/** Browser review: all figures use one scale, plus a mixed annotated board. */
import { whiteboardFigures } from "../figures/index.ts";
import { renderWhiteboardSvg } from "./index.ts";
import { WhiteboardOutput } from "../schema.ts";
import { escapeXml } from "./svg.ts";

if (import.meta.main) {
  const out = "/tmp/whiteboard-design-system";
  await Deno.mkdir(out, { recursive: true });
  const figures = whiteboardFigures.map((definition) => ({
    ...definition.example.output,
    annotations: definition.example.output.type === "math_expressions"
      ? [{
        type: "arrow",
        targetIds: [`${definition.example.output.id}.answer.expression`],
        content: "The solution",
      }]
      : [],
  }));
  const sections: string[] = [];
  for (const figure of figures) {
    const result = renderWhiteboardSvg(
      WhiteboardOutput.parse({
        title: null,
        figures: [{ ...figure, anchor: null, side: null }],
      }),
    );
    await Deno.writeTextFile(`${out}/${figure.type}.svg`, result.svg);
    sections.push(
      `<section><h2>${escapeXml(figure.type)}</h2><img width="${
        result.width * 0.8
      }" src="${figure.type}.svg"></section>`,
    );
  }
  const mixed = WhiteboardOutput.parse({
    title: "A consistent whiteboard",
    figures: figures.map((figure, i) => ({
      ...figure,
      anchor: i === 0 ? null : i % 2 ? figures[i - 1].id : figures[i - 2].id,
      side: i === 0 ? null : i % 2 ? "right" : "bottom",
    })),
  });
  const board = renderWhiteboardSvg(mixed);
  await Deno.writeTextFile(`${out}/mixed.svg`, board.svg);
  const long = renderWhiteboardSvg(
    WhiteboardOutput.parse({
      title: "Wrapped titles preserve the drawing",
      figures: [{
        ...figures[0],
        title:
          "A longer figure heading that wraps to multiple lines while keeping the same text size and a measured gap above the chart"
            .repeat(2),
        anchor: null,
        side: null,
      }],
    }),
  );
  await Deno.writeTextFile(`${out}/long-title.svg`, long.svg);
  await Deno.writeTextFile(
    `${out}/index.html`,
    `<!doctype html><meta charset="utf-8"><title>Whiteboard design system</title><style>body{margin:32px;font:16px system-ui;background:#f8f8f6;color:#111}h1{font-size:24px}h2{font-size:14px;color:#666}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:40px}section{overflow:auto;padding:24px;background:white;border:1px solid #ddd}img{display:block;height:auto}.board{width:100%}</style><h1>Shared typography and spacing</h1><p>Individual figures at 80% of SVG units. Scroll panels when needed; no independent fit-to-width scaling.</p><main>${
      sections.join("")
    }</main><h2>Mixed board, fitted to available width</h2><img class="board" src="mixed.svg"><h2>Wrapped headings</h2><img width="800" src="long-title.svg">`,
  );
  console.log(`${out}/index.html`);
}

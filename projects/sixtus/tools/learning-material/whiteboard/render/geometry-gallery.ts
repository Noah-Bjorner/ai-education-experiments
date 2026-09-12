import { boardExample } from "./board-example.ts";
import { geometryExamples } from "./geometry-examples.ts";
import { renderWhiteboardSvg } from "./index.ts";
import { escapeXml } from "./svg.ts";

const dir = new URL("./output-ex/geometry/", import.meta.url);
await Deno.mkdir(dir, { recursive: true });
const cards: string[] = [];
for (const example of geometryExamples) {
  const result = renderWhiteboardSvg(
    boardExample([example]),
    { id: example.id },
  );
  await Deno.writeTextFile(new URL(`${example.id}.svg`, dir), result.svg);
  cards.push(
    `<article><h2>${
      escapeXml(example.title ?? example.id ?? "geometry")
    }</h2><img src="${example.id}.svg" alt="${
      escapeXml(example.title ?? example.id ?? "geometry")
    }"></article>`,
  );
}
await Deno.writeTextFile(
  new URL("index.html", dir),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Geometry render examples</title><style>body{margin:32px;background:#f4f3f0;font-family:system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:24px}article{background:white;padding:24px;border-radius:12px}h1{font-size:24px}h2{font-size:16px}img{width:100%;height:auto;display:block}</style><h1>Geometry render examples</h1><main>${
    cards.join("")
  }</main></html>`,
);
console.log(new URL("index.html", dir).pathname);

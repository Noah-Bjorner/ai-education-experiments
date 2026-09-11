import { freeformExamples } from "./freeform-examples.ts";
import { renderWhiteboardSvg } from "./index.ts";
import { escapeXml } from "./svg.ts";

const dir = new URL("./output-ex/freeform/", import.meta.url);
await Deno.mkdir(dir, { recursive: true });
for (const child of freeformExamples) {
  const spec = { layout: "single" as const, children: [child] };
  await Deno.writeTextFile(
    new URL(`${child.id}.json`, dir),
    JSON.stringify(spec, null, 2) + "\n",
  );
  await Deno.writeTextFile(
    new URL(`${child.id}.svg`, dir),
    renderWhiteboardSvg(spec).svg,
  );
}
await Deno.writeTextFile(
  new URL("index.html", dir),
  `<!doctype html><meta charset="utf-8"><title>Freeform review gallery</title><style>body{font:16px system-ui;margin:32px;background:#eee}section{margin:32px 0}.views{display:grid;grid-template-columns:1fr 1fr;gap:16px}.view{padding:16px;background:white}.tinted{background:#faf5e9}img{width:100%;height:auto}</style><h1>Freeform whiteboards</h1>${
    freeformExamples.map((c) =>
      `<section><h2>${
        escapeXml(c.title)
      }</h2><div class="views"><div class="view"><img src="${c.id}.svg" alt="${
        escapeXml(c.title)
      }"></div><div class="view tinted"><img src="${c.id}.svg" alt="${
        escapeXml(c.title)
      } on tinted background"></div></div></section>`
    ).join("")
  }`,
);
console.log(dir.pathname);

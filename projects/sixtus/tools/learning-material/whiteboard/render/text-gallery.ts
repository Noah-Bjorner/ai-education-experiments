import { renderWhiteboardSvg } from "./index.ts";
import { textExamples } from "./text-examples.ts";

if (import.meta.main) {
  const directory = new URL("./output-ex/text/", import.meta.url);
  await Deno.mkdir(directory, { recursive: true });
  for (const { id, board } of textExamples) {
    const result = renderWhiteboardSvg(board);
    await Deno.writeTextFile(new URL(`${id}.svg`, directory), result.svg);
    await Deno.writeTextFile(
      new URL(`${id}.json`, directory),
      JSON.stringify(board, null, 2) + "\n",
    );
  }
  await Deno.writeTextFile(
    new URL("index.html", directory),
    `<!doctype html>
<meta charset="utf-8"><title>Text figure gallery</title>
<style>body{font:16px system-ui;background:#f7f6f3;margin:24px;color:#111}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:24px;align-items:start}figure{margin:0;padding:24px;background:white}figure:nth-child(even){background:#eef5fc}img{display:block;max-width:100%;height:auto}figcaption{margin-top:16px}a{color:#2459ae}</style>
<h1>Text figures</h1><p>Handwritten dashed borders hug the text. All roles share typography and spacing. Questions precede their answers; notes and takeaways follow.</p>
<main>${
      textExamples.map(({ id }) =>
        `<figure><img src="${id}.svg" alt="${id} text figure example"><figcaption><a href="${id}.json">${id} spec</a> · <a href="${id}.svg">SVG</a></figcaption></figure>`
      ).join("")
    }</main>`,
  );
  console.log(new URL("index.html", directory).pathname);
}

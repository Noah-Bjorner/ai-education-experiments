import { applyDrawingAnimation } from "./index.ts";

if (import.meta.main) {
  const svg = await Deno.readTextFile(new URL("./fixtures/graph.svg", import.meta.url));
  const animation = applyDrawingAnimation(svg, { speed: 1.5 });
  //console.log(animation);
  const randomId = Math.random().toString(36).substring(2, 15);
  const fileName = `equation-animation-${randomId}.svg`;
  await Deno.writeTextFile(new URL(`./output/${fileName}`, import.meta.url), animation);
  console.log(`Saved animation to ${fileName}`);
}
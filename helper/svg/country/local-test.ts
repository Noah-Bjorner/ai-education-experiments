import { map } from "./index.ts";
import type { MapOptions } from "./index.ts";

const options = {
  target: { type: "region", region: "europe" },
  fidelity: "low",
  units: "country",
  year: 2016,
  focus: ["France"],
  routes: [{ from: "France", to: "Algeria", mode: "sea" }],
};

if (import.meta.main) {
  const start = performance.now();
  const svg = await map(options as MapOptions);
  console.log(svg);
  const end = performance.now();

  const output = new URL("./output-ex/", import.meta.url);
  await Deno.mkdir(output, { recursive: true });
  const file = new URL("map.svg", output);
  await Deno.writeTextFile(file, svg);

  console.log(`Time taken: ${((end - start) / 1000).toFixed(2)} seconds`);
  console.log(`Wrote ${file.pathname}`);
}

import { renderHistoricalBasemap } from "./index-2.ts";

if (import.meta.main) {
  const start = performance.now();
  await renderHistoricalBasemap({
    countries: ["France", "Spain", "Portugal"],
  });
  const end = performance.now();
  console.log(`Time taken: ${((end - start) / 1000).toFixed(2)} seconds`);
}

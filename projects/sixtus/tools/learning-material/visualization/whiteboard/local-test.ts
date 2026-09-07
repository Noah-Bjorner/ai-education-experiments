import "@std/dotenv/load";

import { whiteboard } from "./index.ts";

/** Pick any instruction, or paste a one-off. */
const instruction =
  "Line chart of the population of France. X=Year, Y=Population. Points: 1950 → 41,800,000; 1975 → 52,600,000.";

if (import.meta.main) {
  const start = performance.now();
  const result = await whiteboard({ instruction, category: "charts" });
  const end = performance.now();

  console.log(JSON.stringify(result, null, 2));
  console.log(`Time taken: ${((end - start) / 1000).toFixed(2)} seconds`);
}

/*
Examples:

- Line chart of the population of France. X=Year, Y=Population. Points: 1950 → 41,800,000; 1975 → 52,600,000.
- xy_chart (line): Supply, Demand, and Market Equilibrium. X=Quantity, Y=Price. Demand: (10,90), (30,70), (50,50), (70,30), (90,10). Supply: (10,10), (30,30), (50,50), (70,70), (90,90).
- Bar chart comparing typical capacity factor of renewable energy sources: solar, wind, hydro, nuclear.
- Scatter chart of study hours (X) vs exam score (Y) for 8 illustrative students.
- Pie chart of Earth's atmosphere by volume: nitrogen 78%, oxygen 21%, argon 0.9%, other 0.1%.
*/

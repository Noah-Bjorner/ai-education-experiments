import "@std/dotenv/load";

import { executeWhiteboard } from "./index.ts";

/** Pick any educational or communication goal, or paste a one-off. */
const goal =
  "Help a learner understand how France's population grew between 1950 and 1975. Population: 1950 → 41,800,000 people; 1975 → 52,600,000 people";

// Other annotation goals to paste into `goal`:
// "Explain an illustrative rise and fall using a line chart through (0, 0), (1, 2), (2, 4), and (3, 2). Circle the highest point and add an arrow callout saying 'The value starts falling after this point'. Number the first and last points 1 and 2 to guide reading order."
// "Help a learner read a graph of y = 2x at x = 0, 1, 2, and 3. Box the point (2, 4), underline the x-axis label, and use a line callout at (3, 6) saying 'Each increase of 1 in x adds 2 to y'."
// "Illustrate how a mistaken value is corrected using two labeled series at x = 1, 2, and 3: 'Incorrect guess' with y = 2, 4, and 8; 'Correct: y = 2x' with y = 2, 4, and 6. Strike through the 'Incorrect guess' legend label and add an arrow callout at the correct final point saying 'At x = 3, y is 6'. Keep both series visible for comparison."

if (import.meta.main) {
  const start = performance.now();
  const result = await executeWhiteboard({ goal });
  const end = performance.now();

  console.log(JSON.stringify(result, null, 2));
  console.log(`Time taken: ${((end - start) / 1000).toFixed(2)} seconds`);
}

/*
Example goals:

- Help a learner understand how France's population grew between 1950 and 1975. Population: 1950 → 41,800,000 people; 1975 → 52,600,000 people.
- Explain market equilibrium as the intersection of supply and demand using illustrative (quantity, price) pairs. Demand: (10,90), (30,70), (50,50), (70,30), (90,10). Supply: (10,10), (30,30), (50,50), (70,70), (90,90).
- Help a learner compare capacity factors using illustrative values: solar 20%, wind 35%, hydro 45%, nuclear 90%.
- Help a learner explore the relationship between study hours and exam scores using 8 illustrative students, without implying causation.
- Explain that nitrogen and oxygen account for nearly all of Earth's atmosphere by volume: nitrogen 78%, oxygen 21%, argon 0.9%, other 0.1%.
*/

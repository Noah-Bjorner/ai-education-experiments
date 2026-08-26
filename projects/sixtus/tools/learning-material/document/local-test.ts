import { createDocument } from "./index.ts";

if (import.meta.main) {
  const start = performance.now();
  const result = await createDocument({
    type: "studyGuide",
    instruction:
      "learn about the new testament",
  });
  const end = performance.now();

  console.log(JSON.stringify(result, null, 2));
  console.log(`Time taken: ${((end - start) / 1000).toFixed(2)} seconds`);
}


/*

EXAMPLES

- cheatSheet -> write a cheat sheet for the new testaments
- cheatSheet -> learner wants to learn about the odyssey
- deepResearch -> learner wants to learn the causes that lead to the ideology of the nazis
- primer -> learner wants to learn about the odyssey
- studyGuide -> learner wants to learn the causes that lead to the ideology of the nazis
- studyGuide -> learn about the new testament


*/
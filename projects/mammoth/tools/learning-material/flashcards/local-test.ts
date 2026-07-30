import { createFlashcards } from "./index.ts";

if (import.meta.main) {
  const start = performance.now();
  const result = await createFlashcards({
    instruction:
      "Create a flashcard set on European capital cities for a middle-school geography student. About 10 cards. Mix some text-only cards with a few flag-or-landmark image prompts when helpful. Keep answers to the city name.",
  });
  const end = performance.now();

  console.log(JSON.stringify(result, null, 2));
  console.log(`Time taken: ${((end - start) / 1000).toFixed(2)} seconds`);
}

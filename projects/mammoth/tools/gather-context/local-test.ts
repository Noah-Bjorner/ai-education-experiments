import { gatherContext } from "./index.ts";

if (import.meta.main) {
  const { text, durationSeconds } = await gatherContext(
    "What does this page say https://roadmap.sh/ai-engineer?fl=0?",
  );
  console.log(text);
  console.log(`Time taken: ${durationSeconds.toFixed(2)} seconds`);
}

import { gatherContext } from "./index.ts";

if (import.meta.main) {
  const { text, durationSeconds, trace } = await gatherContext(
    "What's the latest model from OpenAI?",
  );
  console.log("text:", text);
  console.log("trace:", trace);
  console.log(`Time taken: ${durationSeconds.toFixed(2)} seconds`);
}


//"What's the latest model from Anthropic?"
//"What day is it today?"
//"What does this page say https://roadmap.sh/ai-engineer?fl=0?"
//"What is the weather in Stockholm?"
//"What's the score of the latest AIK game?"
//"What were the leading causes in the rise of social Darwinism?"
//"What's the main takeaways from this report https://scale.stanford.edu/sites/default/files/The%20Evidence%20Base%20on%20AI%20in%20K-12%20Report.pdf?"
//"Can you summarize the main points of this video https://www.youtube.com/watch?v=L4lh6lxHd3k&list=LL&index=8"
//"Give me the full transcript unaltered from https://www.youtube.com/watch?v=L4lh6lxHd3k&list=LL&index=8"
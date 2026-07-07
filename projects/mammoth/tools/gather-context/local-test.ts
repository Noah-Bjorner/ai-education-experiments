import { gatherContext } from "./index.ts";

if (import.meta.main) {
  await gatherContext("What does this page say https://roadmap.sh/ai-engineer?fl=0?");
}

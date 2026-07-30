export const FLASHCARDS_PLAN_SYSTEM_PROMPT = [
  "You plan a flashcard set for a learner to study with mental recall.",
  "Each card will have a front (prompt) and a back (answer). The learner thinks of the answer, then flips.",
  "Use gatherContext when you need current facts, specific sources, or material you are not confident about from memory alone.",
  "Do not invent citations, quotes, statistics, or URLs.",
  "",
  "Return structured output with:",
  "- title: concise learner-facing title for the set",
  "- description: one or two sentences summarizing what the set covers and who it is for",
  "- targetCount: how many cards to create (default 10–16 unless the instruction specifies otherwise; stay between 4 and 40)",
  "- cardPlan: a private brief for the card generator — topics/facts to cover, mix of card styles, what to emphasize, what to avoid. List concrete items to turn into cards when possible.",
].join("\n");

export const FLASHCARD_CARD_GUIDANCE = [
  "Card rules:",
  "- Every card needs a front and a back.",
  "- Front and back each need text, media, or both. Prefer text-only unless an image clearly helps recall (flags, diagrams, artworks, specimens, maps).",
  "- When using media, provide a specific visual description for image search and accessible alt text. Do not invent image URLs.",
  "- Keep fronts short and unambiguous — one clear thing to recall.",
  "- Keep backs concise and checkable — the answer the learner should have thought of.",
  "- hint: optional short cue shown before flipping; omit when not helpful.",
  "- explanation: optional one-sentence why/context shown after flipping; omit when the back is enough.",
  "- Prefer atomic facts (one idea per card). Avoid near-duplicates.",
  "- Write for a motivated learner; no meta commentary about being an AI.",
].join("\n");

export function buildFlashcardsGenerationPrompt(plan: {
  title: string;
  description: string;
  targetCount: number;
  cardPlan: string;
  instruction: string;
}): string {
  return [
    "Create flashcards for this set by calling the flashcard tool once per card.",
    "Prefer calling many flashcard tools in parallel in a single response.",
    "",
    `Title: ${plan.title}`,
    `Description: ${plan.description}`,
    `Target card count: ${plan.targetCount}`,
    "",
    "Original instruction:",
    plan.instruction,
    "",
    "Card plan:",
    plan.cardPlan,
    "",
    `Generate exactly ${plan.targetCount} cards when possible (minimum 4, maximum 40).`,
    "",
    FLASHCARD_CARD_GUIDANCE,
  ].join("\n");
}

import "@std/dotenv/load";
import {
  generateText,
  isStepCount,
  Output,
  tool,
  type StopCondition,
  type UIToolInvocation,
} from "@ai";
import { z } from "@zod";

import { uploadDocument } from "../../../../../lib/cloudflare.ts";
import { formatGroundedContextForModel } from "../../../citations/format.ts";
import { parseGroundedContext } from "../../../citations/extract.ts";
import { gatherContextTool } from "../../gather-context/index.ts";

//maybe replace with visual static instead of 
import { imageSearchSelector } from "../../shared/image-search-selector/index.ts";
import { createToolCallRepair } from "../../shared/repair-tool-call/index.ts";
import {
  buildFlashcardsGenerationPrompt,
  FLASHCARDS_PLAN_SYSTEM_PROMPT,
} from "./prompt.ts";

export const FLASHCARDS_TOOL_DESCRIPTION =
  "Create a flashcard set for mental-recall study, upload it as JSON, and return a shareable URL.";

export const FLASHCARDS_SYSTEM_PROMPT_DESCRIPTION = [
  "Use when the learner needs a flashcard set for studying with mental recall (front → think → flip → self-check).",
  "Pass a self-contained instruction describing topic, audience, scope, card count if relevant, and any constraints.",
  "Prefer flashcards for memorization and quick retrieval; use question/assessment tools when the learner should submit graded answers.",
].join("\n");

const FLASHCARDS_PLAN_MODEL = "google/gemini-3.6-flash" as const;
const FLASHCARDS_GENERATOR_MODEL = "google/gemini-3.6-flash" as const;
const FLASHCARDS_REPAIR_TOOL_CALL_MODEL = "openai/gpt-5.6-sol" as const;
const MAX_FLASHCARDS_PLAN_STEPS = 8;
const MAX_FLASHCARDS_GENERATION_STEPS = 4;
const MIN_FLASHCARDS = 4;
const MAX_FLASHCARDS = 40;
const FLASHCARDS_UPLOAD_PREFIX = "sixtus/learning-material/flashcards";

const mediaInputSchema = z.object({
  description: z.string().min(1).describe(
    "A concise, specific visual description used to search for and select the image.",
  ),
  altText: z.string().min(1).describe("Accessible alt text for the image."),
});

const resolvedMediaSchema = z.object({
  imageUrl: z.string().url(),
  thumbnailImageUrl: z.string().url().optional(),
  altText: z.string().min(1),
});

const cardSideInputSchema = z.object({
  text: z.string().min(1).optional().describe(
    "Text shown on this side of the card.",
  ),
  media: mediaInputSchema.optional().describe(
    "Optional image for this side. Provide only when a picture clearly helps recall.",
  ),
});

const cardSideResolvedSchema = z.object({
  text: z.string().min(1).optional(),
  media: resolvedMediaSchema.optional(),
});

function refineCardSide(
  side: { text?: string; media?: unknown },
  path: Array<string | number>,
  ctx: z.RefinementCtx,
) {
  if (!side.text && !side.media) {
    ctx.addIssue({
      code: "custom",
      message: "Each card side needs text, media, or both.",
      path,
    });
  }
}

const flashcardInputSchema = z.object({
  front: cardSideInputSchema,
  back: cardSideInputSchema,
  hint: z.string().min(1).optional().describe(
    "Optional short cue shown before the learner flips.",
  ),
  explanation: z.string().min(1).optional().describe(
    "Optional brief context shown after the learner flips.",
  ),
}).superRefine((card, ctx) => {
  refineCardSide(card.front, ["front"], ctx);
  refineCardSide(card.back, ["back"], ctx);
});

const flashcardResolvedSchema = z.object({
  id: z.string().min(1),
  front: cardSideResolvedSchema,
  back: cardSideResolvedSchema,
  hint: z.string().min(1).optional(),
  explanation: z.string().min(1).optional(),
}).superRefine((card, ctx) => {
  refineCardSide(card.front, ["front"], ctx);
  refineCardSide(card.back, ["back"], ctx);
});

const flashcardsPlanSchema = z.object({
  title: z.string().min(1).describe(
    "Concise learner-facing title for the flashcard set.",
  ),
  description: z.string().min(1).describe(
    "One or two sentences summarizing what the set covers and who it is for.",
  ),
  targetCount: z.number().int().min(MIN_FLASHCARDS).max(MAX_FLASHCARDS).describe(
    "How many flashcards to create.",
  ),
  cardPlan: z.string().min(1).describe(
    "Private brief for the card generator: topics/facts to cover, style mix, emphasis, and what to avoid.",
  ),
});

export const flashcardsDeckSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  cards: z.array(flashcardResolvedSchema).min(MIN_FLASHCARDS).max(
    MAX_FLASHCARDS,
  ),
});

export const flashcardsInputSchema = z.object({
  instruction: z.string().min(1).describe(
    "A self-contained brief for the flashcard set: topic, audience, scope, optional card count, and any constraints.",
  ),
});

export type CreateFlashcardsOptions = z.infer<typeof flashcardsInputSchema>;

export const flashcardsOutputSchema = z.object({
  title: z.string().min(1).describe("Learner-facing title for the set."),
  description: z.string().min(1).describe(
    "Short learner-facing summary of the set.",
  ),
  cardCount: z.number().int().positive().describe(
    "Number of flashcards in the uploaded set.",
  ),
  url: z.string().min(1).describe("Public URL of the uploaded JSON file."),
});

function formatVerifiedFacts(
  results: ReadonlyArray<{ toolName: string; output: unknown }>,
): string | undefined {
  const blocks = results
    .filter((result) => result.toolName === "gatherContext")
    .map((result) => parseGroundedContext(result.output))
    .filter((context): context is NonNullable<typeof context> => context != null)
    .map(formatGroundedContextForModel);

  if (blocks.length === 0) return undefined;
  return blocks.join("\n\n");
}
export type FlashcardsDeck = z.infer<typeof flashcardsDeckSchema>;
export type FlashcardsToolOutput = z.infer<typeof flashcardsOutputSchema>;
type FlashcardInput = z.infer<typeof flashcardInputSchema>;
type ResolvedFlashcard = z.infer<typeof flashcardResolvedSchema>;
type ResolvedMedia = z.infer<typeof resolvedMediaSchema>;
type MediaInput = z.infer<typeof mediaInputSchema>;
type FlashcardsPlan = z.infer<typeof flashcardsPlanSchema>;

const planTools = { gatherContext: gatherContextTool };

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "flashcards";
}

function buildFlashcardsFileName(title: string): string {
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${slugifyTitle(title)}-${suffix}`;
}

async function resolveMedia(
  media: MediaInput,
): Promise<
  | { ok: true; media: ResolvedMedia }
  | { ok: false; message: string }
> {
  try {
    const result = await imageSearchSelector({
      prompt: media.description,
      mode: "fast",
      maxCandidates: 4,
    });

    if (!result.imageURL) {
      return { ok: false, message: "Image search returned no image URL." };
    }

    return {
      ok: true,
      media: {
        imageUrl: result.imageURL,
        thumbnailImageUrl: result.thumbnailImageURL || undefined,
        altText: media.altText,
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveCardSide(
  side: FlashcardInput["front"],
  label: string,
): Promise<z.infer<typeof cardSideResolvedSchema>> {
  if (!side.media) {
    return { text: side.text };
  }

  const resolved = await resolveMedia(side.media);
  if (!resolved.ok) {
    throw new Error(`Failed to resolve media for ${label}: ${resolved.message}`);
  }

  return {
    text: side.text,
    media: resolved.media,
  };
}

async function resolveFlashcard(
  card: FlashcardInput,
): Promise<ResolvedFlashcard> {
  const [front, back] = await Promise.all([
    resolveCardSide(card.front, "front"),
    resolveCardSide(card.back, "back"),
  ]);

  return flashcardResolvedSchema.parse({
    id: crypto.randomUUID(),
    front,
    back,
    hint: card.hint,
    explanation: card.explanation,
  });
}

// Root must be an object — models reject a bare union/object card schema.
const addFlashcardInputSchema = z.object({
  card: flashcardInputSchema,
});

const addFlashcardTool = tool({
  description:
    "Add one flashcard to the set. Call once per card. Images are resolved automatically from media descriptions.",
  inputSchema: addFlashcardInputSchema,
  outputSchema: flashcardResolvedSchema,
  execute: async ({ card }) => await resolveFlashcard(card),
});

const flashcardGenerationTools = { flashcard: addFlashcardTool };

function countFlashcards(
  steps: ReadonlyArray<{ staticToolResults: ReadonlyArray<unknown> }>,
): number {
  return steps.reduce((total, step) => total + step.staticToolResults.length, 0);
}

const stopWhenFlashcardsAreFull: StopCondition<
  typeof flashcardGenerationTools
> = ({ steps }) => countFlashcards(steps) >= MAX_FLASHCARDS;

function cardDedupeKey(card: ResolvedFlashcard): string {
  const frontText = card.front.text?.trim().toLowerCase() ?? "";
  const frontMedia = card.front.media?.altText.trim().toLowerCase() ?? "";
  const backText = card.back.text?.trim().toLowerCase() ?? "";
  return `${frontText}|${frontMedia}|${backText}`;
}

function dedupeFlashcards(cards: ResolvedFlashcard[]): ResolvedFlashcard[] {
  const seen = new Set<string>();

  return cards.filter((card) => {
    const key = cardDedupeKey(card);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function createFlashcardsPlan(
  instruction: string,
): Promise<{ plan: FlashcardsPlan; verifiedFacts?: string }> {
  const result = await generateText({
    model: FLASHCARDS_PLAN_MODEL,
    reasoning: "medium",
    system: FLASHCARDS_PLAN_SYSTEM_PROMPT,
    prompt: instruction,
    tools: planTools,
    stopWhen: isStepCount(MAX_FLASHCARDS_PLAN_STEPS),
    output: Output.object({
      schema: flashcardsPlanSchema,
      name: "flashcard_set_plan",
      description: "Title, description, target count, and card plan for the set.",
    }),
  });

  if (!result.output) {
    throw new Error("Flashcard planning produced no structured output.");
  }

  return {
    plan: result.output,
    verifiedFacts: formatVerifiedFacts(result.staticToolResults),
  };
}

async function createFlashcardCards(
  plan: FlashcardsPlan,
  instruction: string,
  verifiedFacts?: string,
): Promise<ResolvedFlashcard[]> {
  const result = await generateText({
    model: FLASHCARDS_GENERATOR_MODEL,
    tools: flashcardGenerationTools,
    prompt: buildFlashcardsGenerationPrompt({
      ...plan,
      instruction,
      verifiedFacts,
    }),
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0 ? { toolChoice: "required" } : {},
    stopWhen: [
      stopWhenFlashcardsAreFull,
      isStepCount(MAX_FLASHCARDS_GENERATION_STEPS),
    ],
    experimental_repairToolCall: createToolCallRepair({
      model: FLASHCARDS_REPAIR_TOOL_CALL_MODEL,
      tools: flashcardGenerationTools,
    }),
  });

  const cards = dedupeFlashcards(
    result.staticToolResults
      .filter((toolResult) => toolResult.toolName === "flashcard")
      .map((toolResult) => toolResult.output),
  ).slice(0, Math.min(plan.targetCount, MAX_FLASHCARDS));

  if (cards.length < MIN_FLASHCARDS) {
    throw new Error(
      `Flashcard generation produced ${cards.length} card(s); at least ${MIN_FLASHCARDS} are required.`,
    );
  }

  return cards;
}

async function uploadFlashcardsJson(
  title: string,
  deck: FlashcardsDeck,
): Promise<string> {
  const name = buildFlashcardsFileName(title);
  return await uploadDocument(
    new Blob([JSON.stringify(deck, null, 2)], {
      type: "application/json; charset=utf-8",
    }),
    `${name}.json`,
    {
      prefix: FLASHCARDS_UPLOAD_PREFIX,
      name,
    },
  );
}

export async function createFlashcards(
  options: CreateFlashcardsOptions,
): Promise<FlashcardsToolOutput> {
  const { plan, verifiedFacts } = await createFlashcardsPlan(options.instruction);
  const cards = await createFlashcardCards(plan, options.instruction, verifiedFacts);
  const deck = flashcardsDeckSchema.parse({
    title: plan.title,
    description: plan.description,
    cards,
  });
  const url = await uploadFlashcardsJson(deck.title, deck);

  return flashcardsOutputSchema.parse({
    title: deck.title,
    description: deck.description,
    cardCount: deck.cards.length,
    url,
  });
}

export const flashcardsTool = tool({
  description: FLASHCARDS_TOOL_DESCRIPTION,
  inputSchema: flashcardsInputSchema,
  outputSchema: flashcardsOutputSchema,
  execute: createFlashcards,
});

export type FlashcardsToolInvocation = UIToolInvocation<typeof flashcardsTool>;

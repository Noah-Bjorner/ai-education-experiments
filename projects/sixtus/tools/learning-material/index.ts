import { tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";

import {
  createDocument,
  documentInputSchema,
  documentOutputSchema,
} from "./document/index.ts";
import {
  createFlashcards,
  flashcardsInputSchema,
  flashcardsOutputSchema,
} from "./flashcards/index.ts";

export const LEARNING_MATERIAL_TOOL_DESCRIPTION =
  "Create learning material for the learner to study from. Use when they need study or reference material that's richer than plain text.";

export const LEARNING_MATERIAL_SYSTEM_PROMPT_DESCRIPTION = [
  "Use when the learner needs study or reference material to learn from — not a graded evaluation. Choose the materialType that best matches the need:",
  "  - flashcards: a set of mental-recall cards (front → think → flip → self-check). Use when memorization or quick retrieval practice is the goal.",
  "  - document: a learning document the learner can download or share. Use when they need reading material to study from. Choose the document type that best matches the need:",
  "      - studyGuide: structured learning path with overview, concepts, examples, and self-check.",
  "      - cheatSheet: dense, scannable reference of key facts, definitions, or formulas.",
  "      - deepResearch: thorough sourced synthesis with nuance and clear sections.",
  "      - primer: short conceptual intro for a newcomer; clarity over completeness.",
  "      - miscellaneous: any other document form requested by the instruction.",
].join("\n");

export const LEARNING_MATERIAL_TYPES = [
  "flashcards",
  "document",
] as const;

export type LearningMaterialType = typeof LEARNING_MATERIAL_TYPES[number];

const flashcardsBranchSchema = flashcardsInputSchema.extend({
  materialType: z.literal("flashcards"),
});

const documentBranchSchema = documentInputSchema.extend({
  materialType: z.literal("document"),
});

const learningMaterialInputSchema = z.object({
  learningMaterial: z.discriminatedUnion("materialType", [
    flashcardsBranchSchema,
    documentBranchSchema,
  ]),
});

const flashcardsOutputBranchSchema = flashcardsOutputSchema.extend({
  materialType: z.literal("flashcards"),
});

const documentOutputBranchSchema = documentOutputSchema.extend({
  materialType: z.literal("document"),
});

const learningMaterialOutputSchema = z.discriminatedUnion("materialType", [
  flashcardsOutputBranchSchema,
  documentOutputBranchSchema,
]);

type LearningMaterialInput = z.infer<
  typeof learningMaterialInputSchema
>["learningMaterial"];
export type LearningMaterialToolOutput = z.infer<
  typeof learningMaterialOutputSchema
>;

async function executeLearningMaterial(
  { learningMaterial }: { learningMaterial: LearningMaterialInput },
): Promise<LearningMaterialToolOutput> {
  switch (learningMaterial.materialType) {
    case "flashcards": {
      const result = await createFlashcards({
        instruction: learningMaterial.instruction,
      });
      return flashcardsOutputBranchSchema.parse({
        materialType: "flashcards",
        ...result,
      });
    }
    case "document": {
      const result = await createDocument({
        type: learningMaterial.type,
        instruction: learningMaterial.instruction,
      });
      return documentOutputBranchSchema.parse({
        materialType: "document",
        ...result,
      });
    }
  }
}

export const learningMaterialTool = tool({
  description: LEARNING_MATERIAL_TOOL_DESCRIPTION,
  inputSchema: learningMaterialInputSchema,
  outputSchema: learningMaterialOutputSchema,
  execute: executeLearningMaterial,
});

export type LearningMaterialToolInvocation = UIToolInvocation<
  typeof learningMaterialTool
>;

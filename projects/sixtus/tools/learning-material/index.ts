import { tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";

import {
  createDocument,
  documentInputSchema,
  documentOutputSchema,
  DOCUMENT_SYSTEM_PROMPT_DESCRIPTION
} from "./document/index.ts";
import {
  createFlashcards,
  flashcardsInputSchema,
  flashcardsOutputSchema,
  FLASHCARDS_SYSTEM_PROMPT_DESCRIPTION
} from "./flashcards/index.ts";
import {
  executeImage,
  imageInputSchema,
  imageOutputSchema,
  IMAGE_SYSTEM_PROMPT_DESCRIPTION
} from "./image/index.ts";
import {
  executeWhiteboard,
  whiteboardInputSchema,
  whiteboardResultSchema,
  WHITEBOARD_SYSTEM_PROMPT_DESCRIPTION,
} from "./whiteboard/index.ts";


export const LEARNING_MATERIAL_TYPES = {
  flashcards: "flashcards",
  document: "document",
  image: "image",
  whiteboard: "whiteboard",
} as const;


export const LEARNING_MATERIAL_TOOL_DESCRIPTION =
  "Create learning material for the learner to study from. Use when they need study or reference material that's richer than plain text, or a visual that helps them understand something.";

function formatMaterialTypeDescription(
  materialType: string,
  description: string,
): string {
  return `  - ${materialType}: ${description.replaceAll("\n", "\n    ")}`;
}

export const LEARNING_MATERIAL_SYSTEM_PROMPT_DESCRIPTION = [
  "Use when the learner needs study or reference material to learn from, or a visual that helps them understand something — not a graded evaluation. Choose the materialType that best matches the need:",
  formatMaterialTypeDescription(
    LEARNING_MATERIAL_TYPES.flashcards,
    FLASHCARDS_SYSTEM_PROMPT_DESCRIPTION,
  ),
  formatMaterialTypeDescription(
    LEARNING_MATERIAL_TYPES.document,
    DOCUMENT_SYSTEM_PROMPT_DESCRIPTION,
  ),
  formatMaterialTypeDescription(
    LEARNING_MATERIAL_TYPES.image,
    IMAGE_SYSTEM_PROMPT_DESCRIPTION,
  ),
  formatMaterialTypeDescription(
    LEARNING_MATERIAL_TYPES.whiteboard,
    WHITEBOARD_SYSTEM_PROMPT_DESCRIPTION,
  ),
].join("\n");

export type LearningMaterialType =
  typeof LEARNING_MATERIAL_TYPES[keyof typeof LEARNING_MATERIAL_TYPES];

const flashcardsBranchSchema = flashcardsInputSchema.extend({
  materialType: z.literal("flashcards"),
});

const documentBranchSchema = documentInputSchema.extend({
  materialType: z.literal("document"),
});

const imageBranchSchema = imageInputSchema.extend({
  materialType: z.literal("image"),
});

const WHITEBOARD_CHAT_INPUT = {
  mode: "fast",
  format: "url",
} as const;

const whiteboardBranchSchema = whiteboardInputSchema
  .omit({
    mode: true,
    format: true,
  })
  .extend({
    materialType: z.literal("whiteboard"),
  });

const learningMaterialInputSchema = z.object({
  learningMaterial: z.discriminatedUnion("materialType", [
    flashcardsBranchSchema,
    documentBranchSchema,
    imageBranchSchema,
    whiteboardBranchSchema,
  ]),
});

const flashcardsOutputBranchSchema = flashcardsOutputSchema.extend({
  materialType: z.literal("flashcards"),
});

const documentOutputBranchSchema = documentOutputSchema.extend({
  materialType: z.literal("document"),
});

const imageOutputBranchSchema = imageOutputSchema.extend({
  materialType: z.literal("image"),
});

const whiteboardOutputBranchSchema = whiteboardResultSchema.extend({
  materialType: z.literal("whiteboard"),
});

const learningMaterialOutputSchema = z.discriminatedUnion("materialType", [
  flashcardsOutputBranchSchema,
  documentOutputBranchSchema,
  imageOutputBranchSchema,
  whiteboardOutputBranchSchema,
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
    case "image": {
      const result = await executeImage({
        type: learningMaterial.type,
        prompt: learningMaterial.prompt,
      });
      return imageOutputBranchSchema.parse({
        materialType: "image",
        ...result,
      });
    }
    case "whiteboard": {
      const result = await executeWhiteboard({
        goal: learningMaterial.goal,
        domain: learningMaterial.domain,
        ...WHITEBOARD_CHAT_INPUT,
      });
      return whiteboardOutputBranchSchema.parse({
        materialType: "whiteboard",
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

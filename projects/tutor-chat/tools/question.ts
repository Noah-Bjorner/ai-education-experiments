import { tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";

const questionChoiceSchema = z.object({
  id: z.string().min(1).describe("Stable choice id, such as a, b, c, or d."),
  label: z.string().min(1).describe("The text shown for this choice."),
});

const imageChoiceSchema = questionChoiceSchema.extend({
  imageUrl: z.string().url().optional().describe(
    "Optional URL for an image choice, when a concrete image is available.",
  ),
  imageDescription: z.string().min(1).optional().describe(
    "A concise visual description to render or use as a prompt when no image URL exists.",
  ),
  altText: z.string().min(1).optional().describe(
    "Accessible alt text for the image.",
  ),
});

const matchingPromptSchema = z.object({
  id: z.string().min(1).describe("Stable id for the item to match."),
  label: z.string().min(1).describe("The item shown on the left side."),
});

const matchingOptionSchema = z.object({
  id: z.string().min(1).describe("Stable id for the matching option."),
  label: z.string().min(1).describe("The option shown on the right side."),
});

const matchingPairSchema = z.object({
  promptId: z.string().min(1).describe("The id of the prompt item."),
  optionId: z.string().min(1).describe("The id of the correct option."),
});

function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return [...duplicates];
}

const baseQuestionSchema = z.object({
  question: z.string().min(1).describe("The learner-facing question text."),
  explanation: z.string().min(1).optional().describe(
    "A short explanation shown after the learner answers.",
  ),
});

const questionSchema = z.discriminatedUnion("questionType", [
  baseQuestionSchema.extend({
    questionType: z.literal("multiple_choice_text"),
    choices: z.array(questionChoiceSchema).min(2).max(8),
    correctChoiceIds: z.array(z.string().min(1)).min(1).describe(
      "Ids of every correct choice. Use multiple ids when more than one answer is correct.",
    ),
  }),
  baseQuestionSchema.extend({
    questionType: z.literal("multiple_choice_image"),
    choices: z.array(imageChoiceSchema).min(2).max(8),
    correctChoiceIds: z.array(z.string().min(1)).min(1).describe(
      "Ids of every correct image choice.",
    ),
  }),
  baseQuestionSchema.extend({
    questionType: z.literal("text_response"),
    acceptedAnswers: z.array(z.string().min(1)).min(1).optional().describe(
      "Examples of acceptable text answers.",
    ),
    sampleAnswer: z.string().min(1).optional().describe(
      "A model answer the learner can compare against.",
    ),
  }),
  baseQuestionSchema.extend({
    questionType: z.literal("math_response"),
    expectedAnswer: z.string().min(1).describe(
      "The expected mathematical answer, expression, or equation.",
    ),
    acceptedFormats: z.array(z.string().min(1)).optional().describe(
      "Alternative acceptable answer formats, such as decimal, fraction, or units.",
    ),
  }),
  baseQuestionSchema.extend({
    questionType: z.literal("fill_in_the_blank"),
    textWithBlanks: z.string().min(1).describe(
      "The prompt text with blanks marked as {{blankId}}, such as {{blank1}}.",
    ),
    blanks: z.array(
      z.object({
        id: z.string().min(1).describe("The blank id used in textWithBlanks."),
        acceptedAnswers: z.array(z.string().min(1)).min(1),
      }),
    ).min(1),
  }),
  baseQuestionSchema.extend({
    questionType: z.literal("matching"),
    prompts: z.array(matchingPromptSchema).min(2).max(10),
    options: z.array(matchingOptionSchema).min(2).max(10),
    correctPairs: z.array(matchingPairSchema).min(2).describe(
      "The correct mapping between prompts and options.",
    ),
  }),
]).superRefine((questionInput, ctx) => {
  if (
    questionInput.questionType === "multiple_choice_text" ||
    questionInput.questionType === "multiple_choice_image"
  ) {
    const choiceIds = questionInput.choices.map((choice) => choice.id);
    const choiceIdSet = new Set(choiceIds);

    for (const duplicateId of findDuplicates(choiceIds)) {
      ctx.addIssue({
        code: "custom",
        message: `Choice id "${duplicateId}" must be unique.`,
        path: ["choices"],
      });
    }

    for (const duplicateId of findDuplicates(questionInput.correctChoiceIds)) {
      ctx.addIssue({
        code: "custom",
        message: `Correct choice id "${duplicateId}" must be unique.`,
        path: ["correctChoiceIds"],
      });
    }

    for (const correctChoiceId of questionInput.correctChoiceIds) {
      if (!choiceIdSet.has(correctChoiceId)) {
        ctx.addIssue({
          code: "custom",
          message:
            `Correct choice id "${correctChoiceId}" does not match any choice id.`,
          path: ["correctChoiceIds"],
        });
      }
    }

    if (questionInput.questionType === "multiple_choice_image") {
      questionInput.choices.forEach((choice, index) => {
        if (!choice.imageUrl && !choice.imageDescription) {
          ctx.addIssue({
            code: "custom",
            message: "Image choices need either imageUrl or imageDescription.",
            path: ["choices", index],
          });
        }
      });
    }
  }

  if (questionInput.questionType === "text_response") {
    if (!questionInput.acceptedAnswers && !questionInput.sampleAnswer) {
      ctx.addIssue({
        code: "custom",
        message:
          "Text response questions need acceptedAnswers or sampleAnswer.",
        path: ["acceptedAnswers"],
      });
    }
  }

  if (questionInput.questionType === "fill_in_the_blank") {
    const blankIds = questionInput.blanks.map((blank) => blank.id);

    for (const duplicateId of findDuplicates(blankIds)) {
      ctx.addIssue({
        code: "custom",
        message: `Blank id "${duplicateId}" must be unique.`,
        path: ["blanks"],
      });
    }

    questionInput.blanks.forEach((blank, index) => {
      if (!questionInput.textWithBlanks.includes(`{{${blank.id}}}`)) {
        ctx.addIssue({
          code: "custom",
          message:
            `Blank id "${blank.id}" must appear in textWithBlanks as {{${blank.id}}}.`,
          path: ["blanks", index, "id"],
        });
      }
    });
  }

  if (questionInput.questionType === "matching") {
    const promptIds = questionInput.prompts.map((prompt) => prompt.id);
    const optionIds = questionInput.options.map((option) => option.id);
    const promptIdSet = new Set(promptIds);
    const optionIdSet = new Set(optionIds);
    const pairedPromptIds = questionInput.correctPairs.map((pair) =>
      pair.promptId
    );
    const pairedOptionIds = questionInput.correctPairs.map((pair) =>
      pair.optionId
    );

    for (const duplicateId of findDuplicates(promptIds)) {
      ctx.addIssue({
        code: "custom",
        message: `Prompt id "${duplicateId}" must be unique.`,
        path: ["prompts"],
      });
    }

    for (const duplicateId of findDuplicates(optionIds)) {
      ctx.addIssue({
        code: "custom",
        message: `Option id "${duplicateId}" must be unique.`,
        path: ["options"],
      });
    }

    for (const duplicateId of findDuplicates(pairedPromptIds)) {
      ctx.addIssue({
        code: "custom",
        message: `Prompt id "${duplicateId}" can only have one correct match.`,
        path: ["correctPairs"],
      });
    }

    for (const duplicateId of findDuplicates(pairedOptionIds)) {
      ctx.addIssue({
        code: "custom",
        message:
          `Option id "${duplicateId}" can only be used once in correctPairs.`,
        path: ["correctPairs"],
      });
    }

    questionInput.correctPairs.forEach((pair, index) => {
      if (!promptIdSet.has(pair.promptId)) {
        ctx.addIssue({
          code: "custom",
          message: `Prompt id "${pair.promptId}" does not match any prompt.`,
          path: ["correctPairs", index, "promptId"],
        });
      }

      if (!optionIdSet.has(pair.optionId)) {
        ctx.addIssue({
          code: "custom",
          message: `Option id "${pair.optionId}" does not match any option.`,
          path: ["correctPairs", index, "optionId"],
        });
      }
    });

    for (const promptId of promptIds) {
      if (!pairedPromptIds.includes(promptId)) {
        ctx.addIssue({
          code: "custom",
          message: `Prompt id "${promptId}" needs a correct pair.`,
          path: ["correctPairs"],
        });
      }
    }
  }
});

// The union is nested under an object because models require a tool's
// root input schema to be an object; a root-level union is rejected.
const questionInputSchema = z.object({
  question: questionSchema,
});

export const questionTool = tool({
  description:
    "Create a question for the student to answer, to practice or check their understanding.",
  inputSchema: questionInputSchema,
  execute: ({ question }) => question,
});

export type QuestionToolInvocation = UIToolInvocation<typeof questionTool>;

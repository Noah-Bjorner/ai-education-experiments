import { tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";

const quizChoiceSchema = z.object({
  id: z.string().min(1).describe("Stable choice id, such as a, b, c, or d."),
  label: z.string().min(1).describe("The text shown for this choice."),
});

const imageChoiceSchema = quizChoiceSchema.extend({
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

const baseQuizSchema = z.object({
  question: z.string().min(1).describe("The learner-facing quiz question."),
  explanation: z.string().min(1).optional().describe(
    "A short explanation shown after the learner answers.",
  ),
});

const quizInputSchema = z.discriminatedUnion("quizType", [
  baseQuizSchema.extend({
    quizType: z.literal("multiple_choice_text"),
    choices: z.array(quizChoiceSchema).min(2).max(8),
    correctChoiceIds: z.array(z.string().min(1)).min(1).describe(
      "Ids of every correct choice. Use multiple ids when more than one answer is correct.",
    ),
  }),
  baseQuizSchema.extend({
    quizType: z.literal("multiple_choice_image"),
    choices: z.array(imageChoiceSchema).min(2).max(8),
    correctChoiceIds: z.array(z.string().min(1)).min(1).describe(
      "Ids of every correct image choice.",
    ),
  }),
  baseQuizSchema.extend({
    quizType: z.literal("text_response"),
    acceptedAnswers: z.array(z.string().min(1)).min(1).optional().describe(
      "Examples of acceptable text answers.",
    ),
    sampleAnswer: z.string().min(1).optional().describe(
      "A model answer the learner can compare against.",
    ),
  }),
  baseQuizSchema.extend({
    quizType: z.literal("math_response"),
    expectedAnswer: z.string().min(1).describe(
      "The expected mathematical answer, expression, or equation.",
    ),
    acceptedFormats: z.array(z.string().min(1)).optional().describe(
      "Alternative acceptable answer formats, such as decimal, fraction, or units.",
    ),
  }),
  baseQuizSchema.extend({
    quizType: z.literal("fill_in_the_blank"),
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
  baseQuizSchema.extend({
    quizType: z.literal("matching"),
    prompts: z.array(matchingPromptSchema).min(2).max(10),
    options: z.array(matchingOptionSchema).min(2).max(10),
    correctPairs: z.array(matchingPairSchema).min(2).describe(
      "The correct mapping between prompts and options.",
    ),
  }),
]).superRefine((quiz, ctx) => {
  if (
    quiz.quizType === "multiple_choice_text" ||
    quiz.quizType === "multiple_choice_image"
  ) {
    const choiceIds = quiz.choices.map((choice) => choice.id);
    const choiceIdSet = new Set(choiceIds);

    for (const duplicateId of findDuplicates(choiceIds)) {
      ctx.addIssue({
        code: "custom",
        message: `Choice id "${duplicateId}" must be unique.`,
        path: ["choices"],
      });
    }

    for (const duplicateId of findDuplicates(quiz.correctChoiceIds)) {
      ctx.addIssue({
        code: "custom",
        message: `Correct choice id "${duplicateId}" must be unique.`,
        path: ["correctChoiceIds"],
      });
    }

    for (const correctChoiceId of quiz.correctChoiceIds) {
      if (!choiceIdSet.has(correctChoiceId)) {
        ctx.addIssue({
          code: "custom",
          message: `Correct choice id "${correctChoiceId}" does not match any choice id.`,
          path: ["correctChoiceIds"],
        });
      }
    }

    if (quiz.quizType === "multiple_choice_image") {
      quiz.choices.forEach((choice, index) => {
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

  if (quiz.quizType === "text_response") {
    if (!quiz.acceptedAnswers && !quiz.sampleAnswer) {
      ctx.addIssue({
        code: "custom",
        message: "Text response quizzes need acceptedAnswers or sampleAnswer.",
        path: ["acceptedAnswers"],
      });
    }
  }

  if (quiz.quizType === "fill_in_the_blank") {
    const blankIds = quiz.blanks.map((blank) => blank.id);

    for (const duplicateId of findDuplicates(blankIds)) {
      ctx.addIssue({
        code: "custom",
        message: `Blank id "${duplicateId}" must be unique.`,
        path: ["blanks"],
      });
    }

    quiz.blanks.forEach((blank, index) => {
      if (!quiz.textWithBlanks.includes(`{{${blank.id}}}`)) {
        ctx.addIssue({
          code: "custom",
          message: `Blank id "${blank.id}" must appear in textWithBlanks as {{${blank.id}}}.`,
          path: ["blanks", index, "id"],
        });
      }
    });
  }

  if (quiz.quizType === "matching") {
    const promptIds = quiz.prompts.map((prompt) => prompt.id);
    const optionIds = quiz.options.map((option) => option.id);
    const promptIdSet = new Set(promptIds);
    const optionIdSet = new Set(optionIds);
    const pairedPromptIds = quiz.correctPairs.map((pair) => pair.promptId);
    const pairedOptionIds = quiz.correctPairs.map((pair) => pair.optionId);

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
        message: `Option id "${duplicateId}" can only be used once in correctPairs.`,
        path: ["correctPairs"],
      });
    }

    quiz.correctPairs.forEach((pair, index) => {
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

export const quizTool = tool({
  description: "Create an interactive quiz to help the student practice, reflect, or check their understanding.",
  inputSchema: quizInputSchema,
  execute: (quiz) => quiz,
});

export type QuizToolInvocation = UIToolInvocation<typeof quizTool>;

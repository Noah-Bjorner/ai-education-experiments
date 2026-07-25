import { tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";
import { imageSearchSelector } from "../shared/image-search-selector/index.ts";

export const QUESTION_TOOL_DESCRIPTION = "Create a question for the student to answer, to practice or quickly check their understanding.";
export const QUESTION_TYPE_GUIDANCE = [
  "  - multiple_choice_text: default for quick conceptual checks or choosing among short text options.",
  "  - multiple_choice_image: when choices are best shown as pictures (identify the animal, artwork, diagram, flag). Provide a specific imageDescription per option; real image URLs are found automatically.",
  "  - true_false: when the student should decide if a statement is true or false.",
  "  - text_response: when the student should explain, define, or reflect in their own words.",
  "  - math_response: when the answer is numeric, an equation, an expression, or unit-based.",
  "  - write_in_the_blank: when recalling vocabulary, formulas, steps, or sentence completions by typing. Use {{blankId}} markers.",
  "  - drag_and_drop_in_the_blank: like write_in_the_blank, but provide a pool of candidate options the learner drags into blanks. Use {{blankId}} markers.",
  "  - matching: when pairing related items, such as terms and definitions or examples and categories.",
].join("\n");
export const QUESTION_SYSTEM_PROMPT_DESCRIPTION = [
  "Use when you want the student to actively think, practice, or check understanding. Always use this tool for questions you want the learner to answer, not Markdown/plain text. Prefer the simplest questionType that matches the learning task:",
  QUESTION_TYPE_GUIDANCE,
].join("\n");


const multipleChoiceOptionIds = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const multipleChoiceOptionIdSchema = z.enum(multipleChoiceOptionIds);

const questionChoiceSchema = z.object({
  id: multipleChoiceOptionIdSchema.describe(
    "Stable option id. Use a, b, c, d, etc. in order.",
  ),
  text: z.string().min(1).describe("The text shown for this option."),
});

const imageChoiceSchema = z.object({
  id: multipleChoiceOptionIdSchema.describe(
    "Stable option id. Use a, b, c, d, etc. in order.",
  ),
  imageDescription: z.string().min(1).describe(
    "A concise, specific visual description used to search for and select the image.",
  ),
  altText: z.string().min(1).describe("Accessible alt text for the image."),
});

const resolvedImageChoiceSchema = z.object({
  id: multipleChoiceOptionIdSchema,
  imageUrl: z.string().url(),
  thumbnailImageUrl: z.string().url().optional(),
  altText: z.string().min(1),
});

const matchingPromptSchema = z.object({
  id: z.string().min(1).describe("Stable id for the item to match."),
  text: z.string().min(1).describe("The item shown on the left side."),
});

const matchingOptionSchema = z.object({
  id: z.string().min(1).describe("Stable id for the matching option."),
  text: z.string().min(1).describe("The option shown on the right side."),
});

const matchingPairSchema = z.object({
  promptId: z.string().min(1).describe("The id of the prompt item."),
  optionId: z.string().min(1).describe("The id of the correct option."),
});

const BLANK_MARKER_PATTERN = /\{\{([^{}]+)\}\}/g;

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

function extractBlankMarkers(textWithBlanks: string): string[] {
  return [...textWithBlanks.matchAll(BLANK_MARKER_PATTERN)].flatMap(
    (match) => {
      const blankId = match[1]?.trim();
      return blankId ? [blankId] : [];
    },
  );
}

function refineBlankMarkers(
  textWithBlanks: string,
  blanks: Array<{ id: string }>,
  ctx: z.RefinementCtx,
) {
  const blankIds = blanks.map((blank) => blank.id);
  const markerIds = extractBlankMarkers(textWithBlanks);
  const blankIdSet = new Set(blankIds);
  const markerIdSet = new Set(markerIds);

  for (const duplicateId of findDuplicates(blankIds)) {
    ctx.addIssue({
      code: "custom",
      message: `Blank id "${duplicateId}" must be unique.`,
      path: ["blanks"],
    });
  }

  for (const duplicateId of findDuplicates(markerIds)) {
    ctx.addIssue({
      code: "custom",
      message:
        `Blank marker "{{${duplicateId}}}" must appear only once in textWithBlanks.`,
      path: ["textWithBlanks"],
    });
  }

  blanks.forEach((blank, index) => {
    if (!markerIdSet.has(blank.id)) {
      ctx.addIssue({
        code: "custom",
        message:
          `Blank id "${blank.id}" must appear in textWithBlanks as {{${blank.id}}}.`,
        path: ["blanks", index, "id"],
      });
    }
  });

  for (const markerId of markerIdSet) {
    if (!blankIdSet.has(markerId)) {
      ctx.addIssue({
        code: "custom",
        message:
          `Blank marker "{{${markerId}}}" in textWithBlanks has no matching blank definition.`,
        path: ["textWithBlanks"],
      });
    }
  }
}

function refineMultipleChoiceOptions(
  options: Array<{ id: z.infer<typeof multipleChoiceOptionIdSchema> }>,
  correctOptionIds: Array<z.infer<typeof multipleChoiceOptionIdSchema>>,
  ctx: z.RefinementCtx,
) {
  const optionIds = options.map((option) => option.id);
  const optionIdSet = new Set(optionIds);

  options.forEach((option, index) => {
    const expectedOptionId = multipleChoiceOptionIds[index];
    if (option.id !== expectedOptionId) {
      ctx.addIssue({
        code: "custom",
        message:
          `Multiple choice option ids must be sequential: expected "${expectedOptionId}" at option ${index + 1}.`,
        path: ["options", index, "id"],
      });
    }
  });

  for (const duplicateId of findDuplicates(optionIds)) {
    ctx.addIssue({
      code: "custom",
      message: `Option id "${duplicateId}" must be unique.`,
      path: ["options"],
    });
  }

  for (const duplicateId of findDuplicates(correctOptionIds)) {
    ctx.addIssue({
      code: "custom",
      message: `Correct option id "${duplicateId}" must be unique.`,
      path: ["correctOptionIds"],
    });
  }

  for (const correctOptionId of correctOptionIds) {
    if (!optionIdSet.has(correctOptionId)) {
      ctx.addIssue({
        code: "custom",
        message:
          `Correct option id "${correctOptionId}" does not match any option id.`,
        path: ["correctOptionIds"],
      });
    }
  }
}

const baseQuestionSchema = z.object({
  questionText: z.string().min(1).describe("The learner-facing question text."),
  explanation: z.string().min(1).optional().describe(
    "A short explanation shown after the learner answers.",
  ),
});

const multipleChoiceTextSchema = baseQuestionSchema.extend({
  questionType: z.literal("multiple_choice_text"),
  options: z.array(questionChoiceSchema).min(2).max(8),
  correctOptionIds: z.array(multipleChoiceOptionIdSchema).min(1).describe(
    "Ids of every correct option. Use multiple ids when more than one answer is correct.",
  ),
});

const multipleChoiceImageSchema = baseQuestionSchema.extend({
  questionType: z.literal("multiple_choice_image"),
  options: z.array(imageChoiceSchema).min(2).max(8),
  correctOptionIds: z.array(multipleChoiceOptionIdSchema).min(1).describe(
    "Ids of every correct option. Use multiple ids when more than one answer is correct.",
  ),
});

const resolvedMultipleChoiceImageSchema = baseQuestionSchema.extend({
  questionType: z.literal("multiple_choice_image"),
  options: z.array(resolvedImageChoiceSchema).min(2).max(8),
  correctOptionIds: z.array(multipleChoiceOptionIdSchema).min(1),
});

const trueFalseSchema = baseQuestionSchema.extend({
  questionType: z.literal("true_false"),
  correctAnswer: z.boolean().describe(
    "Whether the correct answer is true or false.",
  ),
});

const textResponseSchema = baseQuestionSchema.extend({
  questionType: z.literal("text_response"),
  acceptedAnswers: z.array(z.string().min(1)).min(1).optional().describe(
    "Examples of acceptable text answers.",
  ),
  sampleAnswer: z.string().min(1).optional().describe(
    "A model answer the learner can compare against.",
  ),
});

const mathResponseSchema = baseQuestionSchema.extend({
  questionType: z.literal("math_response"),
  expectedAnswer: z.string().min(1).describe(
    "The expected mathematical answer, expression, or equation.",
  ),
  acceptedFormats: z.array(z.string().min(1)).optional().describe(
    "Alternative acceptable answer formats, such as decimal, fraction, or units.",
  ),
});

const writeInTheBlankSchema = baseQuestionSchema.extend({
  questionType: z.literal("write_in_the_blank"),
  questionText: z.string().min(1).describe(
    "Short instruction for the learner (e.g. 'Fill in the blanks'). Do not put the blanked passage here — use textWithBlanks for that.",
  ),
  textWithBlanks: z.string().min(1).describe(
    "The passage the learner fills in, with blanks marked as {{blankId}} (e.g. {{blank1}}). Do not repeat this content in questionText.",
  ),
  blanks: z.array(
    z.object({
      id: z.string().min(1).describe("The blank id used in textWithBlanks."),
      acceptedAnswers: z.array(z.string().min(1)).min(1),
    }),
  ).min(1),
});

const dragAndDropInTheBlankSchema = baseQuestionSchema.extend({
  questionType: z.literal("drag_and_drop_in_the_blank"),
  questionText: z.string().min(1).describe(
    "Short instruction for the learner (e.g. 'Drag the correct words into the blanks'). Do not put the blanked passage here — use textWithBlanks for that.",
  ),
  textWithBlanks: z.string().min(1).describe(
    "The passage the learner fills in, with blanks marked as {{blankId}} (e.g. {{blank1}}). Do not repeat this content in questionText.",
  ),
  blanks: z.array(
    z.object({
      id: z.string().min(1).describe("The blank id used in textWithBlanks."),
      correctOptionId: z.string().min(1).describe(
        "The id of the option that correctly fills this blank.",
      ),
    }),
  ).min(1),
  options: z.array(
    z.object({
      id: z.string().min(1).describe("Stable id for this candidate option."),
      text: z.string().min(1).describe(
        "The candidate text the learner can drag into a blank.",
      ),
    }),
  ).min(2).describe(
    "Candidate options for the blanks. Include distractors when useful.",
  ),
});

const matchingSchema = baseQuestionSchema.extend({
  questionType: z.literal("matching"),
  prompts: z.array(matchingPromptSchema).min(2).max(10),
  options: z.array(matchingOptionSchema).min(2).max(10),
  correctPairs: z.array(matchingPairSchema).min(2).describe(
    "The correct mapping between prompts and options.",
  ),
});

const questionSchema = z.discriminatedUnion("questionType", [
  multipleChoiceTextSchema,
  multipleChoiceImageSchema,
  trueFalseSchema,
  textResponseSchema,
  mathResponseSchema,
  writeInTheBlankSchema,
  dragAndDropInTheBlankSchema,
  matchingSchema,
]).superRefine((questionInput, ctx) => {
  if (
    questionInput.questionType === "multiple_choice_text" ||
    questionInput.questionType === "multiple_choice_image"
  ) {
    refineMultipleChoiceOptions(
      questionInput.options,
      questionInput.correctOptionIds,
      ctx,
    );
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

  if (questionInput.questionType === "write_in_the_blank") {
    refineBlankMarkers(
      questionInput.textWithBlanks,
      questionInput.blanks,
      ctx,
    );
  }

  if (questionInput.questionType === "drag_and_drop_in_the_blank") {
    const optionIds = questionInput.options.map((option) => option.id);
    const optionIdSet = new Set(optionIds);
    const correctOptionIds = questionInput.blanks.map(
      (blank) => blank.correctOptionId,
    );

    refineBlankMarkers(
      questionInput.textWithBlanks,
      questionInput.blanks,
      ctx,
    );

    for (const duplicateId of findDuplicates(optionIds)) {
      ctx.addIssue({
        code: "custom",
        message: `Option id "${duplicateId}" must be unique.`,
        path: ["options"],
      });
    }

    for (const duplicateId of findDuplicates(correctOptionIds)) {
      ctx.addIssue({
        code: "custom",
        message:
          `Option id "${duplicateId}" can only be the correct answer for one blank.`,
        path: ["blanks"],
      });
    }

    questionInput.blanks.forEach((blank, index) => {
      if (!optionIdSet.has(blank.correctOptionId)) {
        ctx.addIssue({
          code: "custom",
          message:
            `Correct option id "${blank.correctOptionId}" does not match any option id.`,
          path: ["blanks", index, "correctOptionId"],
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

const questionOutputSchema = z.discriminatedUnion("questionType", [
  multipleChoiceTextSchema,
  resolvedMultipleChoiceImageSchema,
  trueFalseSchema,
  textResponseSchema,
  mathResponseSchema,
  writeInTheBlankSchema,
  dragAndDropInTheBlankSchema,
  matchingSchema,
]);

export type QuestionInput = z.infer<typeof questionSchema>;
type MultipleChoiceImageInput = z.infer<typeof multipleChoiceImageSchema>;
export type ResolvedQuestion = z.infer<typeof questionOutputSchema>;
type ResolvedMultipleChoiceImageQuestion = z.infer<
  typeof resolvedMultipleChoiceImageSchema
>;

export { questionSchema, questionOutputSchema };

async function resolveImageOption(
  option: MultipleChoiceImageInput["options"][number],
): Promise<
  | {
    ok: true;
    option: z.infer<typeof resolvedImageChoiceSchema>;
  }
  | {
    ok: false;
    optionId: z.infer<typeof multipleChoiceOptionIdSchema>;
    message: string;
  }
> {
  try {
    const result = await imageSearchSelector({
      prompt: option.imageDescription,
      mode: "fast",
      maxCandidates: 4,
    });

    if (!result.imageURL) {
      return {
        ok: false,
        optionId: option.id,
        message: "Image search returned no image URL.",
      };
    }

    return {
      ok: true,
      option: {
        id: option.id,
        imageUrl: result.imageURL,
        thumbnailImageUrl: result.thumbnailImageURL || undefined,
        altText: option.altText,
      },
    };
  } catch (error) {
    return {
      ok: false,
      optionId: option.id,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveImageQuestion(
  question: MultipleChoiceImageInput,
): Promise<ResolvedMultipleChoiceImageQuestion> {
  const results = await Promise.all(
    question.options.map((option) => resolveImageOption(option)),
  );
  const failures = results.filter(
    (result): result is Extract<typeof result, { ok: false }> => !result.ok,
  );

  if (failures.length > 0) {
    const details = failures
      .map((failure) => `option "${failure.optionId}": ${failure.message}`)
      .join("; ");
    throw new Error(
      `Failed to resolve images for multiple_choice_image (${failures.length}/${question.options.length}): ${details}`,
    );
  }

  return {
    ...question,
    options: results.flatMap((result) => result.ok ? [result.option] : []),
  };
}

export async function resolveQuestion(
  question: QuestionInput,
): Promise<ResolvedQuestion> {
  if (question.questionType === "multiple_choice_image") {
    return await resolveImageQuestion(question);
  }

  return question;
}

async function executeQuestion(
  { question }: { question: QuestionInput },
): Promise<ResolvedQuestion> {
  return await resolveQuestion(question);
}

// The union is nested under an object because models require a tool's
// root input schema to be an object; a root-level union is rejected.
const questionInputSchema = z.object({
  question: questionSchema,
});

export const questionTool = tool({
  description: QUESTION_TOOL_DESCRIPTION,
  inputSchema: questionInputSchema,
  outputSchema: questionOutputSchema,
  execute: executeQuestion,
});

export type QuestionToolInvocation = UIToolInvocation<typeof questionTool>;

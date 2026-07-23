import { generateText, Output } from "@ai";
import { z } from "@zod";

import {
  questionOutputSchema,
  questionSchema,
  resolveQuestion,
  type ResolvedQuestion,
} from "../question/index.ts";

type ExamPromptInput = {
  title: string;
  topic: string;
  brief: string;
  questionCount: number;
  preferredQuestionTypes?: string[];
  difficulty?: string;
};

export function buildExamGenerationPrompt(exam: ExamPromptInput): string {
  const preferredTypes = exam.preferredQuestionTypes?.length
    ? exam.preferredQuestionTypes.join(", ")
    : "a sensible mix of types that fit the brief";

  return [
    `Create exactly ${exam.questionCount} exam questions.`,
    `Title: ${exam.title}`,
    `Topic: ${exam.topic}`,
    `Difficulty: ${exam.difficulty ?? "intermediate"}`,
    `Preferred question types: ${preferredTypes}`,
    "",
    "Brief:",
    exam.brief,
    "",
    "Requirements:",
    "- Return exactly the requested number of questions.",
    "- Each question must be a complete, valid question object (correct answers, options, blanks, etc.).",
    "- Prefer variety across the set when the brief allows it.",
    "- Do not include multiple_choice_image questions.",
    "- Make questions self-contained; do not assume prior chat context.",
  ].join("\n");
}

export const examQuestionTypeSchema = z.enum([
  "multiple_choice_text",
  "true_false",
  "text_response",
  "math_response",
  "write_in_the_blank",
  "drag_and_drop_in_the_blank",
  "matching",
]);

export const assessmentDifficultySchema = z.enum([
  "introductory",
  "intermediate",
  "advanced",
]);

export const examInputSchema = z.object({
  assessmentType: z.literal("exam").describe(
    "A multi-question test. Provide a brief; questions are generated for you.",
  ),
  title: z.string().min(1).describe(
    "Short learner-facing title for the assessment.",
  ),
  topic: z.string().min(1).describe(
    "The subject or skill area being assessed.",
  ),
  brief: z.string().min(1).describe(
    "What the exam should cover: concepts, skills, constraints, and any must-include items.",
  ),
  questionCount: z.number().int().min(2).max(15).describe(
    "How many questions to generate (2–15).",
  ),
  preferredQuestionTypes: z.array(examQuestionTypeSchema).min(1).optional()
    .describe(
      "Optional preferred question types. Omit to let the generator choose a sensible mix.",
    ),
  difficulty: assessmentDifficultySchema.optional().describe(
    "Overall difficulty. Defaults to intermediate if omitted.",
  ),
});

export const examOutputSchema = examInputSchema.extend({
  questions: z.array(questionOutputSchema).min(1).describe(
    "The generated, fully resolved exam questions.",
  ),
});

export type ExamAssessmentInput = z.infer<typeof examInputSchema>;
export type ExamAssessmentOutput = z.infer<typeof examOutputSchema>;

const examQuestionsResultSchema = z.object({
  questions: z.array(questionSchema).min(1),
});

const EXAM_GENERATOR_MODEL = "google/gemini-3.6-flash" as const;

async function createExamQuestions(
  exam: ExamAssessmentInput,
): Promise<ResolvedQuestion[]> {
  const { output } = await generateText({
    model: EXAM_GENERATOR_MODEL,
    output: Output.object({
      schema: examQuestionsResultSchema,
      name: "exam_questions",
      description: "The full list of exam questions for the assessment.",
    }),
    prompt: buildExamGenerationPrompt(exam),
  });

  if (output.questions.length !== exam.questionCount) {
    throw new Error(
      `Exam generator returned ${output.questions.length} questions; expected ${exam.questionCount}.`,
    );
  }

  return await Promise.all(
    output.questions.map((question) => resolveQuestion(question)),
  );
}

export async function createExam(
  exam: ExamAssessmentInput,
): Promise<ExamAssessmentOutput> {
  const questions = await createExamQuestions(exam);
  return { ...exam, questions };
}

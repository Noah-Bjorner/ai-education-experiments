import { generateText, Output } from "@ai";
import { z } from "@zod";

import {
  questionSchema,
  resolveQuestion,
  type ResolvedQuestion,
} from "../question/index.ts";

export type ExamAssessmentInput = {
  assessmentType: "exam";
  title: string;
  instructions: string;
  sourceMaterial?: string;
};

export type ExamAssessmentOutput = ExamAssessmentInput & {
  questions: ResolvedQuestion[];
};

export function buildExamGenerationPrompt(exam: ExamAssessmentInput): string {
  const sections = [
    "Create a multi-question exam that matches the title and learner instructions.",
    `Title: ${exam.title}`,
    "",
    "Learner instructions:",
    exam.instructions,
  ];

  if (exam.sourceMaterial) {
    sections.push(
      "",
      "Source material (base questions on this; do not invent conflicting facts):",
      exam.sourceMaterial,
    );
  }

  sections.push(
    "",
    "Requirements:",
    "- Generate between 2 and 15 questions (choose a count that fits the instructions).",
    "- Each question must be a complete, valid question object (correct answers, options, blanks, etc.).",
    "- Prefer variety across question types when the instructions allow it.",
    "- Align questions with the learner instructions.",
    "- When source material is provided, ground questions in it.",
    "- Do not include multiple_choice_image questions.",
    "- Make questions self-contained; do not assume prior chat context beyond any source material above.",
  );

  return sections.join("\n");
}

const examQuestionsResultSchema = z.object({
  questions: z.array(questionSchema).min(2).max(15),
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

import { generateText, isStepCount, type StopCondition } from "@ai";

import {
  QUESTION_TYPE_GUIDANCE,
  questionTool,
  type ResolvedQuestion,
} from "../question/index.ts";
import { createToolCallRepair } from "../shared/repair-tool-call/index.ts";

const EXAM_GENERATOR_MODEL = "google/gemini-3.6-flash" as const;
const EXAM_REPAIR_TOOL_CALL_MODEL = "openai/gpt-5.6-sol" as const;

const MIN_EXAM_QUESTIONS = 2;
const MAX_EXAM_QUESTIONS = 15;
const MAX_EXAM_GENERATION_STEPS = 4;

const examQuestionTools = { question: questionTool };

export type ExamAssessmentInput = {
  assessmentType: "exam";
  title: string;
  instructions: string;
  questionPlan: string;
  sourceMaterial?: string;
};

export type ExamAssessmentOutput = ExamAssessmentInput & {
  questions: ResolvedQuestion[];
};

export function buildExamGenerationPrompt(exam: ExamAssessmentInput): string {
  const sections = [
    "Create a multi-question exam.",
    `Title: ${exam.title}`,
    "",
    "Question plan:",
    exam.questionPlan,
  ];

  if (exam.sourceMaterial) {
    sections.push(
      "",
      "Source material (optional reference — use when the question plan needs facts from it; do not feel bound to cover all of it):",
      exam.sourceMaterial,
    );
  }

  sections.push(
    "",
    "Follow the question plan. Call the question tool once per question in a single parallel response.",
    `Generate between ${MIN_EXAM_QUESTIONS} and ${MAX_EXAM_QUESTIONS} questions (use the plan's count when it states one).`,
    "",
    "Question type guidance:",
    QUESTION_TYPE_GUIDANCE,
  );

  return sections.join("\n");
}

function countQuestions(
  steps: ReadonlyArray<{ staticToolResults: ReadonlyArray<unknown> }>,
): number {
  return steps.reduce((total, step) => total + step.staticToolResults.length, 0);
}

const stopWhenExamIsFull: StopCondition<typeof examQuestionTools> = (
  { steps },
) => countQuestions(steps) >= MAX_EXAM_QUESTIONS;

function dedupeQuestions(questions: ResolvedQuestion[]): ResolvedQuestion[] {
  const seenQuestionTexts = new Set<string>();

  return questions.filter((question) => {
    const key = question.questionText.trim().toLowerCase();
    if (seenQuestionTexts.has(key)) {
      return false;
    }

    seenQuestionTexts.add(key);
    return true;
  });
}

async function createExamQuestions(
  exam: ExamAssessmentInput,
): Promise<ResolvedQuestion[]> {
  const result = await generateText({
    model: EXAM_GENERATOR_MODEL,
    tools: examQuestionTools,
    prompt: buildExamGenerationPrompt(exam),
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0 ? { toolChoice: "required" } : {},
    stopWhen: [stopWhenExamIsFull, isStepCount(MAX_EXAM_GENERATION_STEPS)],
    experimental_repairToolCall: createToolCallRepair({
      model: EXAM_REPAIR_TOOL_CALL_MODEL,
      tools: examQuestionTools,
    }),
  });

  const questions = dedupeQuestions(
    result.staticToolResults.map((toolResult) => toolResult.output),
  ).slice(0, MAX_EXAM_QUESTIONS);

  if (questions.length < MIN_EXAM_QUESTIONS) {
    throw new Error(
      `Exam generation produced ${questions.length} question(s); at least ${MIN_EXAM_QUESTIONS} are required.`,
    );
  }

  return questions;
}

export async function createExam(
  exam: ExamAssessmentInput,
): Promise<ExamAssessmentOutput> {
  const questions = await createExamQuestions(exam);
  return { ...exam, questions };
}

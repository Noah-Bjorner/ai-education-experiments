import { tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";

import { questionOutputSchema } from "../question/index.ts";
import { createExam } from "./exam.ts";

export const ASSESSMENT_TOOL_DESCRIPTION =
  "Create a formal assessment to evaluate the learner's mastery. Use when you need a thorough check of their understanding.";

export const ASSESSMENT_SYSTEM_PROMPT_DESCRIPTION = [
  "Use when you need a formal, thorough evaluation of the learner's mastery. Choose the assessmentType that best matches the need:",
  "  - exam: a multi-question test. Use when mastery is best shown across several questions in one assessment.",
  "  - essay: one extended written response. Use when mastery is best shown by sustained writing on a single question — reasoning, argumentation, synthesis, or a developed explanation.",
  "  - project: work done outside the app with a file submission as evidence. Use when mastery is best shown by making something — drawing, coding, recording, building.",
  "  - oral: a spoken one-on-one exam. Use when mastery is best shown through conversation — spoken explanation, discussion, or verbal reasoning.",
].join("\n");

export const ASSESSMENT_TYPES = [
  "essay",
  "exam",
  "project",
  "oral",
] as const;

export type AssessmentType = typeof ASSESSMENT_TYPES[number];

export const baseAssessmentSchema = z.object({
  title: z.string().min(1).describe(
    "Learner-facing concise title for the assessment.",
  ),
  instructions: z.string().min(1).describe(
    "Learner-facing description of the assessment task.",
  ),
});

const essaySchema = baseAssessmentSchema.extend({
  assessmentType: z.literal("essay"),
  wordLimit: z.object({
    min: z.number().int().positive().optional().describe(
      "Minimum expected word count, if any.",
    ),
    max: z.number().int().positive().optional().describe(
      "Maximum allowed word count, if any.",
    ),
  }).optional().describe("Optional word-count bounds for the response."),
}).superRefine((essay, ctx) => {
  if (
    essay.wordLimit?.min !== undefined &&
    essay.wordLimit?.max !== undefined &&
    essay.wordLimit.min > essay.wordLimit.max
  ) {
    ctx.addIssue({
      code: "custom",
      message: "wordLimit.min must be less than or equal to wordLimit.max.",
      path: ["wordLimit", "min"],
    });
  }
});

const projectSchema = baseAssessmentSchema.extend({
  assessmentType: z.literal("project"),
});

const oralSchema = baseAssessmentSchema.extend({
  assessmentType: z.literal("oral"),
  teacherInstructions: z.string().min(1).describe(
    "Instructions for the teacher conducting this oral exam. Not shown to the learner — use instructions for that. Include the complete exam plan: every question or topic in order, how to progress through the session, what a strong answer looks like, and when to wrap up. If the exam uses an image or other asset, include its URL here.",
  ),
});

const examInputSchema = baseAssessmentSchema.extend({
  assessmentType: z.literal("exam"),
  questionPlan: z.string().min(1).describe(
    "Required. Not shown to the learner. Private brief for the nested question generator. Include target question count, topics or skills to cover, preferred question types or mix when relevant, difficulty, what to emphasize, and what to avoid. Distill relevant chat context into this plan if relevant.",
  ),
  sourceMaterial: z.string().min(1).optional().describe(
    "Optional. Not shown to the learner. Factual grounding for the nested question generator: key facts, definitions, or short excerpts from chat or files. Use when questions must stay accurate to specific taught content. Prefer a concise fact brief over a transcript dump. Use questionPlan for structure and focus; use sourceMaterial for the facts themselves.",
  ),
});

const examOutputSchema = examInputSchema.extend({
  questions: z.array(questionOutputSchema).min(2).max(15).describe(
    "The generated, fully resolved exam questions.",
  ),
});

const assessmentInputSchema = z.object({
  assessment: z.discriminatedUnion("assessmentType", [
    essaySchema,
    examInputSchema,
    projectSchema,
    oralSchema,
  ]),
});

const assessmentOutputSchema = z.discriminatedUnion("assessmentType", [
  essaySchema,
  examOutputSchema,
  projectSchema,
  oralSchema,
]);

type AssessmentInput = z.infer<typeof assessmentInputSchema>["assessment"];
type EssayAssessment = z.infer<typeof essaySchema>;
type ProjectAssessment = z.infer<typeof projectSchema>;
type OralAssessment = z.infer<typeof oralSchema>;
export type AssessmentToolOutput = z.infer<typeof assessmentOutputSchema>;

function createEssay(essay: EssayAssessment): EssayAssessment {
  return essay;
}

function createProject(project: ProjectAssessment): ProjectAssessment {
  return project;
}

function createOral(oral: OralAssessment): OralAssessment {
  return oral;
}

async function executeAssessment(
  { assessment }: { assessment: AssessmentInput },
): Promise<AssessmentToolOutput> {
  switch (assessment.assessmentType) {
    case "essay":
      return createEssay(assessment);
    case "exam":
      return await createExam(assessment);
    case "project":
      return createProject(assessment);
    case "oral":
      return createOral(assessment);
  }
}

export const assessmentTool = tool({
  description: ASSESSMENT_TOOL_DESCRIPTION,
  inputSchema: assessmentInputSchema,
  outputSchema: assessmentOutputSchema,
  execute: executeAssessment,
});

export type AssessmentToolInvocation = UIToolInvocation<typeof assessmentTool>;

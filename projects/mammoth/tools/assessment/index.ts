import { tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";

import { questionOutputSchema } from "../question/index.ts";
import { createExam } from "./exam.ts";

export const ASSESSMENT_TOOL_DESCRIPTION =
  "Create a longer assessment of the learner's ability — an exam (multi-question), essay, project with a file submission, or oral exam with a voice examiner. Prefer this over the question tool when you need a substantial check, not a single practice item.";

export const ASSESSMENT_SYSTEM_PROMPT_DESCRIPTION = [
  "Use when you want a longer assessment of ability, not a single quick practice question. Prefer the simplest assessmentType that matches the need:",
  "  - essay: one extended written response. Provide title, instructions, and optional word limits.",
  "  - exam: a multi-question test. Provide title and instructions; questions are generated in the tool execute step. Pass optional sourceMaterial when questions should be grounded in chat/file content the nested generator would not otherwise see.",
  "  - project: an offline or creative task (drawing, coding, recording, building, etc.) where the learner submits a file as evidence of completion. Provide title and instructions only.",
  "  - oral: a spoken one-on-one exam with a voice examiner agent. Provide title and learner-facing instructions, plus examinerInstructions that direct the examiner's conversation. Session UI, tools, and transcript handling are frontend concerns.",
  "Do not use this for a single quick check — use the question tool instead.",
].join("\n");


const baseAssessmentSchema = z.object({
  title: z.string().min(1).describe(
    "Short learner-facing title for the assessment.",
  ),
  instructions: z.string().min(1).describe(
    "Learner-facing instructions for how to approach the assessment.",
  ),
});


const essaySchema = baseAssessmentSchema.extend({
  assessmentType: z.literal("essay").describe(
    "A single extended written response that assesses deeper understanding or argumentation.",
  ),
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
  assessmentType: z.literal("project").describe(
    "An offline or creative task (drawing, coding, recording, building, etc.) where the learner submits a file as evidence of completion.",
  ),
});

const oralSchema = baseAssessmentSchema.extend({
  assessmentType: z.literal("oral").describe(
    "A spoken one-on-one exam with a voice examiner agent. The frontend runs the call session; the resulting transcript can be judged afterward.",
  ),
  examinerInstructions: z.string().min(1).describe(
    "Instructions for the voice examiner agent. Direct the conversation: role, topics to cover, probing style, success criteria, and when to wrap up. Not shown to the learner as their brief — use instructions for that. Do not describe frontend tools or session mechanics.",
  ),
});

const examInputSchema = baseAssessmentSchema.extend({
  assessmentType: z.literal("exam").describe(
    "A multi-question test. Questions are generated from the title, instructions, and optional sourceMaterial.",
  ),
  sourceMaterial: z.string().min(1).optional().describe(
    "Optional. Not shown to the learner. Excerpts, summaries, or key facts from chat or files that the exam questions should be based on. Use when the nested question generator needs source content you already have in context.",
  ),
});

const examOutputSchema = examInputSchema.extend({
  questions: z.array(questionOutputSchema).min(2).max(15).describe(
    "The generated, fully resolved exam questions.",
  ),
});

// Root must be an object — models reject a root-level union (same as question tool).
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

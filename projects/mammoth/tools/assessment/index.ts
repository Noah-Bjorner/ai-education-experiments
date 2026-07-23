import { tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";

import { createExam, examInputSchema, examOutputSchema } from "./exam.ts";

export const ASSESSMENT_TOOL_DESCRIPTION =
  "Create a longer assessment of the learner's ability — an exam (multi-question) or an essay. Prefer this over the question tool when you need a substantial check, not a single practice item.";

export const ASSESSMENT_SYSTEM_PROMPT_DESCRIPTION = [
  "Use when you want a longer assessment of ability, not a single quick practice question. Prefer the simplest assessmentType that matches the need:",
  "  - essay: one extended written response. You author the prompt (and optional rubric / word limits) directly — same pattern as the question tool.",
  "  - exam: a multi-question test. You provide a brief (topic, coverage, count, preferred types); questions are generated in the tool execute step.",
  "Do not use this for a single quick check — use the question tool instead.",
].join("\n");

const baseAssessmentSchema = z.object({
  title: z.string().min(1).describe(
    "Short learner-facing title for the assessment.",
  ),
});

/**
 * Essay: parent agent does the thinking and fills this schema.
 * execute is a pass-through (like most question types).
 */
const essaySchema = baseAssessmentSchema.extend({
  assessmentType: z.literal("essay").describe(
    "A single extended written response that assesses deeper understanding or argumentation.",
  ),
  prompt: z.string().min(1).describe(
    "The essay prompt shown to the learner.",
  ),
  rubric: z.string().min(1).optional().describe(
    "How the essay will be evaluated. Shown to the learner when present.",
  ),
  wordLimit: z.object({
    min: z.number().int().positive().optional().describe(
      "Minimum expected word count, if any.",
    ),
    max: z.number().int().positive().optional().describe(
      "Maximum allowed word count, if any.",
    ),
  }).optional().describe("Optional word-count bounds for the response."),
  guidance: z.string().min(1).optional().describe(
    "Optional scaffolding or tips shown to the learner before they write.",
  ),
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

// Root must be an object — models reject a root-level union (same as question tool).
const assessmentInputSchema = z.object({
  assessment: z.discriminatedUnion("assessmentType", [
    essaySchema,
    examInputSchema,
  ]),
});

const assessmentOutputSchema = z.discriminatedUnion("assessmentType", [
  essaySchema,
  examOutputSchema,
]);

type AssessmentInput = z.infer<typeof assessmentInputSchema>["assessment"];
type EssayAssessment = z.infer<typeof essaySchema>;
export type AssessmentToolOutput = z.infer<typeof assessmentOutputSchema>;

function createEssay(essay: EssayAssessment): EssayAssessment {
  return essay;
}

async function executeAssessment(
  { assessment }: { assessment: AssessmentInput },
): Promise<AssessmentToolOutput> {
  switch (assessment.assessmentType) {
    case "essay":
      return createEssay(assessment);
    case "exam":
      return await createExam(assessment);
  }
}

export const assessmentTool = tool({
  description: ASSESSMENT_TOOL_DESCRIPTION,
  inputSchema: assessmentInputSchema,
  outputSchema: assessmentOutputSchema,
  execute: executeAssessment,
});

export type AssessmentToolInvocation = UIToolInvocation<typeof assessmentTool>;

import { z } from "@zod";

const idSchema = z.number().int().positive();
const objectSchema = z.record(z.string(), z.unknown());


export const generateExamInputSchema = z.object({
  course_id: idSchema,
  topic: z.string().trim().min(1).optional(),
  number_of_questions: z.number().int().positive(),
  difficulty_range: z.array(z.number().int()).optional(),
});

export const generateExamOutputSchema = z.object({
  exam_id: idSchema,
});


export const replicateExamInputSchema = z.object({
  exam_id: idSchema,
});

export const replicateExamOutputSchema = z.object({
  exam_id: idSchema,
});


export const submitExamInputSchema = z.object({
  exam_id: idSchema,
  answers: z.array(
    z.object({
      exam_question_id: idSchema,
      user_answer: z.string(),
    }),
  ),
});

export const submitExamOutputSchema = z.object({
  accepted: z.literal(true),
});

export const examInputSchema = z.object({
  exam_id: z.coerce.number().int().positive(),
});

export const examOutputSchema = z.object({
  exam_title: z.string(),
  exam_topic: z.string().optional(),
  exam_number_of_questions: z.number().int().positive(),
  exam_difficulty_range: z.array(z.number().int()).optional(),
  exam_questions: z.array(objectSchema),
});

export const resultsExamInputSchema = z.object({
  exam_id: z.coerce.number().int().positive(),
});

export const resultsExamOutputSchema = z.object({
  exam_info: objectSchema,
  exam_questions: z.array(objectSchema),
});

export type GenerateExamInput = z.infer<typeof generateExamInputSchema>;
export type GenerateExamOutput = z.infer<typeof generateExamOutputSchema>;
export type ReplicateExamInput = z.infer<typeof replicateExamInputSchema>;
export type ReplicateExamOutput = z.infer<typeof replicateExamOutputSchema>;
export type SubmitExamInput = z.infer<typeof submitExamInputSchema>;
export type SubmitExamOutput = z.infer<typeof submitExamOutputSchema>;
export type ExamInput = z.infer<typeof examInputSchema>;
export type ExamOutput = z.infer<typeof examOutputSchema>;
export type ResultsExamInput = z.infer<typeof resultsExamInputSchema>;
export type ResultsExamOutput = z.infer<typeof resultsExamOutputSchema>;

import { z } from "@zod";

export const demoExamRequestSchema = z.object({
  subject: z.string().trim().min(2).max(80),
  examTitle: z.string().trim().min(2).max(120),
  questionCount: z.number().int().min(1).max(50).default(5),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  includeAnswerKey: z.boolean().default(true),
});

export type DemoExamRequest = z.infer<typeof demoExamRequestSchema>;

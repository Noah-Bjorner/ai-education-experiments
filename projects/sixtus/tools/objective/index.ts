import { tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";

export const OBJECTIVE_TOOL_DESCRIPTION = "Create or update the current learning objective and checkpoint statuses.";
export const OBJECTIVE_SYSTEM_PROMPT_DESCRIPTION = "Use when setting or updating the current learning objective. Call this at the start of the turn, before learner-facing text. Follow the objective + checkpoints framework, and keep checkpoint statuses current. Give the objective and each checkpoint a short title. Use demonstrates for what the learner must be able to do. If the learner drops an objective or switches topics, mark it abandoned before starting a new one.";

const checkpointStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "completed",
]);

const objectiveStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "completed",
  "abandoned",
]);

const checkpointSchema = z.object({
  id: z.string().min(1).describe("Stable checkpoint id."),
  title: z.string().min(1).describe("Short title for this checkpoint."),
  status: checkpointStatusSchema.describe(
    "Current progress toward this checkpoint.",
  ),
  demonstrates: z.string().min(1).describe(
    "The knowledge or skill the learner must demonstrate before this checkpoint is complete.",
  ),
});

export const objectiveSchema = z.object({
  objective: z.string().min(1).describe("Short title for the learning goal."),
  status: objectiveStatusSchema.describe(
    "Current status of the overall objective. Use completed only when the learner has demonstrated all checkpoints; use abandoned when the learner drops the objective or switches topics before finishing.",
  ),
  checkpoints: z.array(checkpointSchema).min(1).describe(
    "Learning checkpoints that define what the learner must demonstrate before the objective is complete.",
  ),
});

const objectiveInputSchema = z.object({
  objective: objectiveSchema,
});

export const objectiveTool = tool({
  description: OBJECTIVE_TOOL_DESCRIPTION,
  inputSchema: objectiveInputSchema,
  execute: ({ objective }) => objective,
});

export type ObjectiveToolOutput = z.infer<typeof objectiveSchema>;
export type ObjectiveToolInvocation = UIToolInvocation<typeof objectiveTool>;

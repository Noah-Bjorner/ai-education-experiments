import { tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";

const objectiveStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "completed",
]);

const checkpointSchema = z.object({
  id: z.string().min(1).describe("Stable checkpoint id."),
  title: z.string().min(1).describe("Short learner-facing checkpoint title."),
  status: objectiveStatusSchema.describe(
    "Current progress toward this checkpoint.",
  ),
  demonstrates: z.string().min(1).describe(
    "The knowledge or skill the learner must demonstrate before this checkpoint is complete.",
  ),
});

export const objectiveSchema = z.object({
  objective: z.string().min(1).describe(
    "What the learner should understand or be able to do.",
  ),
  status: objectiveStatusSchema.describe(
    "Current status of the overall objective.",
  ),
  checkpoints: z.array(checkpointSchema).min(1).describe(
    "Learning checkpoints that define what the learner must demonstrate before the objective is complete.",
  ),
});

const objectiveInputSchema = z.object({
  objective: objectiveSchema,
});

export const objectiveTool = tool({
  description:
    "Create or update the current learning objective and checkpoint statuses.",
  inputSchema: objectiveInputSchema,
  execute: ({ objective }) => objective,
});

export type ObjectiveToolOutput = z.infer<typeof objectiveSchema>;
export type ObjectiveToolInvocation = UIToolInvocation<typeof objectiveTool>;

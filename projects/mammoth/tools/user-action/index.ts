import { tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";

export const USER_ACTION_TOOL_DESCRIPTION =
  "Request a structured user action when you need feedback, confirmation, evidence, or an in-app next step from the learner. Make sure to use the exact schema field names.";
export const USER_ACTION_SYSTEM_PROMPT_DESCRIPTION = [
  "Use when you need structured UI for the learner to act or give feedback before you continue. Always use this tool instead of asking for these interactions in plain text. Prefer the simplest actionType that matches the need:",
  "  - real_world_task: when the learner should do something outside the app (practice, read, experiment, habit) and confirm they completed it before you advance.",
  "  - approve_action: when you need explicit approval or decline for something consequential or time-consuming (a course plan, spaced-repetition notifications).",
  "  - check_in_scale: when the learner should self-assess on a numeric scale (confidence, difficulty, readiness).",
  "  - evidence_upload: when the learner should upload or share proof of work made outside the app (photo, document, link, or short text).",
  "  - in_app_redirect: when the learner should go to another in-app place. Use a path-style href such as /chat/new, /chat/{chatId}, /course/{courseId}, or /lesson/{lessonId}.",
].join("\n");

const baseActionSchema = z.object({
  title: z.string().min(1).describe(
    "Short headline shown in the UI card.",
  ),
  description: z.string().min(1).describe(
    "Supporting text explaining what the learner should do and why.",
  ),
});

const taskItemSchema = z.object({
  id: z.string().min(1).describe("Stable id for this checklist item."),
  text: z.string().min(1).describe(
    "The real-world task the learner should complete.",
  ),
});

const realWorldTaskSchema = baseActionSchema.extend({
  actionType: z.literal("real_world_task"),
  tasks: z.array(taskItemSchema).min(1).describe(
    "Checklist of real-world tasks the learner should complete before confirming.",
  ),
  confirmLabel: z.string().min(1).optional().describe(
    'Label for the confirm button. Defaults to "I\'ve done this" in the UI if omitted.',
  ),
});

const approveActionSchema = baseActionSchema.extend({
  actionType: z.literal("approve_action"),
  approveLabel: z.string().min(1).optional().describe(
    'Label for the approve button. Defaults to "Approve" in the UI if omitted.',
  ),
  declineLabel: z.string().min(1).optional().describe(
    'Label for the decline button. Defaults to "Not now" in the UI if omitted.',
  ),
});

const checkInScaleSchema = baseActionSchema.extend({
  actionType: z.literal("check_in_scale"),
  scale: z.object({
    min: z.number().int().describe("Lowest scale value (inclusive)."),
    max: z.number().int().describe("Highest scale value (inclusive)."),
    minLabel: z.string().min(1).describe(
      'Label for the low end of the scale (e.g. "Not confident").',
    ),
    maxLabel: z.string().min(1).describe(
      'Label for the high end of the scale (e.g. "Very confident").',
    ),
  }).describe(
    "Numeric self-assessment scale shown to the learner.",
  ),
});

const evidenceAcceptedTypeSchema = z.enum([
  "image",
  "document",
  "link",
  "text",
]);

const evidenceUploadSchema = baseActionSchema.extend({
  actionType: z.literal("evidence_upload"),
  acceptedTypes: z.array(evidenceAcceptedTypeSchema).min(1).describe(
    "Which kinds of evidence the learner may submit.",
  ),
  guidance: z.string().min(1).optional().describe(
    "Optional guidance describing what good evidence looks like.",
  ),
});

const IN_APP_HREF_PATTERN =
  /^\/(chat\/new|chat\/[^/]+|course\/[^/]+|lesson\/[^/]+)(\/.*)?$/;

const inAppRedirectSchema = baseActionSchema.extend({
  actionType: z.literal("in_app_redirect"),
  href: z.string().min(1).describe(
    "In-app path to navigate to. Use path-style hrefs such as /chat/new, /chat/{chatId}, /course/{courseId}, or /lesson/{lessonId}.",
  ),
  buttonLabel: z.string().min(1).optional().describe(
    "Label for the redirect button. Defaults based on href in the UI if omitted.",
  ),
});

function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return [...duplicates];
}

const userActionSchema = z.discriminatedUnion("actionType", [
  realWorldTaskSchema,
  approveActionSchema,
  checkInScaleSchema,
  evidenceUploadSchema,
  inAppRedirectSchema,
]).superRefine((action, ctx) => {
  if (action.actionType === "real_world_task") {
    const taskIds = action.tasks.map((task) => task.id);

    for (const duplicateId of findDuplicates(taskIds)) {
      ctx.addIssue({
        code: "custom",
        message: `Task id "${duplicateId}" must be unique.`,
        path: ["tasks"],
      });
    }
  }

  if (action.actionType === "check_in_scale") {
    if (action.scale.min >= action.scale.max) {
      ctx.addIssue({
        code: "custom",
        message: "scale.min must be less than scale.max.",
        path: ["scale", "min"],
      });
    }
  }

  if (action.actionType === "evidence_upload") {
    for (const duplicateType of findDuplicates(action.acceptedTypes)) {
      ctx.addIssue({
        code: "custom",
        message: `Accepted type "${duplicateType}" must be unique.`,
        path: ["acceptedTypes"],
      });
    }
  }

  if (
    action.actionType === "in_app_redirect" &&
    !IN_APP_HREF_PATTERN.test(action.href)
  ) {
    ctx.addIssue({
      code: "custom",
      message:
        'href must be an in-app path such as /chat/new, /chat/{chatId}, /course/{courseId}, or /lesson/{lessonId}.',
      path: ["href"],
    });
  }
});

type UserActionInput = z.infer<typeof userActionSchema>;

// The union is nested under an object because models require a tool's
// root input schema to be an object; a root-level union is rejected.
const userActionInputSchema = z.object({
  action: userActionSchema,
});

export const userActionTool = tool({
  description: USER_ACTION_TOOL_DESCRIPTION,
  inputSchema: userActionInputSchema,
  outputSchema: userActionSchema,
  execute: ({ action }: { action: UserActionInput }) => action,
});

export type UserActionToolOutput = z.infer<typeof userActionSchema>;
export type UserActionToolInvocation = UIToolInvocation<typeof userActionTool>;

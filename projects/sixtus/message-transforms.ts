import { z } from "@zod";

import {
  ASSESSMENT_TYPES,
  type AssessmentType,
} from "./tools/assessment/index.ts";
import type { SixtusUIMessage } from "./types.ts";

export const USER_TURN_TYPES = [
  "assessment_submission",
  "question_answer",
  "default",
] as const;

export type UserTurnType = typeof USER_TURN_TYPES[number];

export type { AssessmentType };

/**
 * Shared submission payload for all assessment types.
 * Response guidance is chosen per assessmentType in this file, not sent by the client.
 * Title/instructions live on the prior assessment tool call — no need to repeat them.
 */
export const assessmentSubmissionDataSchema = z.object({
  assessmentType: z.enum(ASSESSMENT_TYPES),
  response: z.unknown().optional(),
});

export type AssessmentSubmissionData = z.infer<
  typeof assessmentSubmissionDataSchema
>;

export const questionAnswerDataSchema = z.object({
  questionText: z.string().optional(),
  answer: z.unknown().optional(),
});

export type QuestionAnswerData = z.infer<typeof questionAnswerDataSchema>;

type MessagePart = SixtusUIMessage["parts"][number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getLatestUserMessage(
  messages: SixtusUIMessage[],
): SixtusUIMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === "user") {
      return message;
    }
  }

  return undefined;
}

function getAssessmentSubmissionData(
  message: SixtusUIMessage,
): AssessmentSubmissionData | undefined {
  for (const part of message.parts) {
    if (!isRecord(part) || part.type !== "data-assessmentSubmission") {
      continue;
    }

    const parsed = assessmentSubmissionDataSchema.safeParse(part.data);
    if (parsed.success) {
      return parsed.data;
    }
  }

  return undefined;
}

function getQuestionAnswerData(
  message: SixtusUIMessage,
): QuestionAnswerData | undefined {
  for (const part of message.parts) {
    if (!isRecord(part) || part.type !== "data-questionAnswer") {
      continue;
    }

    const parsed = questionAnswerDataSchema.safeParse(part.data);
    if (parsed.success) {
      return parsed.data;
    }
  }

  return undefined;
}

function getUserTurnType(message: SixtusUIMessage): UserTurnType {
  if (getAssessmentSubmissionData(message)) {
    return "assessment_submission";
  }

  if (getQuestionAnswerData(message)) {
    return "question_answer";
  }

  return "default";
}

function getMessageText(message: SixtusUIMessage): string {
  return message.parts
    .filter((part): part is Extract<MessagePart, { type: "text" }> =>
      isRecord(part) && part.type === "text" && typeof part.text === "string"
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function rewriteLatestUserMessage(
  messages: SixtusUIMessage[],
  rewrite: (message: SixtusUIMessage) => string,
): SixtusUIMessage[] {
  // Only the latest user message is rewritten. Assistant tool outputs, including
  // gatherContext/searchLibraryContext sources, stay in chat history.
  const latest = getLatestUserMessage(messages);
  if (!latest) {
    return messages;
  }

  const latestIndex = messages.lastIndexOf(latest);
  if (latestIndex < 0) {
    return messages;
  }

  const wrappedText = rewrite(latest);
  const nextMessage: SixtusUIMessage = {
    ...latest,
    parts: [{ type: "text", text: wrappedText }],
  };

  return [
    ...messages.slice(0, latestIndex),
    nextMessage,
    ...messages.slice(latestIndex + 1),
  ];
}

function formatResponse(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }

  if (response === undefined || response === null) {
    return "(no response provided)";
  }

  try {
    return JSON.stringify(response, null, 2);
  } catch {
    return String(response);
  }
}

const ASSESSMENT_RESPONSE_GUIDANCE = {
  essay: [
    "Respond as a teacher after an essay assessment. Structure feedback in this order:",
    "1. Verdict — overall result (e.g. strong / developing / not yet), with a score or level if you can justify one.",
    "2. Meaning — 1 or 2 sentences on what the essay demonstrated vs. what it did not.",
    "3. Evidence — cite specific moments from their writing: at least one clear strength, then name the real gaps that matter (argument, structure, clarity, use of evidence, etc.). If there are several, list them and prioritize by impact — do not hide issues to stay brief. Add brief supporting notes only where they help.",
    "4. Next step — prescribe exactly one concrete revision or practice step (the highest-leverage one), even if multiple gaps were listed.",
    "Be actionable and quantifiable when possible (scores, levels, word-count expectations met/missed).",
  ].join("\n"),
  exam: [
    "Respond as a teacher after a multi-question exam. Structure feedback in this order:",
    "1. Verdict — overall score or percent correct, plus a clear performance band (e.g. mastered / partial / needs review).",
    "2. Meaning — 1 or 2 sentences summarizing what they know well vs. where understanding was weak.",
    "3. Evidence — score each question briefly (correct / incorrect / partial). Name the misconceptions or error patterns that matter; if there are several, list and prioritize them — do not collapse everything into one vague takeaway. Add brief per-question notes only where an explanation helps learning; skip fluff on easy correct answers.",
    "4. Next step — prescribe exactly one concrete next step tied to the highest-priority gap (retry those items, review that topic, or a short practice set), even if multiple issues were listed.",
    "Be actionable and quantifiable (scores, counts correct, which items).",
  ].join("\n"),
  project: [
    "Respond as a teacher after a project submission (file evidence of work done). Structure feedback in this order:",
    "1. Verdict — did the evidence show they completed the brief? State clearly (complete / partially complete / incomplete), with a level or score if justified.",
    "2. Meaning — 1 or 2 sentences on how well the work met the project goals.",
    "3. Evidence — comment on completeness against the brief, then craft/quality of what was submitted. Name the concrete strengths and the gaps that matter; if there are several gaps, list and prioritize them. Secondary polish notes only if needed. Do not invent requirements that were not in the brief.",
    "4. Next step — prescribe exactly one concrete next step (what to fix, add, or rebuild) — the highest-leverage one — even if multiple gaps were listed.",
    "Be actionable and quantifiable when possible (checklist against brief, percent of requirements met). Judge from the submitted evidence.",
  ].join("\n"),
  oral: [
    "Respond as a teacher after an oral exam. You are judging understanding of the subject — not language proficiency, accent, or polished speech.",
    "The input is a speech-to-text transcript: it is imperfect. Do not overreact to odd wording, missing small words, or likely transcription errors. Infer intended meaning generously when the substance is clear; only flag language issues if they clearly block understanding of the content.",
    "Structure feedback in this order:",
    "1. Verdict — overall result on content mastery (strong / developing / not yet), with a level or score if you can justify one.",
    "2. Meaning — 1 or 2 sentences on what they showed they understand vs. what remained thin or confused.",
    "3. Evidence — point to specific exchanges or explanations from the transcript (ideas, reasoning, coverage of topics). Name at least one strength and the content gaps that matter; if there are several, list and prioritize them. Brief notes on completeness only if useful. Ignore fluency/grammar unless it obscured meaning.",
    "4. Next step — prescribe exactly one concrete next step for the highest-priority content gap, even if multiple gaps were listed.",
  ].join("\n"),
} as const satisfies Record<AssessmentType, string>;

function formatAssessmentSubmission(message: SixtusUIMessage): string {
  const data = getAssessmentSubmissionData(message);
  if (!data) {
    return getMessageText(message) ||
      "# Assessment Submission\n\n(missing assessment submission data)";
  }

  return [
    "# Assessment Submission",
    "",
    "## User Response",
    formatResponse(data.response),
    "",
    "## Response Guidance",
    ASSESSMENT_RESPONSE_GUIDANCE[data.assessmentType],
  ].join("\n");
}

const QUESTION_RESPONSE_GUIDANCE = [
  "Respond as a teacher after a practice question. Keep it lighter than a formal assessment.",
  "Structure feedback in this order:",
  "1. Verdict — was the answer correct, partially correct, or incorrect?",
  "2. Meaning — 1 short sentence on what this shows about their understanding.",
  "3. Evidence — briefly explain why the answer is right or wrong; if wrong, name the likely misconception.",
  "4. Next step — one concrete nudge (retry a similar item, clarify a concept, or move on if they got it).",
  "Be clear and concise. Do not over-score or write a long rubric-style review.",
].join("\n");

function formatQuestionAnswer(message: SixtusUIMessage): string {
  const data = getQuestionAnswerData(message);
  if (!data) {
    return getMessageText(message) ||
      "# Question Answer\n\n(missing question answer data)";
  }

  const sections = [
    "# Question Answer",
    "",
  ];

  if (data.questionText) {
    sections.push("## Question", data.questionText, "");
  }

  sections.push(
    "## User Response",
    formatResponse(data.answer),
    "",
    "## Response Guidance",
    QUESTION_RESPONSE_GUIDANCE,
  );

  return sections.join("\n");
}

export function transformMessages(messages: SixtusUIMessage[]): SixtusUIMessage[] {
  const latest = getLatestUserMessage(messages);
  if (!latest) {
    return messages;
  }

  switch (getUserTurnType(latest)) {
    case "assessment_submission":
      return rewriteLatestUserMessage(messages, formatAssessmentSubmission);
    case "question_answer":
      return rewriteLatestUserMessage(messages, formatQuestionAnswer);
    default:
      return messages;
  }
}

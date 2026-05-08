import "@std/dotenv/load";
import { createGateway, generateText } from "@ai";
import { z } from "@zod";

import { parseJsonWithSchemaSafely } from "../../../helper/json.ts";
import { swedishCourseLookupAgent } from "./index.ts";
import {
  type SwedishCourseLookupEvalCase,
  swedishCourseLookupEvalCases,
} from "./eval-cases.ts";
import {
  type SwedishCourseLookupResult,
  swedishCourseLookupResultSchema,
} from "./schema.ts";

const DEFAULT_JUDGE_MODEL = "openai/gpt-5.5";

const FIELD_WEIGHTS = {
  title: 0.2,
  subject: 0.15,
  topics: 0.3,
  grading_guidelines: 0.25,
  language: 0.1,
} as const satisfies Record<keyof SwedishCourseLookupResult, number>;

const fieldGradeSchema = z.object({
  score: z.number().min(0).max(1),
  feedback: z.string().trim().min(1),
});

const gradingGuidelinesJudgeSchema = z.object({
  grading_guidelines: fieldGradeSchema,
});

type FieldName = keyof SwedishCourseLookupResult;

export type FieldGrade = z.infer<typeof fieldGradeSchema>;

export type FieldGrades = Record<FieldName, FieldGrade>;

export interface SwedishCourseLookupCaseReport {
  id: string;
  prompt: string;
  score: number;
  feedback: string;
  fields: FieldGrades;
  reference: SwedishCourseLookupResult;
  actual?: SwedishCourseLookupResult;
  rawOutput?: string;
  error?: string;
  durationMs: number;
}

export interface SwedishCourseLookupEvalReport {
  createdAt: string;
  score: number;
  caseCount: number;
  passedParseCount: number;
  failedCaseCount: number;
  cases: SwedishCourseLookupCaseReport[];
}

export async function runSwedishCourseLookupEval(
  cases: SwedishCourseLookupEvalCase[] = swedishCourseLookupEvalCases,
): Promise<SwedishCourseLookupEvalReport> {
  const settledResults = await Promise.allSettled(
    cases.map((evalCase) => runSwedishCourseLookupEvalCase(evalCase)),
  );

  const caseReports = settledResults.map((result, index) => {
    if (result.status === "fulfilled") return result.value;

    return createFailedCaseReport(
      cases[index],
      `Unexpected eval runner error: ${formatError(result.reason)}`,
      0,
    );
  });

  const score = average(caseReports.map((result) => result.score));

  return {
    createdAt: new Date().toISOString(),
    score,
    caseCount: caseReports.length,
    passedParseCount: caseReports.filter((result) => result.actual).length,
    failedCaseCount: caseReports.filter((result) => result.error).length,
    cases: caseReports,
  };
}

export async function runSwedishCourseLookupEvalCase(
  evalCase: SwedishCourseLookupEvalCase,
): Promise<SwedishCourseLookupCaseReport> {
  const startedAt = Date.now();

  try {
    const result = await swedishCourseLookupAgent.generate({
      prompt: evalCase.prompt,
    });
    const rawOutput = result.text;
    const actual = parseJsonWithSchemaSafely(
      rawOutput,
      swedishCourseLookupResultSchema,
    );

    if (!actual) {
      return createFailedCaseReport(
        evalCase,
        "Agent response could not be parsed as a valid SwedishCourseLookupResult.",
        Date.now() - startedAt,
        rawOutput,
      );
    }

    const fields = await gradeSwedishCourseLookupResult(evalCase, actual);
    const score = weightedAverage(fields, FIELD_WEIGHTS);

    return {
      id: evalCase.id,
      prompt: evalCase.prompt,
      score,
      feedback: summarizeFieldFeedback(fields),
      fields,
      reference: evalCase.reference,
      actual,
      rawOutput,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return createFailedCaseReport(
      evalCase,
      `Agent execution failed: ${formatError(error)}`,
      Date.now() - startedAt,
    );
  }
}

export async function gradeSwedishCourseLookupResult(
  evalCase: SwedishCourseLookupEvalCase,
  actual: SwedishCourseLookupResult,
): Promise<FieldGrades> {
  return {
    title: gradeNormalizedExactField(
      "title",
      evalCase.reference.title,
      actual.title,
    ),
    subject: gradeExactField(
      "subject",
      evalCase.reference.subject,
      actual.subject,
    ),
    topics: gradeTopics(evalCase.reference.topics, actual.topics),
    grading_guidelines: await gradeGuidelinesWithJudge(evalCase, actual),
    language: gradeExactField(
      "language",
      evalCase.reference.language,
      actual.language,
    ),
  };
}

function gradeExactField(
  fieldName: FieldName,
  expected: string,
  actual: string,
): FieldGrade {
  if (actual === expected) {
    return {
      score: 1,
      feedback: `${fieldName} matched exactly.`,
    };
  }

  return {
    score: 0,
    feedback: `${fieldName} mismatch. Expected "${expected}", got "${actual}".`,
  };
}

function gradeNormalizedExactField(
  fieldName: FieldName,
  expected: string,
  actual: string,
): FieldGrade {
  if (normalizeText(actual) === normalizeText(expected)) {
    return {
      score: 1,
      feedback: `${fieldName} matched after normalization.`,
    };
  }

  return {
    score: 0,
    feedback: `${fieldName} mismatch. Expected "${expected}", got "${actual}".`,
  };
}

function gradeTopics(
  expectedTopics: string[],
  actualTopics: string[],
): FieldGrade {
  const expected = new Set(expectedTopics.map(normalizeText));
  const actual = new Set(actualTopics.map(normalizeText));

  if (expected.size === 0 && actual.size === 0) {
    return {
      score: 1,
      feedback: "topics matched exactly; both were empty.",
    };
  }

  if (expected.size === 0) {
    return {
      score: 0,
      feedback: `Expected no topics, but got ${actualTopics.length}.`,
    };
  }

  const matched = [...expected].filter((topic) => actual.has(topic));
  const missing = expectedTopics.filter((topic) =>
    !actual.has(normalizeText(topic))
  );
  const extra = actualTopics.filter((topic) =>
    !expected.has(normalizeText(topic))
  );

  const precision = actual.size === 0 ? 0 : matched.length / actual.size;
  const recall = matched.length / expected.size;
  const score = precision + recall === 0
    ? 0
    : (2 * precision * recall) / (precision + recall);

  if (score === 1) {
    return {
      score,
      feedback: "topics matched exactly, ignoring order and normalization.",
    };
  }

  return {
    score,
    feedback: [
      `topics overlap score ${roundScore(score)}.`,
      missing.length > 0 ? `Missing: ${missing.join("; ")}.` : undefined,
      extra.length > 0 ? `Extra: ${extra.join("; ")}.` : undefined,
    ].filter(Boolean).join(" "),
  };
}

async function gradeGuidelinesWithJudge(
  evalCase: SwedishCourseLookupEvalCase,
  actual: SwedishCourseLookupResult,
): Promise<FieldGrade> {
  const apiKey = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!apiKey) {
    return gradeGuidelinesHeuristically(
      evalCase.reference.grading_guidelines,
      actual.grading_guidelines,
      "AI_GATEWAY_API_KEY is missing, so the LLM judge was skipped.",
    );
  }

  const gateway = createGateway({ apiKey });
  const judgeModel = Deno.env.get("SWEDISH_COURSE_LOOKUP_JUDGE_MODEL") ??
    DEFAULT_JUDGE_MODEL;

  const result = await generateText({
    model: gateway(judgeModel),
    temperature: 0,
    prompt: buildGuidelinesJudgePrompt(evalCase, actual),
  });

  const parsed = parseJsonWithSchemaSafely(
    result.text,
    gradingGuidelinesJudgeSchema,
  );

  if (!parsed) {
    return gradeGuidelinesHeuristically(
      evalCase.reference.grading_guidelines,
      actual.grading_guidelines,
      "LLM judge response could not be parsed, so heuristic grading was used.",
    );
  }

  return parsed.grading_guidelines;
}

function buildGuidelinesJudgePrompt(
  evalCase: SwedishCourseLookupEvalCase,
  actual: SwedishCourseLookupResult,
): string {
  return `You are grading a Swedish curriculum lookup agent.

Score only the "grading_guidelines" field from 0 to 1.

Rubric:
- 1.0: The answer preserves the official grading criteria for the same course/grade level, with the correct grade structure and materially complete wording.
- 0.7: The answer uses the right course/grade level and mostly correct criteria, but has minor omissions, paraphrasing, or formatting issues.
- 0.4: The answer is partially related but misses important grade levels, uses broad summaries, or mixes criteria from nearby courses.
- 0.0: The answer is for the wrong course/grade level, invents criteria, or is empty.

Treat markdown formatting differences as minor unless they remove important structure.
Use the judge notes as extra guidance when present.

Return only JSON with this shape:
{
  "grading_guidelines": {
    "score": number,
    "feedback": string
  }
}

Case id: ${evalCase.id}
Prompt: ${evalCase.prompt}
Judge notes: ${evalCase.judgeNotes ?? "None"}

Reference grading_guidelines:
${evalCase.reference.grading_guidelines}

Actual grading_guidelines:
${actual.grading_guidelines}`;
}

function gradeGuidelinesHeuristically(
  expected: string,
  actual: string,
  note: string,
): FieldGrade {
  const expectedGrades = extractGradeMarkers(expected);
  const actualGrades = extractGradeMarkers(actual);
  const missingGrades = expectedGrades.filter((grade) =>
    !actualGrades.includes(grade)
  );
  const structureScore = expectedGrades.length === 0
    ? 1
    : (expectedGrades.length - missingGrades.length) / expectedGrades.length;
  const contentScore = tokenF1(expected, actual);
  const score = (structureScore * 0.65) + (contentScore * 0.35);

  return {
    score,
    feedback: [
      note,
      `Heuristic grading_guidelines score ${roundScore(score)}.`,
      missingGrades.length > 0
        ? `Missing grade markers: ${missingGrades.join(", ")}.`
        : "Expected grade markers were present.",
    ].join(" "),
  };
}

function extractGradeMarkers(text: string): string[] {
  const markers = new Set<string>();
  const regex = /\b(?:betyget|betyg|grade)\s+([ABCDEF])\b/gi;
  for (const match of text.matchAll(regex)) {
    markers.add(match[1].toUpperCase());
  }

  if (/godtagbara kunskaper/i.test(text)) {
    markers.add("GODTAGBARA_KUNSKAPER");
  }

  return [...markers].sort();
}

function tokenF1(expected: string, actual: string): number {
  const expectedTokens = tokenize(expected);
  const actualTokens = tokenize(actual);

  if (expectedTokens.length === 0 && actualTokens.length === 0) return 1;
  if (expectedTokens.length === 0 || actualTokens.length === 0) return 0;

  const actualCounts = countTokens(actualTokens);
  let matches = 0;

  for (const token of expectedTokens) {
    const count = actualCounts.get(token) ?? 0;
    if (count <= 0) continue;
    matches++;
    actualCounts.set(token, count - 1);
  }

  const precision = matches / actualTokens.length;
  const recall = matches / expectedTokens.length;

  return precision + recall === 0
    ? 0
    : (2 * precision * recall) / (precision + recall);
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function countTokens(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function weightedAverage(
  fields: FieldGrades,
  weights: typeof FIELD_WEIGHTS,
): number {
  return Object.entries(weights).reduce((total, [fieldName, weight]) => {
    return total + (fields[fieldName as FieldName].score * weight);
  }, 0);
}

function summarizeFieldFeedback(fields: FieldGrades): string {
  return Object.entries(fields)
    .map(([fieldName, grade]) => {
      return `${fieldName}: ${roundScore(grade.score)} - ${grade.feedback}`;
    })
    .join("\n");
}

function createFailedCaseReport(
  evalCase: SwedishCourseLookupEvalCase,
  error: string,
  durationMs: number,
  rawOutput?: string,
): SwedishCourseLookupCaseReport {
  const fields = createZeroFieldGrades(error);

  return {
    id: evalCase.id,
    prompt: evalCase.prompt,
    score: 0,
    feedback: error,
    fields,
    reference: evalCase.reference,
    rawOutput,
    error,
    durationMs,
  };
}

function createZeroFieldGrades(feedback: string): FieldGrades {
  return {
    title: { score: 0, feedback },
    subject: { score: 0, feedback },
    topics: { score: 0, feedback },
    grading_guidelines: { score: 0, feedback },
    language: { score: 0, feedback },
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

if (import.meta.main) {
  const report = await runSwedishCourseLookupEval();
  console.log(JSON.stringify(report, null, 2));
}




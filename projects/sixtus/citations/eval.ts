import { partitionCitationRefs } from "./extract.ts";
import { isSafeHttpUrl } from "./normalize.ts";
import type { CitationSource } from "./schema.ts";

export type CitationEvalCase = {
  id: string;
  answer: string;
  sources: CitationSource[];
  expectedResolvedIds: string[];
  expectedUnresolvedIds: string[];
};

export type CitationEvalScores = {
  structural: number;
  resolvability: number;
  completeness: number;
};

export type CitationEvalCaseReport = CitationEvalCase & {
  scores: CitationEvalScores;
  score: number;
  resolvedIds: string[];
  unresolvedIds: string[];
};

export type CitationEvalReport = {
  createdAt: string;
  score: number;
  caseCount: number;
  cases: CitationEvalCaseReport[];
};

export function scoreCitationCase(evalCase: CitationEvalCase): CitationEvalCaseReport {
  const { resolved, unresolved } = partitionCitationRefs(
    evalCase.answer,
    evalCase.sources,
  );
  const resolvedIds = resolved.map((source) => source.id);
  const unresolvedIds = unresolved;

  const structural = scoreIdSet(
    resolvedIds,
    evalCase.expectedResolvedIds,
    unresolvedIds,
    evalCase.expectedUnresolvedIds,
  );
  const resolvability = scoreResolvability(evalCase.sources, resolvedIds);
  const completeness = scoreCompleteness(
    evalCase.expectedResolvedIds,
    resolvedIds,
  );

  const scores = { structural, resolvability, completeness };
  return {
    ...evalCase,
    scores,
    score: (structural + resolvability + completeness) / 3,
    resolvedIds,
    unresolvedIds,
  };
}

export function runCitationEval(
  cases: CitationEvalCase[],
): CitationEvalReport {
  const reports = cases.map(scoreCitationCase);
  const score = reports.length === 0
    ? 0
    : reports.reduce((sum, report) => sum + report.score, 0) / reports.length;

  return {
    createdAt: new Date().toISOString(),
    score,
    caseCount: reports.length,
    cases: reports,
  };
}

function scoreIdSet(
  actualResolved: string[],
  expectedResolved: string[],
  actualUnresolved: string[],
  expectedUnresolved: string[],
): number {
  const resolvedMatch = sameSet(actualResolved, expectedResolved);
  const unresolvedMatch = sameSet(actualUnresolved, expectedUnresolved);
  if (resolvedMatch && unresolvedMatch) return 1;
  if (resolvedMatch || unresolvedMatch) return 0.5;
  return 0;
}

function scoreResolvability(
  sources: CitationSource[],
  resolvedIds: string[],
): number {
  if (resolvedIds.length === 0) return sources.every((source) => !source.url || isSafeHttpUrl(source.url)) ? 1 : 0;
  const cited = sources.filter((source) => resolvedIds.includes(source.id));
  if (cited.length === 0) return 0;
  const valid = cited.filter((source) => !source.url || isSafeHttpUrl(source.url));
  return valid.length / cited.length;
}

function scoreCompleteness(
  expectedResolved: string[],
  actualResolved: string[],
): number {
  if (expectedResolved.length === 0) return 1;
  const found = expectedResolved.filter((id) => actualResolved.includes(id));
  return found.length / expectedResolved.length;
}

function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const expected = new Set(right);
  return left.every((value) => expected.has(value));
}

import type { CitationEvalCase } from "./eval.ts";
import type { CitationSource } from "./schema.ts";

const postgresSource: CitationSource = {
  id: "src_callabc_1",
  kind: "web",
  title: "PostgreSQL 17 release notes",
  url: "https://www.postgresql.org/docs/17/release-17.html",
  excerpt: "JIT is controlled by the jit GUC.",
};

const librarySource: CitationSource = {
  id: "src_callxyz_1",
  kind: "library",
  title: "Lecture notes",
  url: "https://static.example.com/notes.md",
  excerpt: "Mitochondria produce ATP through cellular respiration.",
  locator: { label: "chunk 2" },
};

export const citationEvalCases: CitationEvalCase[] = [
  {
    id: "known-ref-resolves",
    answer:
      `Postgres 17 toggles JIT with the \`jit\` setting.<citation ref="src_callabc_1" />`,
    sources: [postgresSource],
    expectedResolvedIds: ["src_callabc_1"],
    expectedUnresolvedIds: [],
  },
  {
    id: "fabricated-ref-unresolved",
    answer: `ATP is made in mitochondria.<citation ref="src_invented_9" />`,
    sources: [librarySource],
    expectedResolvedIds: [],
    expectedUnresolvedIds: ["src_invented_9"],
  },
  {
    id: "mixed-refs",
    answer:
      `JIT is a GUC.<citation ref="src_callabc_1" /> ATP is made in mitochondria.<citation ref="src_invented_9" />`,
    sources: [postgresSource, librarySource],
    expectedResolvedIds: ["src_callabc_1"],
    expectedUnresolvedIds: ["src_invented_9"],
  },
];

if (import.meta.main) {
  const { runCitationEval } = await import("./eval.ts");
  console.log(JSON.stringify(runCitationEval(citationEvalCases), null, 2));
}

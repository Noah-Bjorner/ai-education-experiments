import { assertEquals, assertMatch } from "@std/assert";

import {
  assignCitationIds,
  createCitationId,
  groundedContextSchema,
} from "./schema.ts";
import {
  canonicalizeHttpUrl,
  groundedContextFromDrafts,
  isSafeHttpUrl,
  MAX_EXCERPT_CHARS,
  normalizeDeepResearchResult,
  normalizeLibraryMatch,
  normalizeToolResults,
  normalizeTranscriptResult,
  normalizeWebExtractResult,
  normalizeWebSearchResult,
} from "./normalize.ts";
import {
  collectCitationSourcesFromMessages,
  collectCitationSourcesFromToolResults,
  listCitationRefs,
  partitionCitationRefs,
} from "./extract.ts";
import { formatGroundedContextForModel, rewriteDocumentCitations } from "./format.ts";
import { citationEvalCases } from "./eval-cases.ts";
import { runCitationEval } from "./eval.ts";
import { createSixtusTools } from "../tools/index.ts";
import { createSixtusSystemPrompt } from "../chat/prompt.ts";

Deno.test("createCitationId sanitizes toolCallId and stays unique per index", () => {
  assertEquals(createCitationId("call_abc", 1), "src_call_abc_1");
  assertEquals(createCitationId("call/abc!", 2), "src_callabc_2");
  assertEquals(
    createCitationId("call_one", 1) === createCitationId("call_two", 1),
    false,
  );
});

Deno.test("two gather calls produce non-colliding ids", () => {
  const first = assignCitationIds([
    { kind: "web", title: "A", url: "https://a.example", excerpt: "alpha" },
  ], "call_one");
  const second = assignCitationIds([
    { kind: "web", title: "B", url: "https://b.example", excerpt: "beta" },
  ], "call_two");

  assertEquals(first[0]!.id, "src_call_one_1");
  assertEquals(second[0]!.id, "src_call_two_1");
  assertEquals(new Set([...first, ...second].map((source) => source.id)).size, 2);
});

Deno.test("isSafeHttpUrl accepts only http(s)", () => {
  assertEquals(isSafeHttpUrl("https://example.com/a"), true);
  assertEquals(isSafeHttpUrl("http://example.com/a"), true);
  assertEquals(isSafeHttpUrl("javascript:alert(1)"), false);
  assertEquals(isSafeHttpUrl("ftp://example.com/a"), false);
  assertEquals(isSafeHttpUrl("not a url"), false);
});

Deno.test("canonicalizeHttpUrl drops hashes", () => {
  assertEquals(
    canonicalizeHttpUrl("https://example.com/path?q=1#section"),
    "https://example.com/path?q=1",
  );
  assertEquals(canonicalizeHttpUrl("javascript:alert(1)"), undefined);
});

Deno.test("normalizeWebSearchResult keeps provider excerpts and drops bad urls", () => {
  const drafts = normalizeWebSearchResult({
    results: [
      {
        url: "https://example.com/article",
        title: "Example",
        excerpts: ["Relevant passage about JIT."],
      },
      {
        url: "javascript:alert(1)",
        title: "Bad",
        excerpts: ["Nope"],
      },
      {
        url: "https://example.com/empty",
        title: "Empty",
        excerpts: [],
      },
    ],
  });

  assertEquals(drafts.length, 1);
  assertEquals(drafts[0]!.url, "https://example.com/article");
  assertEquals(drafts[0]!.kind, "web");
  assertMatch(drafts[0]!.excerpt, /JIT/);
});

Deno.test("normalizeWebExtractResult prefers excerpts over full content", () => {
  const drafts = normalizeWebExtractResult({
    results: [{
      url: "https://example.com/page",
      title: "Page",
      excerpts: ["Short excerpt."],
      full_content: "A".repeat(MAX_EXCERPT_CHARS + 50),
    }],
  });

  assertEquals(drafts.length, 1);
  assertEquals(drafts[0]!.excerpt, "Short excerpt.");
});

Deno.test("normalizeDeepResearchResult reads nested citations", () => {
  const drafts = normalizeDeepResearchResult({
    output: {
      type: "text",
      content: "summary",
      basis: [{
        field: "output",
        reasoning: "because",
        citations: [{
          url: "https://docs.example.com/jit",
          title: "Docs",
          excerpts: ["jit GUC"],
        }],
      }],
    },
  });

  assertEquals(drafts.length, 1);
  assertEquals(drafts[0]!.title, "Docs");
  assertEquals(drafts[0]!.url, "https://docs.example.com/jit");
});

Deno.test("normalizeTranscriptResult uses the input url and timestamp locator", () => {
  const drafts = normalizeTranscriptResult(
    "[00:01:00 - 00:01:12] The mitochondria produce ATP.",
    "https://www.youtube.com/watch?v=abc",
  );

  assertEquals(drafts.length, 1);
  assertEquals(drafts[0]!.kind, "video");
  assertEquals(drafts[0]!.url, "https://www.youtube.com/watch?v=abc");
  assertEquals(drafts[0]!.locator?.label, "00:01:00-00:01:12");
});

Deno.test("normalizeLibraryMatch uses matched_content not the snippet", () => {
  const draft = normalizeLibraryMatch({
    id: 1,
    name: "Notes",
    src_url: "https://static.example.com/notes.md",
    type: "document",
    similarity: 0.9,
    matched_content: "Exact chunk text about ATP.",
    matched_chunk_index: 3,
  });

  assertEquals(draft?.kind, "user-document");
  assertEquals(draft?.excerpt, "Exact chunk text about ATP.");
  assertEquals(draft?.locator?.label, "chunk 3");
});

Deno.test("normalizeToolResults dedupes by url and assigns later via groundedContextFromDrafts", () => {
  const drafts = normalizeToolResults([
    {
      toolName: "webSearch",
      input: {},
      output: {
        results: [{
          url: "https://example.com/a",
          title: "First",
          excerpts: ["Search excerpt."],
        }],
      },
    },
    {
      toolName: "webExtract",
      input: {},
      output: {
        results: [{
          url: "https://example.com/a",
          title: "First",
          excerpts: ["Search excerpt."],
        }],
      },
    },
  ]);

  assertEquals(drafts.length, 1);
  const context = groundedContextFromDrafts("Summary", drafts, "call_123");
  assertEquals(groundedContextSchema.parse(context).sources[0]!.id, "src_call_123_1");
});

Deno.test("extract helpers resolve known refs and leave fabricated refs unresolved", () => {
  const sources = collectCitationSourcesFromToolResults([
    {
      toolName: "gatherContext",
      output: {
        content: "JIT is a GUC.",
        sources: [{
          id: "src_callabc_1",
          kind: "web",
          title: "Postgres",
          url: "https://www.postgresql.org/docs/17/release-17.html",
          excerpt: "JIT is controlled by the jit GUC.",
        }],
      },
    },
  ]);

  const text =
    `JIT is a GUC.<citation ref="src_callabc_1" /> Invented.<citation ref="src_fake_1" />`;
  assertEquals(listCitationRefs(text), ["src_callabc_1", "src_fake_1"]);

  const { resolved, unresolved } = partitionCitationRefs(text, sources);
  assertEquals(resolved.map((source) => source.id), ["src_callabc_1"]);
  assertEquals(unresolved, ["src_fake_1"]);
});

Deno.test("collectCitationSourcesFromMessages reads prior tool parts", () => {
  const sources = collectCitationSourcesFromMessages([
    {
      parts: [
        {
          type: "tool-gatherContext",
          state: "output-available",
          output: {
            content: "fact",
            sources: [{
              id: "src_prior_1",
              kind: "web",
              title: "Prior",
              url: "https://example.com/prior",
              excerpt: "Earlier excerpt.",
            }],
          },
        },
        { type: "text", text: "Later turn." },
      ],
    },
  ]);

  assertEquals(sources.map((source) => source.id), ["src_prior_1"]);
});

Deno.test("rewriteDocumentCitations numbers cited sources and ignores invented ids", () => {
  const markdown = rewriteDocumentCitations(
    [
      "# Topic",
      "",
      `JIT is a GUC.<citation ref="src_callabc_1" />`,
      `A second mention.<citation ref="src_callabc_1" />`,
      `Invented.<citation ref="src_fake_1" />`,
      "",
      "## Sources",
      "1. [model authored](https://invented.example)",
    ].join("\n"),
    [{
      id: "src_callabc_1",
      kind: "web",
      title: "PostgreSQL 17 release notes",
      url: "https://www.postgresql.org/docs/17/release-17.html",
      excerpt: "JIT is controlled by the jit GUC.",
    }],
  );

  assertMatch(markdown, /JIT is a GUC\.\[1\]/);
  assertMatch(markdown, /A second mention\.\[1\]/);
  assertEquals(markdown.includes("src_fake_1"), false);
  assertEquals(markdown.includes("invented.example"), false);
  assertMatch(
    markdown,
    /## Sources\n1\. \[PostgreSQL 17 release notes\]\(https:\/\/www\.postgresql\.org\/docs\/17\/release-17\.html\)/,
  );
});

Deno.test("formatGroundedContextForModel shows exact source ids", () => {
  const formatted = formatGroundedContextForModel({
    content: "JIT is a GUC.",
    sources: [{
      id: "src_callabc_1",
      kind: "web",
      title: "Postgres",
      url: "https://example.com",
      excerpt: "jit GUC",
    }],
  });

  assertMatch(formatted, /src_callabc_1/);
  assertMatch(formatted, /<citation ref="SOURCE_ID" \/>/);
});

Deno.test("system prompt requires exact tool-provided source ids", () => {
  const prompt = createSixtusSystemPrompt("Teach clearly.", "Adult learner.");
  assertMatch(prompt, /<citation ref="SOURCE_ID" \/>/);
  assertMatch(prompt, /source\.id/);
  assertMatch(prompt, /Do not write a Sources or References section/);
  assertMatch(prompt, /searchLibraryContext/);
});

Deno.test("citation eval scores known and fabricated refs", () => {
  const report = runCitationEval(citationEvalCases);
  assertEquals(report.caseCount, 3);
  assertEquals(report.cases.every((item) => item.score === 1), true);
});

Deno.test("createSixtusTools exposes source-producing tools", () => {
  const tools = createSixtusTools({ userId: "test-user" });
  assertEquals("gatherContext" in tools, true);
  assertEquals("searchLibraryContext" in tools, true);
});

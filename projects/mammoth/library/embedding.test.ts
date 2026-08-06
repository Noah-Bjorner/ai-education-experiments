import { assert, assertEquals, assertFalse, assertMatch } from "@std/assert";
import {
  buildEmbeddingInput,
  chunkMarkdown,
  type MarkdownChunk,
} from "./embedding.ts";

Deno.test("chunkMarkdown assigns nested heading breadcrumbs", () => {
  const chunks = chunkMarkdown(
    `# Handbook
Intro paragraph.

## Benefits
Benefits overview.

### Parental Leave
Leave details.
`,
    { minChars: 0 },
  );

  assertEquals(chunks.length, 3);
  assertEquals(chunks[0], {
    content: "Intro paragraph.",
    headingPath: "Handbook",
  });
  assertEquals(chunks[1], {
    content: "Benefits overview.",
    headingPath: "Handbook > Benefits",
  });
  assertEquals(chunks[2], {
    content: "Leave details.",
    headingPath: "Handbook > Benefits > Parental Leave",
  });
});

Deno.test("chunkMarkdown packs blocks under the same heading until the budget", () => {
  const chunks = chunkMarkdown(
    `# Topic
First paragraph.

Second paragraph.
`,
    { maxChars: 2000, minChars: 0 },
  );

  assertEquals(chunks.length, 1);
  assertEquals(chunks[0]!.headingPath, "Topic");
  assertEquals(
    chunks[0]!.content,
    "First paragraph.\n\nSecond paragraph.",
  );
});

Deno.test("chunkMarkdown flushes when heading path changes", () => {
  const chunks = chunkMarkdown(
    `# One
Alpha.

# Two
Beta.
`,
    { minChars: 0 },
  );

  assertEquals(chunks.length, 2);
  assertEquals(chunks[0]!.headingPath, "One");
  assertEquals(chunks[1]!.headingPath, "Two");
});

Deno.test("chunkMarkdown preserves fenced code blocks", () => {
  const chunks = chunkMarkdown(
    `# Examples
Before.

\`\`\`ts
const value = 1;
\`\`\`

After.
`,
    { minChars: 0 },
  );

  assertEquals(chunks.length, 1);
  assertMatch(chunks[0]!.content, /```ts\nconst value = 1;\n```/);
  assertEquals(chunks[0]!.headingPath, "Examples");
});

Deno.test("chunkMarkdown preserves lists and tables as units", () => {
  const chunks = chunkMarkdown(
    `# Spec
- one
- two

| A | B |
| - | - |
| 1 | 2 |
`,
    { minChars: 0 },
  );

  assertEquals(chunks.length, 1);
  assertMatch(chunks[0]!.content, /- one\n- two/);
  assertMatch(chunks[0]!.content, /\| A \| B \|/);
});

Deno.test("chunkMarkdown splits oversized prose at sentence boundaries", () => {
  const sentenceA = "Alpha sentence stays intact.";
  const sentenceB = "Beta sentence starts the next chunk.";
  const chunks = chunkMarkdown(
    `# Long
${sentenceA} ${sentenceB}
`,
    // Fits either sentence alone, but not both joined.
    {
      maxChars: Math.max(sentenceA.length, sentenceB.length) + 1,
      minChars: 0,
    },
  );

  assertEquals(chunks.length, 2);
  assertEquals(chunks[0]!.content, sentenceA);
  assertEquals(chunks[1]!.content, sentenceB);
});

Deno.test("chunkMarkdown handles documents without headings", () => {
  const chunks = chunkMarkdown("Just a lone paragraph without headings.", {
    minChars: 0,
  });
  assertEquals(chunks, [{
    content: "Just a lone paragraph without headings.",
    headingPath: "",
  }]);
});

Deno.test("chunkMarkdown never begins with mid-word character overlap", () => {
  const chunks = chunkMarkdown(
    `# A
First unique paragraph about apples and oranges.

# B
Second unique paragraph about bananas and grapes.
`,
    { maxChars: 80, minChars: 0 },
  );

  for (const chunk of chunks) {
    assertFalse(/^[a-z]/.test(chunk.content));
    assert(chunk.content.length > 0);
  }
});

Deno.test("chunkMarkdown merges undersized leftovers into neighbors", () => {
  const leftover =
    "och har sedan dess tryckts i över 44.000 exemplar. Detta är en ny och omarbetad utgåva.";
  const prior =
    "Boken gavs ut första gången för många år sedan och har blivit mycket läst.";
  const chunks = chunkMarkdown(
    `# Förord
${prior}

# Nästa
${leftover}
`,
    { minChars: 200, maxChars: 2000 },
  );

  assertEquals(chunks.length, 1);
  assertMatch(chunks[0]!.content, new RegExp(prior));
  assertMatch(chunks[0]!.content, new RegExp(leftover));
  assertEquals(chunks[0]!.headingPath, "Förord");
});

Deno.test("buildEmbeddingInput prefixes heading path only when present", () => {
  const withPath: MarkdownChunk = {
    content: "Leave details.",
    headingPath: "Handbook > Benefits > Parental Leave",
  };
  const withoutPath: MarkdownChunk = {
    content: "Leave details.",
    headingPath: "",
  };

  assertEquals(
    buildEmbeddingInput(withPath),
    "Section: Handbook > Benefits > Parental Leave\n\nLeave details.",
  );
  assertEquals(buildEmbeddingInput(withoutPath), "Leave details.");
});

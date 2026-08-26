import { assertEquals } from "@std/assert";

import { transformMessages } from "./message-transforms.ts";
import type { SixtusUIMessage } from "./types.ts";

Deno.test("transformMessages rewrites only the latest user message and keeps assistant tool sources", () => {
  const gatherPart = {
    type: "tool-gatherContext" as const,
    toolCallId: "call_abc",
    state: "output-available" as const,
    input: { instruction: "Postgres 17 JIT" },
    output: {
      content: "JIT is a GUC.",
      sources: [{
        id: "src_call_abc_1",
        kind: "web" as const,
        title: "Postgres",
        url: "https://www.postgresql.org/docs/17/release-17.html",
        excerpt: "JIT is controlled by the jit GUC.",
      }],
    },
  };

  const messages = [
    {
      id: "a1",
      role: "assistant",
      parts: [gatherPart],
    },
    {
      id: "u2",
      role: "user",
      parts: [
        {
          type: "data-questionAnswer",
          data: { questionText: "What is JIT?", answer: "A compiler" },
        },
      ],
    },
  ] as SixtusUIMessage[];

  const transformed = transformMessages(messages);
  assertEquals(transformed[0], messages[0]);
  assertEquals(transformed[1]?.role, "user");
  assertEquals(transformed[1]?.parts[0]?.type, "text");
});

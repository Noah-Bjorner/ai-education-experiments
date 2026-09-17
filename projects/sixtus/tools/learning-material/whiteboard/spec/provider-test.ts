import { assert, assertEquals } from "@std/assert";
import { NoObjectGeneratedError } from "@ai";
import { invalidSpecOutputFromProvider } from "./provider.ts";
import { InvalidSpecOutput } from "./index.ts";

Deno.test("provider adapter only repairs structured content failures", () => {
  const make = (
    text: string,
    finishReason: "stop" | "length" | "content-filter" | "error",
  ) =>
    new NoObjectGeneratedError({
      text,
      finishReason,
      response: { id: "test", timestamp: new Date(0), modelId: "test" },
      usage: {
        inputTokens: undefined,
        outputTokens: undefined,
        totalTokens: undefined,
        inputTokenDetails: {
          noCacheTokens: undefined,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
        },
        outputTokenDetails: {
          textTokens: undefined,
          reasoningTokens: undefined,
        },
      },
    });
  for (const finishReason of ["stop", "length"] as const) {
    const error = make('{"title":', finishReason);
    const normalized = invalidSpecOutputFromProvider(error);
    assert(normalized instanceof InvalidSpecOutput);
    assertEquals(normalized.output, error.text);
    assert(normalized.cause === error);
  }
  for (
    const error of [
      make("I cannot help with this request.", "stop"),
      make("", "stop"),
      make('{"title":null}', "content-filter"),
      make('{"title":null}', "error"),
      new Error("Authentication failed"),
    ]
  ) assertEquals(invalidSpecOutputFromProvider(error), undefined);
});

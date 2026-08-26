import { assertEquals, assertMatch } from "@std/assert";

import { formatSixtusRuntime, formatUtcDate } from "./runtime.ts";

const FROZEN_NOW = new Date("2026-08-26T23:30:00.000Z");

Deno.test("formatUtcDate uses the UTC calendar date", () => {
  assertEquals(formatUtcDate(FROZEN_NOW), "Wednesday, 26 August 2026 (UTC)");
});

Deno.test("formatSixtusRuntime injects only the date", () => {
  const block = formatSixtusRuntime({ now: FROZEN_NOW });
  assertMatch(block, /^## Runtime/);
  assertMatch(block, /Date: Wednesday, 26 August 2026 \(UTC\)/);
  assertEquals(block.includes("Locale:"), false);
});

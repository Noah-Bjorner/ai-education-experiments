import { assert, assertEquals, assertMatch } from "jsr:@std/assert";
import {
  extractTsxSource,
  fixKnownEasingMistakes,
  validateGeneratedTsx,
} from "../../../../helper/remotion/prepare-tsx-shared.ts";
import { validateGeneratedTsxForRender } from "./validate-tsx.ts";

const VALID_TSX = `
import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";

export const WIDTH = 1200;
export const HEIGHT = 800;
export const FPS = 30;
export const DURATION_IN_FRAMES = 120;

export default function RemotionVideo() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return <AbsoluteFill style={{ opacity }} />;
}
`;

Deno.test("extractTsxSource removes fenced code and ignores trailing explanation", () => {
  const raw = `\`\`\`tsx
import React from "react";
export const WIDTH = 1200;
export const HEIGHT = 800;
export const FPS = 30;
export const DURATION_IN_FRAMES = 120;
export default function RemotionVideo() {
  return null;
}
\`\`\`

**Explanation:** This should not remain in the extracted TSX.`;

  const { tsx, issues } = extractTsxSource(raw);

  assertEquals(tsx.includes("export default function RemotionVideo"), true);
  assertEquals(tsx.includes("```"), false);
  assertEquals(tsx.includes("Explanation"), false);
  assertEquals(issues.length, 1);
});

Deno.test("validateGeneratedTsx rejects truncated source missing default export", () => {
  const truncated = `
import React from "react";
export const WIDTH = 1200;
export const HEIGHT = 800;
export const FPS = 30;
export const DURATION_IN_FRAMES = 210;

const PATH =
  "M226.47 358.48L221.09 365.75L220.91 370.62L218.75 371.66L257.
`;

  const result = validateGeneratedTsx(truncated);

  assertEquals(result.ok, false);
  if (!result.ok) {
    assert(
      result.errors.some((error) => error.includes("default-export")),
    );
    assert(
      result.errors.some((error) => error.includes("truncated")),
    );
  }
});

Deno.test("fixKnownEasingMistakes rewrites invalid string easing usage", () => {
  const fixed = fixKnownEasingMistakes(`
const progress = interpolate(frame, [0, 1], [0, 1], {
  easing: Easing.out("cubic"),
});
`);

  assertMatch(fixed, /Easing\.out\(Easing\.cubic\)/);
});

Deno.test({
  name: "validateGeneratedTsxForRender accepts syntactically valid TSX",
  sanitizeResources: false,
  fn() {
    const result = validateGeneratedTsxForRender(VALID_TSX);

    assertEquals(result.ok, true);
    if (result.ok) {
      assertMatch(result.tsx, /export default function RemotionVideo/);
    }
  },
});

Deno.test("validateGeneratedTsxForRender rejects leftover markdown fences", () => {
  const raw = `\`\`\`tsx
import React from "react";
export const WIDTH = 1200;
export const HEIGHT = 800;
export const FPS = 30;
export const DURATION_IN_FRAMES = 120;
export default function RemotionVideo() {
  return null;
}
\`\`\`
\`\`\`
`;

  const result = validateGeneratedTsxForRender(raw);

  assertEquals(result.ok, false);
});

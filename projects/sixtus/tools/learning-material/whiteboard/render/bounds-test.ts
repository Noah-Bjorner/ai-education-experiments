import { assertEquals } from "@std/assert";
import { balanceAround } from "./bounds.ts";

Deno.test("balanceAround matches the larger overflow on the opposite side", () => {
  const subject = { x: 100, y: 50, width: 200, height: 80 };
  assertEquals(
    balanceAround(subject, { x: 40, y: 50, width: 260, height: 80 }),
    { x: 40, y: 50, width: 320, height: 80 },
  );
  assertEquals(
    balanceAround(subject, { x: 100, y: 20, width: 200, height: 140 }),
    { x: 100, y: 20, width: 200, height: 140 },
  );
  assertEquals(balanceAround(subject, subject), subject);
  assertEquals(
    balanceAround(subject, { x: 40, y: 20, width: 280, height: 140 }),
    { x: 40, y: 20, width: 320, height: 140 },
  );
});

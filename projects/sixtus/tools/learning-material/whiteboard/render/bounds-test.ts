import { assertEquals } from "@std/assert";
import { balanceAround } from "./bounds.ts";

Deno.test("balanceAround matches the larger left/right overflow, not top/bottom", () => {
  const subject = { x: 100, y: 50, width: 200, height: 80 };
  assertEquals(
    balanceAround(subject, { x: 40, y: 50, width: 260, height: 80 }),
    { x: 40, y: 50, width: 320, height: 80 },
  );
  assertEquals(
    balanceAround(subject, { x: 100, y: 20, width: 200, height: 110 }),
    { x: 100, y: 20, width: 200, height: 110 },
  );
  assertEquals(balanceAround(subject, subject), subject);
  assertEquals(
    balanceAround(subject, { x: 40, y: 20, width: 280, height: 110 }),
    { x: 40, y: 20, width: 320, height: 110 },
  );
});

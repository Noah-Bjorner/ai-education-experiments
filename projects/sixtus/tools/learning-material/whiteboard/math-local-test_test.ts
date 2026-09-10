import { assert, assertEquals } from "@std/assert";
import { handleMathPlayground } from "./math-local-test.ts";

Deno.test("local playground uses the real child renderer and recovers after invalid input", async () => {
  const render = (latex: string) =>
    handleMathPlayground(
      new Request("http://127.0.0.1:8787/render", {
        method: "POST",
        body: JSON.stringify({ latex, title: "Local test" }),
      }),
    );
  const invalid = await render(String.raw`\missingcommand`);
  assertEquals(invalid.status, 400);
  assert((await invalid.json()).error.includes("Undefined control sequence"));
  const response = await render(
    String.raw`\begin{pmatrix}\alpha&1\\2&\beta\end{pmatrix}`,
  );
  assertEquals(response.status, 200);
  const result = await response.json();
  assertEquals(result.spec.children[0].type, "math_expressions");
  assert(result.svg.includes("Shantell Sans Math"));
  assert(result.width > 0 && result.height > 0);
  const tooLong = await render("x".repeat(2001));
  assertEquals(tooLong.status, 400);
  await tooLong.body?.cancel();
});

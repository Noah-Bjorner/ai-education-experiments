import { assert, assertEquals } from "@std/assert";
// deno-lint-ignore no-import-prefix
import { createSVGWindow } from "npm:svgdom@0.1.23";
import { renderHandwritten } from "../render/handwritten.ts";
import { applyDrawingAnimation } from "./index.ts";

Deno.test("marker animation follows the authored centerline once, including transforms", () => {
  const line = renderHandwritten({
    type: "line",
    x1: 10,
    y1: 20,
    x2: 110,
    y2: 20,
  }, { id: "line" });
  const circle = renderHandwritten({ type: "circle", cx: 60, cy: 70, r: 25 }, {
    id: "circle",
  });
  const input =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><g transform="translate(12 15) scale(2)">${line.markup}${circle.markup}</g></svg>`;
  const output = applyDrawingAnimation(input, { duration: 3 });
  assertEquals(output, applyDrawingAnimation(input, { duration: 3 }));
  const document = createSVGWindow().document as Document;
  document.documentElement.innerHTML = output;
  assertEquals(
    document.querySelectorAll('[data-drawing-method="path"]').length,
    2,
  );
  assertEquals(document.querySelectorAll("[data-drawing-stroke]").length, 2);
  assertEquals(document.querySelectorAll("mask path").length, 2);
  assertEquals(
    document.querySelectorAll('[data-drawing-method="skeleton"]').length,
    0,
  );
  const brush = document.querySelector("mask path")!;
  assert(brush.getAttribute("d")!.startsWith("M32.0000 55.0000"));
  assert(Number(brush.getAttribute("stroke-width")) > 4);
  assertEquals(document.querySelectorAll("[data-marker-centerline]").length, 2);
  assertEquals(applyDrawingAnimation(input, { enabled: false }), input);
});

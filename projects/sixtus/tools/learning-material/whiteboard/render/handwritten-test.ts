import { assert, assertEquals, assertThrows } from "@std/assert";
// deno-lint-ignore no-import-prefix
import { createSVGWindow } from "npm:svgdom@0.1.23";
import { renderHandwritten, renderHandwrittenDot } from "./handwritten.ts";
import type { Shape } from "./shapes.ts";
import { HAND_DRAWING } from "./theme.ts";
import { whiteboardFigures } from "../figures/index.ts";
import { renderWhiteboardSvg } from "./index.ts";
import { WhiteboardOutput } from "../schema.ts";

const shapes: Shape[] = [
  { type: "line", x1: 0, y1: 10, x2: 160, y2: 10 },
  { type: "rectangle", x: 0, y: 0, width: 100, height: 50 },
  { type: "circle", cx: 50, cy: 50, r: 30 },
  { type: "ellipse", cx: 80, cy: 40, rx: 60, ry: 25 },
];

Deno.test("every figure family, heading, and annotation uses the shared single-pass pen", () => {
  for (const definition of whiteboardFigures) {
    const spec = WhiteboardOutput.parse({
      title: "One pen",
      figures: [{
        ...definition.example.output,
        title: "A figure",
        anchor: null,
        side: null,
        annotations: [{ type: "highlight", targetIds: ["title"], text: null }],
      }],
    });
    const natural = renderWhiteboardSvg(spec);
    const clean = renderWhiteboardSvg(spec, { roughness: 0 });
    for (const stage of Object.values(natural.stages)) {
      assert(!stage.svg.includes('opacity="0.45"'));
      assert(stage.svg.includes("data-marker-centerline"));
    }
    assert(!clean.svg.includes("data-marker-centerline"));
    assert(natural.svg.includes('data-annotation-type="highlight"'));
  }
});

Deno.test("marker shapes have one repeatable ink silhouette and retain their gesture", () => {
  for (const shape of shapes) {
    const options = { id: "marker", seed: 17 };
    const drawing = renderHandwritten(shape, options);
    assertEquals(drawing, renderHandwritten(shape, options));
    assertEquals(
      drawing,
      renderHandwritten(shape, { ...options, singlePass: false }),
    );
    assertEquals(
      drawing,
      renderHandwritten(shape, {
        ...options,
        roughness: HAND_DRAWING.roughness,
      }),
    );
    assert(
      drawing.markup !==
        renderHandwritten(shape, { ...options, seed: 18 }).markup,
    );
    const document = createSVGWindow().document as Document;
    document.documentElement.innerHTML = drawing.markup;
    const paths = document.querySelectorAll("path");
    assertEquals(paths.length, 1);
    assert(paths[0].hasAttribute("data-marker-centerline"));
    assertEquals(paths[0].getAttribute("stroke"), "none");
    assert(!drawing.markup.includes('opacity="0.45"'));
    // The filled ribbon's inner and outer contours do not become pen gestures.
    assertEquals(
      (paths[0].getAttribute("data-marker-centerline")!.match(/M /g) ?? [])
        .length,
      1,
    );
  }
});

Deno.test("roughness controls both hand drift and ink width without moving line endpoints", () => {
  const line = shapes[0];
  for (const roughness of [0, 0.7, 1.5, 3, 8]) {
    const drawing = renderHandwritten(line, {
      id: "line",
      roughness,
      strokeWidth: 6,
    });
    const document = createSVGWindow().document as Document;
    document.documentElement.innerHTML = drawing.markup;
    const path = document.querySelector("path")!;
    if (!roughness) {
      assert(!path.hasAttribute("data-marker-centerline"));
      assert(
        path.getAttribute("d")!.includes(
          "C 53.33 10.00 106.67 10.00 160.00 10.00",
        ),
      );
    } else {
      const gesture = path.getAttribute("data-marker-centerline")!;
      assert(gesture.startsWith("M 0.00 10.00 C "));
      assert(gesture.endsWith("160.00 10.00"));
      // Opposite samples in the ribbon expose a smoothly varying ink width.
      const points = [
        ...path.getAttribute("d")!.matchAll(/(?:M|L) (-?[\d.]+) (-?[\d.]+)/g),
      ]
        .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
      const bodyCount = (points.length - 20) / 2;
      const widths = points.slice(1, bodyCount - 1).map((p, index) => {
        const other = points[bodyCount + 10 + bodyCount - 2 - index];
        return Math.hypot(p.x - other.x, p.y - other.y);
      });
      assert(Math.max(...widths) - Math.min(...widths) > 0.1);
    }
  }
  for (const roughness of [-1, NaN, Infinity]) {
    assertThrows(() => renderHandwritten(line, { id: "bad", roughness }));
  }
});

Deno.test("painted bounds contain marker ink across scales, seeds, and roughness", () => {
  for (
    const shape of [
      ...shapes,
      { type: "circle", cx: 0, cy: 0, r: 0.1 } as const,
    ]
  ) {
    for (const roughness of [0.1, 1.5, 5, 100]) {
      for (const seed of [1, 71, 999]) {
        const drawing = renderHandwritten(shape, {
          id: "bounds",
          roughness,
          seed,
        });
        const b = drawing.bounds!;
        assert(Object.values(b).every(Number.isFinite));
        const d = drawing.markup.match(/<path d="([^"]+)"/)![1];
        for (const match of d.matchAll(/(?:M|L) (-?[\d.]+) (-?[\d.]+)/g)) {
          const x = Number(match[1]), y = Number(match[2]);
          assert(x >= b.x - 1e-9 && x <= b.x + b.width + 1e-9);
          assert(y >= b.y - 1e-9 && y <= b.y + b.height + 1e-9);
        }
      }
    }
  }
});

Deno.test("filled dots vary by seed, replay deterministically, and retain exact target centers", () => {
  const dot = renderHandwrittenDot(20, 30, 4, { id: "dot", seed: 1 });
  assertEquals(dot, renderHandwrittenDot(20, 30, 4, { id: "dot", seed: 1 }));
  assert(
    dot.markup !==
      renderHandwrittenDot(20, 30, 4, { id: "dot", seed: 2 }).markup,
  );
  assert(!dot.markup.includes("<circle"));
  assertEquals(dot.bounds!.x + dot.bounds!.width / 2, 20);
  assertEquals(dot.bounds!.y + dot.bounds!.height / 2, 30);
});

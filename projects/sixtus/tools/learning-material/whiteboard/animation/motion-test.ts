import { strict as assert } from "node:assert";
// deno-lint-ignore no-import-prefix
import { createSVGWindow } from "npm:svgdom@0.1.23";
import { applyDrawingAnimation } from "./index.ts";
import { pathLength } from "./geometry.ts";
import { motionSlice, strokeMotion, timeAt } from "./motion.ts";

function profile(points: [number, number][]) {
  const ink = points.map(([x, y]) => ({ x, y, width: 2 }));
  return strokeMotion({ points: ink, length: pathLength(ink) });
}

function animate(body: string, options = {}) {
  const document = createSVGWindow().document as Document;
  document.documentElement.innerHTML = applyDrawingAnimation(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">${body}</svg>`,
    options,
  );
  return document.documentElement.firstElementChild!;
}

Deno.test("pen motion eases contact/lift, slows corners, and ignores collinear subdivision", () => {
  const straight = profile([[0, 0], [100, 0]]);
  const corner = profile([[0, 0], [50, 0], [50, 50]]);
  const middle = timeAt(straight, 0.55) - timeAt(straight, 0.45);
  assert(timeAt(straight, 0.1) > middle);
  assert(1 - timeAt(straight, 0.9) > middle);
  assert(timeAt(corner, 0.55) - timeAt(corner, 0.45) > middle * 1.5);
  assert.deepEqual(profile([[0, 0], [10, 0], [50, 0], [100, 0]]), straight);
  assert.deepEqual(profile([[40, 90], [40, 190]]), straight);
  for (
    const p of [straight, corner, profile([[0, 0], [0, 0], [50, 0], [50, 0]])]
  ) {
    assert.equal(p.times[0], 0);
    assert.equal(p.times.at(-1), 1);
    assert(
      p.times.every((t, i) => Number.isFinite(t) && (!i || t > p.times[i - 1])),
    );
  }
});

Deno.test("variable-width brushes share one continuous movement instead of easing each segment", () => {
  const p = profile([[0, 0], [50, 0], [50, 50]]);
  const parts = [[0, 0.173], [0.173, 0.65], [0.65, 1]].map(([a, b]) =>
    motionSlice(p, a, b)
  );
  parts.forEach((part, i) => {
    assert.equal(part.values[0], 1);
    assert.equal(part.values.at(-1), 0);
    assert.equal(part.times[0], 0);
    assert.equal(part.times.at(-1), 1);
    assert(part.times.every((t, j) => !j || t > part.times[j - 1]));
    if (i) {
      assert(
        Math.abs(parts[i - 1].start + parts[i - 1].duration - part.start) <
          1e-12,
      );
    }
  });
  assert.equal(parts.at(-1)!.start + parts.at(-1)!.duration, 1);
});

Deno.test("longer pen travel gets a bounded pause inside and between graphical elements", () => {
  const gap = (offset: number, compound: boolean) => {
    const a = "M0 0h10", b = `M${10 + offset} 0h10`;
    const root = animate(
      `<g fill="none" stroke="black">${
        compound ? `<path d="${a} ${b}"/>` : `<path d="${a}"/><path d="${b}"/>`
      }</g>`,
    );
    const strokes = [...root.querySelectorAll("[data-drawing-stroke]")];
    return Number(strokes[1].getAttribute("data-stroke-start")) -
      Number(strokes[0].getAttribute("data-stroke-start")) -
      Number(strokes[0].getAttribute("data-stroke-duration"));
  };
  for (const compound of [true, false]) {
    assert(gap(160, compound) > gap(1, compound));
    assert(gap(10000, compound) <= (compound ? 0.04 : 0.025) * 4 + 1e-9);
  }
});

Deno.test("writing retains the exact linear timeline while graphics use natural motion", async () => {
  const equation = await Deno.readTextFile(
    new URL("./fixtures/equation.svg", import.meta.url),
  );
  assert.equal(
    applyDrawingAnimation(equation),
    applyDrawingAnimation(equation, { markMotion: "linear" }),
  );
  const root = animate(
    `<g data-figure-id="eq" data-figure-type="math_expressions">
    <g data-layer="base"><path id="fraction" d="M0 0h60" stroke="black"/></g>
    <g data-annotation-type="highlight"><circle id="circle" cx="30" cy="20" r="20" fill="none" stroke="red"/></g>
    <g data-annotation-type="number"><g data-drawing-text=""><path id="glyph" d="M80 0h5v20h-5z"/></g></g>
  </g>`,
  );
  for (const id of ["fraction", "glyph"]) {
    assert.equal(
      root.querySelector(`#${id}`)!.closest("[data-drawing-index]")!
        .getAttribute(
          "data-drawing-motion",
        ),
      "linear",
    );
  }
  assert.equal(
    root.querySelector("#circle")!.closest("[data-drawing-index]")!
      .getAttribute(
        "data-drawing-motion",
      ),
    "natural",
  );
});

Deno.test("natural masks are deterministic, fit the requested duration, and preserve dashed artwork", () => {
  const body =
    '<g transform="translate(20 30) rotate(12)" fill="none" stroke="black" stroke-dasharray="5 4"><path id="dash" d="M0 0h100 M100 20h-100"/><circle cx="150" cy="50" r="30"/></g>';
  const root = animate(body, { startTime: 2, duration: 3 });
  assert.equal(
    root.outerHTML,
    animate(body, { startTime: 2, duration: 3 }).outerHTML,
  );
  assert.equal(
    root.querySelector("[stroke-dasharray='5 4']")?.getAttribute("transform"),
    "translate(20 30) rotate(12)",
  );
  const strokes = [...root.querySelectorAll("[data-drawing-stroke]")];
  let end = 2;
  for (const stroke of strokes) {
    const start = Number(stroke.getAttribute("data-stroke-start"));
    assert(start >= end - 1e-9);
    end = start + Number(stroke.getAttribute("data-stroke-duration"));
    const motion = stroke.querySelector(
      'animate[attributeName="stroke-dashoffset"]',
    )!;
    const times = motion.getAttribute("keyTimes")!.split(";").map(Number);
    assert.equal(times[0], 0);
    assert.equal(times.at(-1), 1);
    assert(times.every((t, i) => !i || t > times[i - 1]));
  }
  assert(Math.abs(end - 5) < 1e-9);
  assert.throws(() => animate(body, { duration: 0.01 }));
  assert.throws(() => animate(body, { markMotion: "unknown" }));
});

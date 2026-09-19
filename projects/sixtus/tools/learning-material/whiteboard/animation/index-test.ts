import { strict as assert } from "node:assert";
// deno-lint-ignore no-import-prefix
import { createSVGWindow } from "npm:svgdom@0.1.23";
import { applyDrawingAnimation } from "./index.ts";
import { flatten } from "./geometry.ts";
import { planDrawingBeats } from "./policy.ts";

function parse(svg: string): SVGSVGElement {
  const document = createSVGWindow().document as Document;
  document.documentElement.innerHTML = svg;
  return document.documentElement.firstElementChild as SVGSVGElement;
}

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${body}</svg>`;

Deno.test("orders transformed paths by rows without changing original glyphs or groups", () => {
  const input = svg(`<g id="equation" transform="translate(10 10)">
    <path id="bottom" transform="translate(0 80)" d="M0 0h10v10h-10z"/>
    <path id="right" transform="translate(50 0) scale(1 -1)" d="M0 -10h10v10h-10z"/>
    <path id="left" d="M0 0h10v10h-10z"/>
  </g>`);
  const output = parse(
    applyDrawingAnimation(input, {
      mode: "wipe",
      startTime: 2,
      duration: 2,
      gap: 0.1,
    }),
  );
  const ordered = Array.from(output.querySelectorAll("[data-drawing-index]"))
    .sort((a, b) =>
      Number(a.getAttribute("data-drawing-index")) -
      Number(b.getAttribute("data-drawing-index"))
    );
  assert.deepEqual(ordered.map((node) => node.querySelector("path")!.id), [
    "left",
    "right",
    "bottom",
  ]);
  assert.equal(
    output.querySelector("#equation")!.getAttribute("transform"),
    "translate(10 10)",
  );
  assert.equal(
    output.querySelector("#right")!.getAttribute("transform"),
    "translate(50 0) scale(1 -1)",
  );
  const animations = Array.from(output.querySelectorAll("animate"));
  assert.equal(animations.length, 3);
  const starts = animations.map((a) => parseFloat(a.getAttribute("begin")!));
  const durations = animations.map((a) => parseFloat(a.getAttribute("dur")!));
  assert.equal(starts[0], 2);
  for (let i = 1; i < 3; i++) {
    assert(starts[i] >= starts[i - 1] + durations[i - 1]);
  }
  assert(Math.abs(starts[2] + durations[2] - 4) < 1e-10);
});

Deno.test("centerline masks write all equation glyphs, with separate bars and sequential pen strokes", async () => {
  const input = await Deno.readTextFile(
    new URL("./fixtures/equation.svg", import.meta.url),
  );
  const output = parse(
    applyDrawingAnimation(input, { duration: 5, startTime: 1 }),
  );
  const groups = Array.from(output.querySelectorAll("[data-drawing-index]"));
  assert.equal(groups.length, 9);
  assert(
    groups.every((g) => g.getAttribute("data-drawing-method") === "skeleton"),
  );
  const equals = groups.find((g) => g.querySelector('[data-c="3D"]'))!;
  const maskId = equals.getAttribute("mask")!.slice(5, -1);
  assert.equal(
    output.querySelector(`#${maskId}`)!.querySelectorAll(
      "[data-drawing-stroke]",
    ).length,
    2,
  );
  const strokes = Array.from(output.querySelectorAll("[data-drawing-stroke]"));
  let previousEnd = 1;
  for (const stroke of strokes) {
    const start = Number(stroke.getAttribute("data-stroke-start"));
    const duration = Number(stroke.getAttribute("data-stroke-duration"));
    assert(start + 1e-10 >= previousEnd, "pen strokes must not overlap");
    assert(duration > 0);
    previousEnd = start + duration;
  }
  assert(Math.abs(previousEnd - 6) < 1e-9);
  assert.equal(
    groups.at(-1)!.querySelector('set[attributeName="mask"]')!.getAttribute(
      "begin",
    ),
    "6s",
  );
  assert.equal(
    output.querySelector('[data-c="32"]')!.getAttribute("d"),
    parse(input).querySelector('[data-c="32"]')!.getAttribute("d"),
  );
});

Deno.test("shapes follow native geometry, compound paths lift the pen, and long gestures move faster", () => {
  const input = svg(
    `<g stroke="black" stroke-width="2" fill="none" transform="translate(10 15) rotate(10)">
    <line id="short" x1="0" y1="0" x2="10" y2="0"/>
    <path id="long" d="M20 0h40"/>
    <path id="arrow" d="M80 0h20 M95 -5l5 5l-5 5"/>
    <circle id="circle" cx="40" cy="60" r="15"/>
  </g>`,
  );
  const root = parse(applyDrawingAnimation(input, { duration: 5 }));
  const groups = Array.from(root.querySelectorAll("[data-drawing-index]"));
  assert(groups.every((g) => g.getAttribute("data-drawing-method") === "path"));
  const short = groups.find((g) => g.querySelector("#short"))!;
  const long = groups.find((g) => g.querySelector("#long"))!;
  const ratio = Number(long.getAttribute("data-drawing-duration")) /
    Number(short.getAttribute("data-drawing-duration"));
  assert(ratio > 1 && ratio < 4, "long strokes take longer, but travel faster");
  const linear = parse(
    applyDrawingAnimation(input, { duration: 5, markMotion: "linear" }),
  );
  const duration = (id: string) =>
    Number(
      linear.querySelector(id)!.closest("[data-drawing-index]")!.getAttribute(
        "data-drawing-duration",
      ),
    );
  assert(Math.abs(duration("#long") / duration("#short") - 4) < 1e-9);
  const arrow = groups.find((g) => g.querySelector("#arrow"))!;
  const maskId = arrow.getAttribute("mask")!.slice(5, -1);
  assert.equal(
    root.querySelector(`#${maskId}`)!.querySelectorAll("[data-drawing-stroke]")
      .length,
    2,
  );
});

Deno.test("supports evenodd holes, solid-fill fallback, and explicit static groups", () => {
  const root = parse(
    applyDrawingAnimation(
      svg(
        `<path id="ring" fill-rule="evenodd" d="M0 0h50v50h-50z M5 5h40v40h-40z"/>
    <rect id="solid" x="80" y="0" width="50" height="50"/>
    <g data-drawing="static"><circle id="static" cx="160" cy="25" r="20"/></g>`,
      ),
    ),
  );
  const groups = Array.from(root.querySelectorAll("[data-drawing-index]"));
  assert.equal(groups.length, 2);
  assert.equal(
    groups.find((g) => g.querySelector("#ring"))!.getAttribute(
      "data-drawing-method",
    ),
    "skeleton",
  );
  assert.equal(
    groups.find((g) => g.querySelector("#solid"))!.getAttribute(
      "data-drawing-fallback",
    ),
    "solid-fill",
  );
  assert.equal(
    root.querySelector("#static")!.closest("[data-drawing-index]"),
    null,
  );
  assert.equal(
    parse(applyDrawingAnimation(svg('<line stroke="black" x2="10"/>')))
      .querySelector('[data-drawing-method="path"]') !== null,
    true,
  );
});

Deno.test("flattens arcs, relative commands and S-curves without flattening away curvature", () => {
  const paths = flatten(
    "M0 0c0 100 100 -100 100 0m10 0a10 10 0 1 1 20 0",
    0.05,
  );
  assert.equal(paths.length, 2);
  assert(paths[0].length > 8);
  assert(paths[0].some((p) => p.y > 20));
  assert(paths[0].some((p) => p.y < -20));
  assert(paths[1].length > 8);
  assert.throws(() => flatten("M invalid", 0.1));
  for (const resolution of [0, 63, 513, NaN, 128.5]) {
    assert.throws(() =>
      applyDrawingAnimation(svg('<path d="M0 0h10"/>'), { resolution })
    );
  }
  assert.throws(() =>
    applyDrawingAnimation(svg('<path d="M0 0h10"/>'), { strokeGap: -1 })
  );
});

Deno.test("thin filled bars use centerlines rather than the solid-area fallback", () => {
  const root = parse(
    applyDrawingAnimation(svg('<path d="M0 0h100v8h-100z"/>')),
  );
  assert.equal(
    root.querySelector('[data-drawing-index="0"]')!.getAttribute(
      "data-drawing-method",
    ),
    "skeleton",
  );
});

Deno.test("preserves existing masks, skips definitions/hidden paths, and avoids ID collisions", () => {
  const input = svg(
    `<defs><mask id="original"><path d="M0 0h100v100z" fill="white"/></mask></defs>
    <g id="drawing-mask-0" display="none"><path d="M0 0h10v10z"/></g>
    <path id="visible" mask="url(#original)" d="M0 0h10v10z"/>`,
  );
  const output = parse(applyDrawingAnimation(input, { mode: "wipe" }));
  assert.equal(output.querySelectorAll("animate").length, 1);
  assert.equal(
    output.querySelector("#visible")!.getAttribute("mask"),
    "url(#original)",
  );
  const ids = Array.from(output.querySelectorAll("[id]")).map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
});

Deno.test("validates timing and input; supports a byte-identical static mode", () => {
  const input = svg('<path d="M0 0h10v10z"/><path d="M20 0h10v10z"/>');
  assert.equal(applyDrawingAnimation(input, { enabled: false }), input);
  assert.equal(
    applyDrawingAnimation(svg("<text>hello</text>")),
    svg("<text>hello</text>"),
  );
  for (const duration of [0, -1, NaN, Infinity, 0.01]) {
    assert.throws(() => applyDrawingAnimation(input, { duration }));
  }
  for (const speed of [0, -1, NaN, Infinity]) {
    assert.throws(() => applyDrawingAnimation(input, { speed }));
  }
  assert.throws(() =>
    applyDrawingAnimation(input, { duration: 5, speed: 1.5 })
  );
  assert.throws(() => applyDrawingAnimation("<div/>"));
  assert.throws(() => applyDrawingAnimation(applyDrawingAnimation(input)));
});

Deno.test("speed scales the natural timeline, including pauses", () => {
  const input = svg(
    `<g stroke="black" stroke-width="2" fill="none">
    <line x1="0" y1="0" x2="10" y2="0"/>
    <line x1="0" y1="10" x2="40" y2="10"/>
  </g>`,
  );
  const at1x = parse(applyDrawingAnimation(input));
  const at2x = parse(applyDrawingAnimation(input, { speed: 2 }));
  const duration1x = Number(at1x.getAttribute("data-drawing-duration"));
  const duration2x = Number(at2x.getAttribute("data-drawing-duration"));
  assert(Math.abs(duration1x / duration2x - 2) < 1e-9);
  const stroke = (root: SVGSVGElement, index: number) => {
    const node = root.querySelectorAll("[data-drawing-stroke]")[index];
    return {
      start: Number(node.getAttribute("data-stroke-start")),
      duration: Number(node.getAttribute("data-stroke-duration")),
    };
  };
  const first = stroke(at1x, 0);
  const firstFast = stroke(at2x, 0);
  const second = stroke(at1x, 1);
  const secondFast = stroke(at2x, 1);
  assert(Math.abs(first.duration / firstFast.duration - 2) < 1e-9);
  assert(Math.abs(second.duration / secondFast.duration - 2) < 1e-9);
  assert(
    Math.abs(
      (second.start - first.start - first.duration) /
          (secondFast.start - firstFast.start - firstFast.duration) - 2,
    ) < 1e-9,
  );
});

Deno.test("animates the supplied outlined equation as nine sequential glyph paths", async () => {
  const input = await Deno.readTextFile(
    new URL("./fixtures/equation.svg", import.meta.url),
  );
  const output = parse(
    applyDrawingAnimation(input, { mode: "wipe", duration: 3 }),
  );
  assert.equal(output.querySelectorAll("animate").length, 9);
  const ordered = Array.from(output.querySelectorAll("[data-drawing-index]"))
    .sort((a, b) =>
      Number(a.getAttribute("data-drawing-index")) -
      Number(b.getAttribute("data-drawing-index"))
    );
  assert.deepEqual(
    ordered.map((node) => node.querySelector("path")!.getAttribute("data-c")),
    [
      "32",
      "28",
      "78",
      "2B",
      "33",
      "29",
      "3D",
      "31",
      "30",
    ],
  );
});

Deno.test("tagged whiteboards follow teaching beats instead of global reading order", () => {
  const input = svg(`
    <g data-board-title="" data-drawing="static">
      <rect id="title" x="150" y="0" width="40" height="8"/>
    </g>
    <g data-figure-id="chart" data-figure-type="xy_chart">
      <g data-layer="base">
        <rect id="axis" x="0" y="20" width="80" height="4"/>
      </g>
      <g data-layer="emphasis">
        <g data-annotation-type="highlight" data-annotation-index="1">
          <circle id="second" cx="70" cy="40" r="6" fill="none" stroke="black" stroke-width="2"/>
        </g>
        <g data-annotation-type="highlight" data-annotation-index="0">
          <circle id="first" cx="20" cy="40" r="6" fill="none" stroke="black" stroke-width="2"/>
        </g>
      </g>
    </g>
    <g data-figure-id="eq" data-figure-type="math_expressions">
      <g data-layer="base">
        <path id="glyph" d="M0 80h100v8h-100z"/>
      </g>
      <g data-layer="emphasis">
        <g data-annotation-type="number" data-annotation-index="0">
          <text id="num" x="20" y="90">1</text>
        </g>
      </g>
    </g>`);
  const beats = planDrawingBeats(parse(input))!;
  assert.deepEqual(beats.map((beat) => beat.treatment), [
    "instant",
    "stroke",
    "stroke",
    "stroke",
    "stroke",
  ]);
  const output = parse(applyDrawingAnimation(input));
  assert.equal(
    output.querySelector("#title")!.closest("[data-drawing-index]"),
    null,
  );
  const axis = output.querySelector("#axis")!.closest("[data-layer='base']")!;
  assert.equal(axis.getAttribute("data-drawing-method"), "instant");
  assert.equal(axis.getAttribute("visibility"), "hidden");
  const first = output.querySelector("#first")!.closest(
    "[data-drawing-index]",
  )!;
  const second = output.querySelector("#second")!.closest(
    "[data-drawing-index]",
  )!;
  const glyph = output.querySelector("#glyph")!.closest(
    "[data-drawing-index]",
  )!;
  const number = output.querySelector("#num")!.closest(
    "[data-drawing-method='instant']",
  )!;
  assert.equal(first.getAttribute("data-drawing-method"), "path");
  assert.equal(second.getAttribute("data-drawing-method"), "path");
  assert.equal(glyph.getAttribute("data-drawing-method"), "skeleton");
  const starts = [axis, first, second, glyph, number].map((node) =>
    Number(node.getAttribute("data-drawing-start"))
  );
  for (let i = 1; i < starts.length; i++) {
    assert(starts[i] > starts[i - 1], "beats must follow teaching order");
  }
  assert.equal(
    output.querySelector("#glyph")!.closest("[data-layer='base']")!
      .getAttribute("visibility"),
    "hidden",
  );
});

Deno.test("figure speed overrides replace defaults, inherit by category, and include annotations", () => {
  const input = svg(`
    <g data-figure-id="text" data-figure-type="text">
      <g data-layer="base">
        <g data-figure-part="writing" data-drawing-text=""><path id="words" d="M0 0h50" fill="none" stroke="black"/></g>
        <g data-figure-part="box"><path id="box" d="M0 10h50" fill="none" stroke="black"/></g>
      </g>
      <g data-annotation-type="highlight" data-annotation-index="0"><path id="highlight" d="M0 20h50" fill="none" stroke="black"/></g>
    </g>
    <g data-figure-id="math" data-figure-type="math_expressions"><g data-layer="base"><path id="math" d="M0 30h50" fill="none" stroke="black"/></g></g>
    <g data-figure-id="shape" data-figure-type="geometry"><g data-layer="base"><path id="shape" d="M0 40h50" fill="none" stroke="black"/></g></g>`);
  const defaults = { speed: 1.25, textSpeed: 1.25, markSpeed: 1.25 };
  const baseline = parse(applyDrawingAnimation(input, defaults));
  const overrides = {
    text: { textSpeed: 1.5, markSpeed: 2 },
    math_expressions: { textSpeed: 1 },
  };
  const output = parse(
    applyDrawingAnimation(input, { ...defaults, figureSpeeds: overrides }),
  );
  const duration = (root: SVGSVGElement, id: string) =>
    Number(
      (root.querySelector(`#${id}`)!.parentNode as Element).getAttribute(
        "data-drawing-duration",
      ),
    );
  for (
    const [id, rate] of [["words", 1.5], ["box", 2], ["highlight", 2], [
      "math",
      1,
    ], ["shape", 1.25]] as const
  ) {
    assert(
      Math.abs(duration(output, id) - duration(baseline, id) * 1.25 / rate) <
        1e-6,
      id,
    );
  }
  const textOnly = parse(
    applyDrawingAnimation(input, {
      ...defaults,
      figureSpeeds: { text: { textSpeed: 1.5 } },
    }),
  );
  assert(
    Math.abs(duration(textOnly, "box") - duration(baseline, "box")) < 1e-6,
  );
  assert.equal(
    applyDrawingAnimation(input, defaults),
    applyDrawingAnimation(input, { ...defaults, figureSpeeds: {} }),
  );
  const indices = Array.from(output.querySelectorAll("[data-drawing-index]"))
    .map((n) => Number(n.getAttribute("data-drawing-start")));
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
  for (const value of [0, -1, NaN, Infinity]) {
    for (const key of ["textSpeed", "markSpeed"] as const) {
      assert.throws(
        () =>
          applyDrawingAnimation(input, {
            figureSpeeds: { text: { [key]: value } },
          }),
        /finite number greater than 0/,
      );
    }
  }
});

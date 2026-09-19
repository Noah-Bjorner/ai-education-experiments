import { strict as assert } from "node:assert";
// deno-lint-ignore no-import-prefix
import { createSVGWindow } from "npm:svgdom@0.1.23";
import { textExample } from "../render/text-examples.ts";
import { geometryExamples } from "../render/geometry-examples.ts";
import { boardExample } from "../render/board-example.ts";
import { whiteboardFigures } from "../figures/index.ts";
import type { WhiteboardSpec } from "../schema.ts";
import { renderWhiteboardSvg } from "../render/index.ts";
import { applyDrawingAnimation } from "./index.ts";
import { FIGURE_ANIMATION_POLICIES, planDrawingBeats } from "./policy.ts";

function parse(svg: string): SVGSVGElement {
  const document = createSVGWindow().document as Document;
  document.documentElement.innerHTML = svg;
  return document.documentElement.firstElementChild as SVGSVGElement;
}

function chartSvg(base: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <g data-figure-id="chart" data-figure-type="xy_chart">
      <g data-layer="base">${base}</g>
      <g data-annotation-type="number" data-annotation-index="0"><text>1</text></g>
    </g></svg>`;
}

const framework =
  '<g data-figure-part="framework"><path d="M0 0v100h100"/></g>';
const series = `<g data-figure-part="series" fill="none" stroke="black">
  <path id="first" d="M0 90L40 50"/>
  <path id="second" d="M40 50L80 10"/>
</g>`;

Deno.test("every supported figure has an explicit whole-base policy", () => {
  assert.deepEqual(
    Object.keys(FIGURE_ANIMATION_POLICIES).sort(),
    whiteboardFigures.map((figure) => figure.type).sort(),
  );
  for (const [type, policy] of Object.entries(FIGURE_ANIMATION_POLICIES)) {
    const root = parse(
      chartSvg('<path d="M0 0h100"/>').replace(
        'data-figure-type="xy_chart"',
        `data-figure-type="${type}"`,
      ),
    );
    const beats = planDrawingBeats(root)!;
    assert.equal(beats.length, 2);
    assert.equal(beats[0].hosts[0], root.querySelector('[data-layer="base"]'));
    assert.equal(beats[0].treatment, policy.base);
    assert.equal(beats[1].treatment, "stroke");
  }
});

Deno.test("part recipes override paint order without also animating the base", () => {
  // Framework deliberately follows data in the SVG; policy still reveals it first.
  const input = chartSvg(series + framework);
  const root = parse(input);
  const beats = planDrawingBeats(root)!;
  assert.deepEqual(beats.map((beat) => beat.treatment), [
    "instant",
    "stroke",
    "stroke",
  ]);
  assert.deepEqual(
    beats.slice(0, 2).map((beat) =>
      beat.hosts[0].getAttribute("data-figure-part")
    ),
    ["framework", "series"],
  );
  assert(
    !beats.some((beat) =>
      beat.hosts.includes(root.querySelector('[data-layer="base"]')!)
    ),
  );

  const output = parse(applyDrawingAnimation(input, { startTime: 2 }));
  const frame = output.querySelector('[data-figure-part="framework"]')!;
  const data = output.querySelector('[data-figure-part="series"]')!;
  assert.equal(frame.getAttribute("visibility"), "hidden");
  assert.equal(data.getAttribute("visibility"), "hidden");
  assert.equal(frame.getAttribute("data-drawing-start"), "2");
  assert.equal(
    frame.querySelectorAll('[data-drawing-method="path"]').length,
    0,
  );
  const first = output.querySelector("#first")!.closest(
    "[data-drawing-index]",
  )!;
  const second = output.querySelector("#second")!.closest(
    "[data-drawing-index]",
  )!;
  assert(
    Number(first.getAttribute("data-drawing-start")) <
      Number(second.getAttribute("data-drawing-start")),
    "ascending lines must follow data order, not top-to-bottom screen order",
  );
  assert.equal(
    output.querySelectorAll('[data-drawing-method="path"]').length,
    2,
  );
  const annotation = output.querySelector("[data-annotation-type]")!;
  assert(
    Number(annotation.getAttribute("data-drawing-start")) >=
      Number(second.getAttribute("data-drawing-start")) +
        Number(second.getAttribute("data-drawing-duration")),
  );
});

Deno.test("split recipes reject uncovered, nested, or non-group parts", () => {
  assert.throws(
    () =>
      planDrawingBeats(
        parse(chartSvg(series + "<text>Uncovered label</text>")),
      ),
    /cover the entire base/,
  );
  assert.throws(
    () =>
      planDrawingBeats(
        parse(chartSvg(`<g data-figure-part="framework">${series}</g>`)),
      ),
    /must not overlap/,
  );
  assert.throws(
    () =>
      planDrawingBeats(
        parse(chartSvg('<path data-figure-part="series" d="M0 0h100"/>')),
      ),
    /must be SVG groups/,
  );
});

function board(
  chartStyle: "line" | "area" | "bar" | "scatter",
  title: string | null,
  seriesCount = 2,
): WhiteboardSpec {
  return {
    title: "Chart lesson",
    figures: [{
      type: "xy_chart",
      id: "chart",
      title,
      chartStyle,
      anchor: null,
      side: null,
      xLabel: "Time",
      yLabel: "Value",
      series: Array.from({ length: seriesCount }, (_, s) => ({
        id: `s${s}`,
        name: `Series ${s + 1}`,
        points: [0, 1, 2].map((x) => ({ id: `p${s}-${x}`, x, y: x + s })),
      })),
      annotations: [{ type: "highlight", targetIds: ["p0-1"], text: null }],
    }],
  };
}

function timings(host: Element) {
  return Array.from(host.querySelectorAll("[data-drawing-index]")).map((
    node,
  ) => ({
    start: Number(node.getAttribute("data-drawing-start")),
    duration: Number(node.getAttribute("data-drawing-duration")),
  }));
}

Deno.test("callouts and groups finish indicators before writing their labels", () => {
  for (const type of ["callout", "group"] as const) {
    const spec = board("bar", "Shared title");
    spec.figures[0].annotations = [{
      type,
      targetIds: type === "group" ? ["p0-0", "p0-1"] : ["p0-1"],
      text: "Look here",
    }];
    const original = renderWhiteboardSvg(spec).svg;
    assert.equal(
      parse(original).querySelectorAll("[data-drawing-text]").length,
      0,
    );
    const output = parse(applyDrawingAnimation(original));
    const indicator = output.querySelector(
      '[data-annotation-part="indicator"]',
    )!;
    const label = output.querySelector('[data-annotation-part="text"]')!;
    const marks = timings(indicator), letters = timings(label);
    assert(marks.length > 0 && letters.length === 8);
    assert(
      Math.min(...letters.map((v) => v.start)) >=
        Math.max(...marks.map((v) => v.start + v.duration)),
    );
    assert.equal(label.getAttribute("visibility"), "hidden");
    const text = label.querySelector("text")!;
    assert.equal(text.getAttribute("visibility"), "hidden");
    const end = Math.max(...letters.map((v) => v.start + v.duration));
    assert.equal(text.querySelector("set")!.getAttribute("begin"), `${end}s`);
    assert.equal(
      label.querySelector("[data-drawing-text] > set")!.getAttribute("to"),
      "hidden",
    );
  }
});

Deno.test("numbers write in target order and unlabelled brackets need no text beat", () => {
  const spec = board("bar", null);
  spec.figures[0].annotations = [
    { type: "group", targetIds: ["p0-0", "p0-1"], text: null },
    { type: "number", targetIds: ["p0-2", "p0-0"], text: null },
  ];
  const original = renderWhiteboardSvg(spec).svg;
  assert.equal(planDrawingBeats(parse(original))!.length, 4);
  const output = parse(applyDrawingAnimation(original));
  const numbers = Array.from(
    output.querySelectorAll('[data-annotation-type="number"]'),
  );
  assert.equal(numbers.length, 2);
  assert.deepEqual(
    numbers.map((n) => n.querySelector("text")!.childNodes[0].textContent),
    ["1", "2"],
  );
  assert(
    numbers.every((n) =>
      n.querySelector('[data-drawing-text] [data-drawing-method="skeleton"]')
    ),
  );
  assert(timings(numbers[0])[0].start < timings(numbers[1])[0].start);
});

Deno.test("mark speed can change without changing writing durations or instant holds", () => {
  const spec = board("bar", null);
  spec.figures[0].annotations = [{
    type: "callout",
    targetIds: ["p0-1"],
    text: "Ab",
  }];
  const original = renderWhiteboardSvg(spec).svg;
  const normal = parse(applyDrawingAnimation(original));
  const fast = parse(applyDrawingAnimation(original, { markSpeed: 3 }));
  for (const part of ["indicator", "text"]) {
    const a = timings(
      normal.querySelector(`[data-annotation-part="${part}"]`)!,
    );
    const b = timings(fast.querySelector(`[data-annotation-part="${part}"]`)!);
    assert.equal(a.length, b.length);
    a.forEach((value, i) =>
      assert(
        Math.abs(value.duration / b[i].duration - (part === "text" ? 1 : 3)) <
          1e-8,
      )
    );
  }
  assert(
    Math.abs(
      Number(
        normal.querySelector('[data-layer="base"]')!.getAttribute(
          "data-drawing-duration",
        ),
      ) -
        Number(
          fast.querySelector('[data-layer="base"]')!.getAttribute(
            "data-drawing-duration",
          ),
        ),
    ) < 1e-9,
  );
  const fasterText = parse(applyDrawingAnimation(original, { textSpeed: 2 }));
  for (const part of ["indicator", "text"]) {
    const a = timings(
      normal.querySelector(`[data-annotation-part="${part}"]`)!,
    );
    const b = timings(
      fasterText.querySelector(`[data-annotation-part="${part}"]`)!,
    );
    a.forEach((value, i) =>
      assert(
        Math.abs(value.duration / b[i].duration - (part === "text" ? 2 : 1)) <
          1e-8,
      )
    );
  }
  for (
    const option of [{ markSpeed: 0 }, { textSpeed: -1 }, {
      markSpeed: Infinity,
    }, { textSpeed: NaN }]
  ) {
    assert.throws(() => applyDrawingAnimation(original, option));
  }
});

Deno.test("rendered line charts partition titles, axes, legends, and data completely", () => {
  for (const title of [null, "Growth over time"]) {
    const original = renderWhiteboardSvg(board("line", title)).svg;
    const root = parse(original);
    const beats = planDrawingBeats(root)!;
    assert.equal(beats.length, 12);
    assert.equal(beats[0].treatment, "instant");
    for (const offset of [1, 6]) {
      assert.deepEqual(
        beats.slice(offset, offset + 5).map((b) => b.treatment),
        ["instant", "stroke", "instant", "stroke", "instant"],
      );
      for (const i of [0, 2, 4]) assert.equal(beats[offset + i].hold, 0);
    }
    assert.equal(
      beats[0].hosts.some((host) =>
        host.getAttribute("data-figure-part") === "title"
      ),
      false,
    );
    for (
      const text of Array.from(
        root.querySelectorAll('[data-layer="base"] text'),
      )
    ) {
      if (text.closest('[data-drawing="static"]')) continue;
      assert(
        beats[0].hosts.some((host) => host.contains(text)),
        "all chart labels appear with the framework",
      );
    }
    const animated = parse(applyDrawingAnimation(original));
    const data = Array.from(
      animated.querySelectorAll('[data-figure-part="series"]'),
    );
    assert(data.every((host) => host.getAttribute("visibility") === null));
    assert.equal(
      animated.querySelector("[data-board-title]")!.getAttribute("visibility"),
      null,
    );
    assert.equal(
      animated.querySelector('[data-layer="base"]')!.getAttribute("visibility"),
      null,
    );
    for (const host of data) {
      for (
        const point of Array.from(host.querySelectorAll("[data-series-point]"))
      ) {
        assert.equal(
          point.querySelectorAll("[data-drawing-index], mask").length,
          0,
        );
        assert.equal(point.getAttribute("visibility"), "hidden");
        const incoming = host.querySelector(
          `[data-series-segment="${point.getAttribute("data-series-point")}"]`,
        );
        if (incoming) {
          const strokes = Array.from(
            incoming.querySelectorAll("[data-drawing-index]"),
          );
          const last = strokes.at(-1)!;
          const end = Number(last.getAttribute("data-drawing-start")) +
            Number(last.getAttribute("data-drawing-duration"));
          assert(
            Math.abs(Number(point.getAttribute("data-drawing-start")) - end) <
              0.00001,
          );
        }
      }
    }
  }
});

Deno.test("bar, area, and scatter charts retain their single instant base", () => {
  for (const style of ["bar", "area", "scatter"] as const) {
    const root = parse(renderWhiteboardSvg(board(style, "Comparison")).svg);
    const beats = planDrawingBeats(root)!;
    assert.equal(beats.length, 2);
    assert.equal(beats[0].hosts[0], root.querySelector('[data-layer="base"]'));
    assert.equal(beats[0].treatment, "instant");
  }
});

Deno.test("figure titles and underlines stay static inside delayed bases", () => {
  for (const style of ["line", "bar"] as const) {
    const output = parse(applyDrawingAnimation(
      renderWhiteboardSvg(board(style, "Always visible")).svg,
      { startTime: 3 },
    ));
    const title = output.querySelector('[data-figure-part="title"]')!;
    assert.equal(title.getAttribute("data-drawing"), "static");
    assert.equal(title.getAttribute("visibility"), "visible");
    assert(title.querySelector("[data-figure-title-underline]"));
    assert.equal(
      title.querySelectorAll("animate, set, [data-drawing-index]").length,
      0,
    );
    assert(
      !planDrawingBeats(
        parse(renderWhiteboardSvg(board(style, "Always visible")).svg),
      )!
        .some((beat) =>
          beat.hosts.some((host) =>
            host.getAttribute("data-figure-part") === "title"
          )
        ),
    );
  }
});

Deno.test("single-point line series reveal whole without ink or extra hold", () => {
  const input = chartSvg(
    framework +
      '<g data-figure-part="series"><g data-series-point="a"><circle cx="20" cy="20" r="4"/></g></g>',
  );
  for (const mode of ["strokes", "wipe"] as const) {
    const output = parse(applyDrawingAnimation(input, { mode, startTime: 2 }));
    const dot = output.querySelector('[data-series-point="a"]')!;
    assert.equal(dot.getAttribute("data-drawing-duration"), "0");
    assert.equal(dot.getAttribute("data-drawing-method"), "instant");
    assert.equal(dot.querySelectorAll("mask, animate").length, 0);
    assert(Number(dot.getAttribute("data-drawing-start")) > 2);
    assert(!output.outerHTML.includes("NaN"));
  }
});

Deno.test("line charts draw up to three series and reveal denser data together", () => {
  for (const count of [1, 3, 4, 8]) {
    const original = renderWhiteboardSvg(board("line", null, count)).svg;
    const beats = planDrawingBeats(parse(original))!;
    assert.equal(beats.at(-1)!.treatment, "stroke", "annotations still draw");
    const data = beats.slice(1, -1);
    if (count <= 3) {
      assert.equal(data.length, count * 5);
      assert.equal(
        data.filter((b) => b.treatment === "stroke").length,
        count * 2,
      );
    } else {
      assert.equal(data.length, 1);
      assert.equal(data[0].treatment, "instant");
      assert.equal(data[0].hosts.length, count);
      const animated = parse(applyDrawingAnimation(original, { startTime: 2 }));
      const series = Array.from(
        animated.querySelectorAll('[data-figure-part="series"]'),
      );
      const starts = series.map((s) =>
        s.querySelector("set")!.getAttribute("begin")
      );
      assert.equal(
        new Set(starts).size,
        1,
        "all lines and dots reveal together",
      );
      for (const host of series) {
        assert.equal(host.getAttribute("visibility"), "hidden");
        assert.equal(host.querySelectorAll("mask, animate").length, 0);
      }
    }
  }
});

Deno.test("geometry draws construction before points, labels, property marks, and annotations", () => {
  for (const figure of geometryExamples) {
    const original = renderWhiteboardSvg(boardExample([figure])).svg;
    const beats = planDrawingBeats(parse(original))!;
    const names = beats.flatMap((b) =>
      b.hosts.map((h) => h.getAttribute("data-figure-part"))
    ).filter(Boolean);
    const order = ["construction", "points", "labels", "markings"];
    const ranks = names.map((n) => order.indexOf(n!));
    assert(ranks.every((r) => r >= 0));
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
    const output = parse(applyDrawingAnimation(original));
    let previousEnd = 0;
    for (const name of order) {
      const hosts = Array.from(
        output.querySelectorAll(`[data-figure-part="${name}"]`),
      );
      for (const host of hosts) {
        const start = parseFloat(
          host.querySelector("set")!.getAttribute("begin")!,
        );
        assert(
          (name === "points" &&
            host.getAttribute("data-drawing-method") === "instant") ||
            start >= previousEnd - 1e-6,
          `${name} must wait for earlier parts`,
        );
        assert.equal(host.getAttribute("visibility"), "hidden");
      }
      const ink = hosts.flatMap((h) => timings(h));
      if (ink.length) {
        previousEnd = Math.max(...ink.map((t) => t.start + t.duration));
      }
    }
    for (
      const host of Array.from(
        output.querySelectorAll("[data-annotation-type]"),
      )
    ) {
      const starts = Array.from(host.querySelectorAll("set")).map((s) =>
        parseFloat(s.getAttribute("begin")!)
      );
      assert(starts.every((s) => s >= previousEnd - 1e-6));
    }
    assert.equal(
      output.querySelector('[data-figure-part="title"]')?.getAttribute(
        "visibility",
      ),
      "visible",
    );
  }
});

Deno.test("text figures finish handwriting before boxing for every role", () => {
  for (const role of ["note", "question", "takeaway"] as const) {
    const original = renderWhiteboardSvg(
      boardExample([textExample(role, "First line\nSecond line")]),
    ).svg;
    assert(!original.includes("data-drawing-text"));
    const beats = planDrawingBeats(parse(original))!;
    assert.deepEqual(
      beats.slice(0, 2).map((b) => b.hosts[0].getAttribute("data-figure-part")),
      ["writing", "box"],
    );
    const output = parse(applyDrawingAnimation(original));
    const writing = output.querySelector('[data-figure-part="writing"]')!;
    const ink = timings(writing);
    assert(ink.length > 10, "letters must draw individually");
    assert.equal(writing.querySelectorAll("[data-drawing-text]").length, 2);
    const end = Math.max(...ink.map((t) => t.start + t.duration));
    const box = output.querySelector('[data-figure-part="box"]')!;
    assert(
      parseFloat(box.querySelector("set")!.getAttribute("begin")!) >=
        end - 1e-6,
    );
    assert.equal(box.getAttribute("visibility"), "hidden");
  }
});

Deno.test("geometry corner dots reveal during the first construction pass", () => {
  const original = renderWhiteboardSvg(boardExample([geometryExamples[0]])).svg;
  const planned = planDrawingBeats(parse(original))!;
  const reveals = planned.flatMap((b) => b.pointReveals ?? []);
  assert(reveals.length >= 3);
  assert.equal(new Set(reveals.map((r) => r.host)).size, reveals.length);
  for (const markMotion of ["linear", "natural"] as const) {
    const output = parse(
      applyDrawingAnimation(original, { markMotion, startTime: 2, speed: 2 }),
    );
    for (const reveal of reveals) {
      const id = reveal.host.getAttribute("data-geometry-point")!;
      const dot = output.querySelector(`[data-geometry-point="${id}"]`)!;
      const path = Array.from(output.querySelectorAll("[data-geometry-points]"))
        .find((p) =>
          p.getAttribute("data-geometry-points") ===
            reveal.path.getAttribute("data-geometry-points")
        )!;
      const stroke = path.parentNode as Element;
      const start = Number(stroke.getAttribute("data-drawing-start"));
      const duration = Number(stroke.getAttribute("data-drawing-duration"));
      const at = Number(dot.getAttribute("data-drawing-start"));
      assert(at >= start - 1e-6 && at <= start + duration + 1e-6);
      if (reveal.progress < 1) assert(at < start + duration);
      if (markMotion === "linear") {
        assert(Math.abs(at - (start + duration * reveal.progress)) < 1e-6);
      }
      assert.equal(
        dot.querySelectorAll("mask, animate, [data-drawing-index]").length,
        0,
      );
      assert.equal(dot.querySelectorAll("set").length, 1);
    }
  }
});

Deno.test("text-figure writing and box have independent speed controls", () => {
  const original =
    renderWhiteboardSvg(boardExample([textExample("note", "Compare values.")]))
      .svg;
  const durations = (options: { textSpeed?: number; markSpeed?: number }) => {
    const root = parse(applyDrawingAnimation(original, options));
    return ["writing", "box"].map((part) =>
      timings(root.querySelector(`[data-figure-part="${part}"]`)!).reduce(
        (sum, t) => sum + t.duration,
        0,
      )
    );
  };
  const normal = durations({}),
    fastText = durations({ textSpeed: 2 }),
    fastBox = durations({ markSpeed: 2 });
  assert(Math.abs(fastText[0] * 2 - normal[0]) < 1e-6);
  assert(Math.abs(fastText[1] - normal[1]) < 1e-6);
  assert(Math.abs(fastBox[0] - normal[0]) < 1e-6);
  assert(Math.abs(fastBox[1] * 2 - normal[1]) < 1e-6);
});

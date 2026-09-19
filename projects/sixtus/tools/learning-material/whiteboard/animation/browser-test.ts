import { strict as assert } from "node:assert";
// Verification-only dependency; the SVG generator does not require a browser.
// deno-lint-ignore no-import-prefix
import { chromium } from "npm:playwright-core@1.55.0";
import { applyDrawingAnimation } from "./index.ts";
import { renderWhiteboardSvg } from "../render/index.ts";
import { textExample } from "../render/text-examples.ts";
import { geometryExamples } from "../render/geometry-examples.ts";
import { boardExample } from "../render/board-example.ts";
import { renderHandwritten } from "../render/handwritten.ts";

Deno.test("Chromium: blank start, partial ink, backward seeking, and pixel-identical final artwork", async () => {
  const browser = await chromium.launch({
    executablePath: Deno.env.get("CHROME_PATH") ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-background-networking"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1000, height: 400 },
    });
    // These fixtures contain only outlined geometry. No external fonts are needed.
    await page.route("https://**/*", (route) => route.abort());
    const mount = async (svg: string) => {
      await page.setContent(
        `<style>body{margin:0;background:white}svg{display:block;width:900px;height:300px}</style>${svg}`,
      );
    };
    const seek = async (seconds: number) => {
      await page.locator("svg").evaluate((element, seconds) => {
        const svg = element as SVGSVGElement;
        svg.pauseAnimations();
        svg.setCurrentTime(seconds);
      }, seconds);
      return await page.locator("svg").screenshot();
    };
    // Verify Chromium actually consumes the distance/time keyframes, rather
    // than silently ignoring an invalid SMIL curve and showing only final ink.
    await mount(applyDrawingAnimation(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 30"><path d="M10 15h100" fill="none" stroke="black" stroke-width="2"/></svg>',
      { duration: 1 },
    ));
    const progress: number[] = [];
    for (const time of [0.1, 0.5, 0.9]) {
      await seek(time);
      progress.push(
        await page.locator("mask path").evaluate((node) =>
          1 - parseFloat(getComputedStyle(node).strokeDashoffset) / 100
        ),
      );
    }
    assert(
      progress[0] > 0 && progress[0] < 0.1,
      "pen accelerates from contact",
    );
    assert(
      progress[1] > 0.4 && progress[1] < 0.6,
      "ink advances through the middle",
    );
    assert(progress[2] > 0.9 && progress[2] < 1, "pen slows before lifting");
    const fixtures = await Promise.all(
      ["equation", "shapes", "natural-marks"].map(async (name) => ({
        name,
        original: await Deno.readTextFile(
          new URL(`./fixtures/${name}.svg`, import.meta.url),
        ),
      })),
    );
    for (const roughness of [0.7, 1.5, 5]) {
      const line = renderHandwritten({
        type: "line",
        x1: 10,
        y1: 15,
        x2: 110,
        y2: 15,
      }, { id: "line", roughness, strokeWidth: 3 });
      const circle = renderHandwritten({
        type: "circle",
        cx: 160,
        cy: 45,
        r: 32,
      }, { id: "circle", roughness, strokeWidth: 3 });
      const box = renderHandwritten({
        type: "rectangle",
        x: 215,
        y: 15,
        width: 65,
        height: 60,
      }, { id: "box", roughness, strokeWidth: 3 });
      fixtures.push({
        name: `marker-${roughness}`,
        original:
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 110"><g transform="translate(5 8) scale(1.02)">${line.markup}${circle.markup}${box.markup}</g></svg>`,
      });
    }
    for (const { name, original } of fixtures) {
      await mount(original);
      const finished = await page.locator("svg").screenshot();
      await page.locator("svg").evaluate((element) => element.innerHTML = "");
      const blank = await page.locator("svg").screenshot();
      await mount(applyDrawingAnimation(original, { duration: 5 }));
      assert.deepEqual(await seek(0), blank, `${name}: zero must be blank`);
      const partial = await seek(1.6);
      assert.notDeepEqual(partial, blank);
      assert.notDeepEqual(partial, finished);
      if (name.startsWith("marker-")) {
        // Just before completion, the mask must already cover the whole ribbon.
        // This catches corner/width clipping otherwise hidden by mask removal.
        const almost = await seek(4.9999);
        const difference = await page.evaluate(async (images) => {
          const pixels = await Promise.all(images.map(async (bytes) => {
            const bitmap = await createImageBitmap(
              new Blob([new Uint8Array(bytes)], { type: "image/png" }),
            );
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext("2d")!;
            context.drawImage(bitmap, 0, 0);
            bitmap.close();
            return context.getImageData(0, 0, canvas.width, canvas.height).data;
          }));
          return pixels[0].reduce(
            (max, value, i) => Math.max(max, Math.abs(value - pixels[1][i])),
            0,
          );
        }, [Array.from(almost), Array.from(finished)]);
        // Mask compositing can round an antialiased edge by one color level.
        assert(
          difference <= 1,
          `${name}: no final ink pop`,
        );
      }
      assert.deepEqual(
        await seek(5),
        finished,
        `${name}: final artwork must match exactly`,
      );
      assert.deepEqual(
        await seek(1.6),
        partial,
        `${name}: backward seek must reproduce the same pixels`,
      );
      assert.deepEqual(
        await seek(0),
        blank,
        `${name}: rewind must hide completed strokes`,
      );
    }
    // Split beats must hide every host, including instant framework groups,
    // and restore visibility correctly when seeking backward across boundaries.
    const chart =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100">
      <g data-board-title="" data-drawing="static"><rect x="70" y="5" width="60" height="4"/></g>
      <g data-figure-id="chart" data-figure-type="xy_chart">
        <g data-layer="base">
          <g data-figure-part="framework"><path d="M20 20v70h160" fill="none" stroke="black"/></g>
          <g data-figure-part="framework"><rect x="85" y="95" width="30" height="3"/></g>
          <g data-figure-part="series"><path d="M20 90L90 65L180 25" fill="none" stroke="blue" stroke-width="2"/></g>
        </g>
        <g data-annotation-type="highlight" data-annotation-index="0"><circle cx="90" cy="65" r="10" fill="none" stroke="red"/></g>
      </g>
      <g data-figure-id="later" data-figure-type="pie_chart">
        <g data-layer="base">
          <g data-figure-part="title" data-drawing="static" visibility="visible"><rect x="220" y="10" width="40" height="4"/><rect x="220" y="17" width="40" height="2"/></g>
          <rect id="later-body" x="220" y="40" width="40" height="40"/>
        </g>
      </g>
    </svg>`;
    await mount(chart);
    const finishedChart = await page.locator("svg").screenshot();
    await page.locator(
      '[data-figure-part="series"], [data-annotation-type], #later-body',
    )
      .evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
    const frameworkOnly = await page.locator("svg").screenshot();
    await page.locator('[data-figure-part="framework"]').evaluateAll((nodes) =>
      nodes.forEach((node) => node.remove())
    );
    const titleOnly = await page.locator("svg").screenshot();
    await mount(applyDrawingAnimation(chart, { startTime: 1, duration: 5 }));
    const seriesStart = await page.locator('[data-figure-part="series"] > set')
      .evaluate((node) => parseFloat(node.getAttribute("begin")!));
    assert.deepEqual(await seek(0), titleOnly);
    assert.deepEqual(await seek(seriesStart - 0.001), frameworkOnly);
    const partialChart = await seek(seriesStart + 0.1);
    assert.notDeepEqual(partialChart, frameworkOnly);
    assert.notDeepEqual(partialChart, finishedChart);
    assert.deepEqual(await seek(6), finishedChart);
    assert.deepEqual(await seek(seriesStart + 0.1), partialChart);
    assert.deepEqual(await seek(seriesStart - 0.001), frameworkOnly);
    assert.deepEqual(await seek(0), titleOnly);
    const lineChart = renderWhiteboardSvg({
      title: "Line points",
      figures: [{
        id: "line",
        type: "xy_chart",
        title: "Growth",
        chartStyle: "line",
        anchor: null,
        side: null,
        xLabel: "Time",
        yLabel: "Value",
        annotations: [],
        series: [{
          id: "s",
          name: "Series",
          points: [
            { id: "a", x: 0, y: 1 },
            { id: "b", x: 1, y: 3 },
            { id: "c", x: 2, y: 2 },
          ],
        }],
      }],
    }).svg;
    await mount(lineChart);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const finishedLine = await page.locator("svg").screenshot();
    await mount(
      applyDrawingAnimation(lineChart, { startTime: 1, duration: 5 }),
    );
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const pointTimes = await page.locator("[data-series-point]").evaluateAll(
      (nodes) => nodes.map((n) => Number(n.getAttribute("data-drawing-start"))),
    );
    for (let i = 0; i < pointTimes.length; i++) {
      for (const delta of [0.001, -0.001]) {
        await seek(pointTimes[i] + delta);
        const visible = await page.locator("[data-series-point]").evaluateAll(
          (nodes) =>
            nodes.map((n) => getComputedStyle(n).visibility === "visible"),
        );
        assert.deepEqual(
          visible,
          pointTimes.map((t) => t <= pointTimes[i] + delta),
        );
      }
    }
    assert.deepEqual(
      await seek(6.01),
      finishedLine,
      "line chart preserves final artwork",
    );
    const triangle =
      renderWhiteboardSvg(boardExample([geometryExamples[0]])).svg;
    await mount(triangle);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const finishedTriangle = await page.locator("svg").screenshot();
    await mount(applyDrawingAnimation(triangle, { startTime: 1, duration: 8 }));
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const cornerTimes = await page.locator(
      '[data-geometry-point][data-drawing-method="instant"]',
    ).evaluateAll((nodes) =>
      nodes.map((n) => ({
        id: n.getAttribute("data-geometry-point")!,
        at: Number(n.getAttribute("data-drawing-start")),
      }))
    );
    assert(cornerTimes.length >= 3);
    for (const { id, at } of cornerTimes) {
      for (const delta of [0.001, -0.001]) {
        await seek(at + delta);
        assert.equal(
          await page.locator(`[data-geometry-point="${id}"]`).evaluate((n) =>
            getComputedStyle(n).visibility
          ),
          delta > 0 ? "visible" : "hidden",
        );
      }
    }
    const labelStart = await page.locator('[data-figure-part="labels"] > set')
      .first().evaluate((n) => parseFloat(n.getAttribute("begin")!));
    for (const t of [labelStart - 0.01, 9.01, labelStart - 0.01]) {
      const frame = await seek(t);
      const labelsVisible = await page.locator('[data-figure-part="labels"]')
        .evaluateAll((nodes) =>
          nodes.some((n) => getComputedStyle(n).visibility === "visible")
        );
      assert.equal(labelsVisible, t > labelStart);
      if (t > 9) {
        assert.deepEqual(
          frame,
          finishedTriangle,
          "geometry preserves final artwork",
        );
      }
    }
    const textCard = renderWhiteboardSvg(
      boardExample([textExample("question", "Why?\nExplain.")]),
    ).svg;
    await mount(textCard);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const finishedText = await page.locator("svg").screenshot();
    await mount(applyDrawingAnimation(textCard, { startTime: 1, duration: 6 }));
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const boxStart = await page.locator('[data-figure-part="box"] > set')
      .evaluate((n) => parseFloat(n.getAttribute("begin")!));
    const writingTime = 1 + (boxStart - 1) * 0.5;
    const partialText = await seek(writingTime);
    assert.equal(
      await page.locator('[data-figure-part="box"]').evaluate((n) =>
        getComputedStyle(n).visibility
      ),
      "hidden",
    );
    assert.notDeepEqual(partialText, finishedText);
    assert.deepEqual(
      await seek(7.01),
      finishedText,
      "text card restores exact final artwork",
    );
    assert.deepEqual(
      await seek(writingTime),
      partialText,
      "text card rewinds handwriting",
    );
    for (const type of ["callout", "group", "number"] as const) {
      const original = renderWhiteboardSvg({
        title: "Annotation writing",
        figures: [{
          id: "bars",
          type: "xy_chart",
          title: "Visible heading",
          chartStyle: "bar",
          anchor: null,
          side: null,
          xLabel: "Trial",
          yLabel: "Score",
          series: [{
            id: "scores",
            name: "Scores",
            points: [
              { id: "a", x: "A", y: 3 },
              { id: "b", x: "B", y: 7 },
            ],
          }],
          annotations: [{
            type,
            targetIds: type === "callout" ? ["a"] : ["a", "b"],
            text: type === "number" ? null : "Ab",
          }],
        }],
      }).svg;
      await mount(original);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const finalText = await page.locator("svg").screenshot();
      await mount(
        applyDrawingAnimation(original, { startTime: 1, duration: 6 }),
      );
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const letter = await page.locator(
        "[data-drawing-text] [data-drawing-index]",
      ).first().evaluate((node) => ({
        start: Number(node.getAttribute("data-drawing-start")),
        duration: Number(node.getAttribute("data-drawing-duration")),
      }));
      const beforeWriting = await seek(letter.start - 0.001);
      const duringWriting = await seek(letter.start + letter.duration * 0.6);
      assert.notDeepEqual(
        duringWriting,
        beforeWriting,
        `${type}: ink must draw progressively`,
      );
      assert.deepEqual(
        await seek(7.01),
        finalText,
        `${type}: restore exact live-text artwork`,
      );
      assert.deepEqual(
        await seek(letter.start + letter.duration * 0.6),
        duringWriting,
        `${type}: rewind writing`,
      );
      assert.deepEqual(
        await seek(letter.start - 0.001),
        beforeWriting,
        `${type}: hide text again before writing`,
      );
    }
  } finally {
    await browser.close();
  }
});

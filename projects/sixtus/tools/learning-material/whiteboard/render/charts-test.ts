import { assert, assertEquals } from "@std/assert";
import { chartExamples } from "./charts-gallery.ts";
import { type Graph, renderGraphSvg, renderXyGraphDrawing } from "./graphs.ts";
import { renderWhiteboardSvg } from "./index.ts";

Deno.test("all six charts render reproducibly without mutations and support board annotations", () => {
  for (const chart of chartExamples) {
    const before = JSON.stringify(chart);
    const a = renderGraphSvg(chart, { id: `test-${chart.id}` });
    assertEquals(a, renderGraphSvg(chart, { id: `test-${chart.id}` }));
    assertEquals(JSON.stringify(chart), before);
    for (
      const m of a.svg.matchAll(
        /\b(?:d|x|y|cx|cy|width|height|viewBox)="([^"]*)"/g,
      )
    ) assert(!/NaN|Infinity/.test(m[1]));
    const target = chart.type === "xy_chart"
      ? `${chart.id}.a-0.mark`
      : `${chart.id}.fiction.mark`;
    const board = renderWhiteboardSvg({
      layout: "single",
      children: [{
        ...chart,
        annotations: [{ type: "circle", targetIds: [target], content: null }],
      }],
    });
    assert(board.svg.includes(`id="${target}"`));
    assert(board.stages.emphasis.svg !== board.stages.base.svg);
  }
});

Deno.test("scatter does not connect observations, area has a clipped fill, grouped bars preserve categories", () => {
  const xy = chartExamples.filter((c) => c.type === "xy_chart");
  const drawings = xy.map((c) =>
    renderXyGraphDrawing(c, { id: `test-${c.id}`, roughness: 0 })
  );
  const dataStrokes = (i: number) =>
    drawings[i].obstacles.filter((o) => o.kind === "stroke").length;
  assert(dataStrokes(0) > dataStrokes(2));
  assert(drawings[3].markup.includes('id="test-area-area-0"'));
  const bars = drawings[1].targets;
  assert(
    bars.get("bar.a-0.mark")!.bounds.x < bars.get("bar.b-0.mark")!.bounds.x,
  );
  assert(
    bars.get("bar.b-0.mark")!.bounds.x < bars.get("bar.a-1.mark")!.bounds.x,
  );
  const zeroY = bars.get("bar.a-0.mark")!.bounds.y +
    bars.get("bar.a-0.mark")!.bounds.height;
  assert(Math.abs(bars.get("bar.a-2.mark")!.bounds.y - zeroY) < 3);
});

Deno.test("single slices, tiny slices, zero bars, sparse groups, and flat areas have finite geometry", () => {
  const charts: Graph[] = [
    ...(["pie", "donut"] as const).map((chartStyle) => ({
      type: "pie_chart" as const,
      title: "Whole",
      chartStyle,
      slices: [{
        label: "All",
        value: 1,
      }],
    })),
    {
      type: "pie_chart",
      title: "Tiny",
      chartStyle: "donut",
      slices: [{ label: "Most", value: 999 }, { label: "Tiny", value: 1 }],
    },
    {
      type: "xy_chart",
      title: "Zero",
      chartStyle: "bar",
      xLabel: "X",
      yLabel: "Y",
      series: [{ name: "A", points: [{ x: "A", y: 0 }] }, {
        name: "B",
        points: [{ x: "B", y: -1 }],
      }],
    },
    {
      type: "xy_chart",
      title: "Flat",
      chartStyle: "area",
      xLabel: "X",
      yLabel: "Y",
      series: [{ name: "A", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }],
    },
  ];
  for (const chart of charts) {
    assert(renderGraphSvg(chart, { id: "edge" }).width > 0);
  }
});

import { boardExample } from "./board-example.ts";
import { assert, assertEquals } from "@std/assert";
import {
  type Distribution,
  distribution,
  distributionSchema,
} from "../figures/distribution.ts";
import { WhiteboardOutput } from "../schema.ts";
import { WHITEBOARD_SPEC_SYSTEM_PROMPT_V2 } from "../spec/prompt.ts";
import { distributionExamples } from "./distribution-gallery.ts";
import { renderDistributionDrawing } from "./distribution.ts";
import { renderWhiteboardSvg } from "./index.ts";

const figure = distribution.example.output;
const draw = (value: Distribution) =>
  renderDistributionDrawing(value, { id: "test-distribution", roughness: 0 });

Deno.test("distribution example parses, registers, and renders through the board", () => {
  assertEquals(distributionSchema.parse(figure), figure);
  assert(WhiteboardOutput.parse(boardExample([figure])).figures[0].id);
  const system = WHITEBOARD_SPEC_SYSTEM_PROMPT_V2({
    availableFigures: [distribution],
  });
  assert(system.includes("## distribution"));
  assert(system.includes(distribution.summary));
  assert(system.includes("histogram"));
  assert(system.includes("density"));
  assert(system.includes("xLabel"));
  assert(system.includes("About 68% of values"));
  const board = renderWhiteboardSvg(boardExample([figure]));
  assert(board.svg.includes('id="standard-normal.z.mark"'));
  assert(board.svg.includes('id="standard-normal.within-one.mark"'));
  assert(board.svg.includes('id="standard-normal.mu.label"'));
  assert(board.calloutPlacements.length === 1);
  assert(!/NaN|Infinity/.test(board.svg));
});

Deno.test("style-specific fields, contiguous bins, and box order are enforced", () => {
  assert(
    !distributionSchema.safeParse({
      ...figure,
      bins: [{ id: "b", start: 0, end: 1, count: 1 }],
    }).success,
  );
  assert(
    !distributionSchema.safeParse({
      type: "distribution",
      title: null,
      chartStyle: "histogram",
      xLabel: "x",
      yLabel: "n",
      bins: [
        { id: "a", start: 0, end: 1, count: 1 },
        { id: "b", start: 2, end: 3, count: 1 },
      ],
    }).success,
  );
  assert(
    !distributionSchema.safeParse({
      type: "distribution",
      title: null,
      chartStyle: "histogram",
      xLabel: "x",
      yLabel: null,
      bins: [{ id: "a", start: 0, end: 1, count: 1 }],
    }).success,
  );
  assert(
    !distributionSchema.safeParse({
      type: "distribution",
      title: null,
      chartStyle: "box",
      xLabel: "Class",
      yLabel: "Score",
      groups: [{
        id: "a",
        name: "A",
        min: 10,
        q1: 20,
        median: 15,
        q3: 30,
        max: 40,
      }],
    }).success,
  );
  assert(
    !distributionSchema.safeParse({
      type: "distribution",
      title: null,
      chartStyle: "dot_plot",
      xLabel: "x",
      yLabel: "n",
      stacks: [{ id: "a", x: 1, count: 2 }],
    }).success,
  );
  assert(
    !distributionSchema.safeParse({
      ...figure,
      regions: [{
        id: "missing",
        curveId: "nope",
        from: -1,
        to: 1,
      }],
    }).success,
  );
});

Deno.test("gallery styles render reproducibly with finite geometry and style targets", () => {
  for (const example of distributionExamples) {
    assert(distributionSchema.safeParse(example).success, example.id);
    const spec = boardExample([example]);
    const before = JSON.stringify(spec);
    const a = renderWhiteboardSvg(spec);
    assertEquals(a.svg, renderWhiteboardSvg(spec).svg);
    assertEquals(JSON.stringify(spec), before);
    assert(!/NaN|Infinity/.test(a.svg));
    const drawing = draw(example);
    for (const [id, target] of drawing.targets) {
      assert(Object.values(target.bounds).every(Number.isFinite), id);
    }
  }
  const histogram = distributionExamples.find((item) =>
    item.id === "histogram"
  )!;
  const bars = draw(histogram).targets;
  assert(
    bars.get("histogram.low.mark")!.bounds.x <
      bars.get("histogram.mid.mark")!.bounds.x,
  );
  const low = bars.get("histogram.low.mark")!.bounds;
  const midLow = bars.get("histogram.mid-low.mark")!.bounds;
  assert(Math.abs(low.x + low.width - midLow.x) < 4);

  const dots = draw(
    distributionExamples.find((item) => item.id === "dot-plot")!,
  );
  const none = dots.targets.get("dot-plot.none.mark")!.bounds;
  const one = dots.targets.get("dot-plot.one.mark")!.bounds;
  assert(one.height > none.height);
  assert(one.y < none.y);

  const box = draw(distributionExamples.find((item) => item.id === "box")!);
  const a = box.targets.get("box.class-a.mark")!.bounds;
  const b = box.targets.get("box.class-b.mark")!.bounds;
  assert(a.x < b.x);
  assert(box.targets.has("box.a-low.mark"));
});

Deno.test("invalid leftover style fields and duplicate stack positions fail", () => {
  assert(
    !distributionSchema.safeParse({
      ...figure,
      bins: [{ id: "b", start: 0, end: 1, count: 1 }],
    }).success,
  );
  const result = distributionSchema.safeParse({
    type: "distribution",
    title: null,
    chartStyle: "dot_plot",
    xLabel: "x",
    yLabel: null,
    stacks: [
      { id: "a", x: 1, count: 2 },
      { id: "b", x: 1, count: 3 },
    ],
  });
  assert(!result.success);
});

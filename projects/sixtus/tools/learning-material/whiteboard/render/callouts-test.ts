import { assert, assertEquals, assertThrows } from "@std/assert";
import type { WhiteboardSpec } from "../schema.ts";
import type { PendingCallout } from "./annotations.ts";
import { renderCallouts } from "./callouts.ts";
import { renderWhiteboardSvg } from "./index.ts";
import { renderCircularGraphDrawing, renderXyGraphDrawing } from "./graphs.ts";
import {
  clearRoute,
  inflate,
  obstacleHitsBox,
  overlaps,
  port,
  routeConnector,
} from "./placement.ts";
import type { RenderObstacle, TargetedDrawing } from "./targets.ts";

const chart = {
  type: "xy_chart",
  id: "motion",
  title: "Illustrative motion",
  chartStyle: "line",
  xLabel: "Time (s)",
  yLabel: "Height (m)",
  series: [{
    id: "height",
    name: "Height",
    points: [
      { id: "start", x: 0, y: 0 },
      { id: "rise", x: 1, y: 3 },
      { id: "peak", x: 2, y: 5 },
      { id: "fall", x: 3, y: 2 },
      { id: "finish", x: 4, y: 1 },
    ],
  }],
  annotations: [
    {
      type: "arrow",
      targetIds: ["motion.peak.mark"],
      content: "Maximum height\nThe descent begins here",
    },
    {
      type: "line",
      targetIds: ["motion.finish.mark"],
      content: "Still above the starting height",
    },
    {
      type: "arrow",
      targetIds: ["motion.start.mark"],
      content: "Start at ground level",
    },
  ],
} satisfies WhiteboardSpec["children"][number];

Deno.test("messages and connectors avoid base content and other callouts", () => {
  const base = renderXyGraphDrawing(chart, { id: "test" });
  const result = renderWhiteboardSvg({ layout: "single", children: [chart] });
  assertEquals(result.calloutPlacements.length, 3);
  assertEquals(
    result,
    renderWhiteboardSvg({ layout: "single", children: [chart] }),
  );
  for (const placement of result.calloutPlacements) {
    const box = placement.labelBounds!;
    for (const obstacle of base.obstacles) {
      assert(
        !obstacleHitsBox(obstacle, box, 5),
        "Message must have clearance from every base element",
      );
    }
    const unrelated = base.obstacles.filter((o) =>
      !o.ownerId || !placement.targetIds.includes(o.ownerId)
    );
    for (const path of placement.paths) {
      assert(
        clearRoute(path, unrelated, 1.5),
        "Connector must avoid unrelated text, marks, and data lines",
      );
    }
    const target = base.targets.get(placement.targetIds[0])!;
    const end = placement.paths[0].at(-1)!;
    const aim = port(target.bounds, end, 0);
    assert(
      clearRoute([end, aim], unrelated.filter((o) => o.kind === "text"), 1.5),
      "No intervening tick label may obscure what the arrow points at",
    );
    for (const other of result.calloutPlacements) {
      if (other !== placement) {
        assert(!overlaps(inflate(box, 5), other.labelBounds!));
        for (const path of other.paths) {
          assert(clearRoute(path, [{ kind: "text", bounds: box }], 3));
        }
      }
    }
  }
  assert(result.svg.includes("Maximum height"));
  assert(result.svg.includes("The descent begins here"));
  assert(
    !result.calloutPlacements.find((p) => p.annotationIndex === 2)!.usedGutter,
    "A nearby diagonal note should not be forced into a remote gutter",
  );
  assert(
    result.calloutPlacements.find((p) => p.annotationIndex === 0)!.labelBounds!
      .y < base.targets.get("motion.peak.mark")!.bounds.y,
  );
});

Deno.test("visibility routing goes around a wall when direct and elbow paths are blocked", () => {
  const wall: RenderObstacle = {
    kind: "text",
    bounds: { x: 140, y: 40, width: 50, height: 120 },
  };
  const start = { x: 50, y: 100 }, end = { x: 280, y: 100 };
  assertEquals(routeConnector(start, end, [wall], [], 6), null);
  const route = routeConnector(start, end, [wall], [], 6, true)!;
  assert(route && route.length > 2);
  assertEquals(route[0], start);
  assertEquals(route.at(-1), end);
  assert(clearRoute(route, [wall], 6));
});

Deno.test("a crowded plot uses an outside gutter, with full untruncated text", () => {
  const scene: TargetedDrawing = {
    markup: "",
    bounds: { x: 0, y: 0, width: 500, height: 400 },
    focusBounds: { x: 0, y: 0, width: 500, height: 400 },
    targets: new Map([["scene.target.mark", {
      kind: "mark",
      bounds: { x: 246, y: 196, width: 8, height: 8 },
    }]]),
    obstacles: [
      { kind: "area", bounds: { x: 0, y: 0, width: 500, height: 400 } },
      {
        kind: "shape",
        ownerId: "scene.target.mark",
        bounds: { x: 246, y: 196, width: 8, height: 8 },
      },
    ],
  };
  const text =
    "AntidisestablishmentarianismABCDEFGHIJKLMNOPQRSTUVWXYZ\nA second explanatory line";
  const pending: PendingCallout[] = [{
    childId: "scene",
    annotationIndex: 0,
    annotation: {
      type: "arrow",
      targetIds: ["scene.target.mark"],
      content: text,
    },
  }];
  const result = renderCallouts(pending, scene, [], { id: "demo" });
  assert(result.placements[0].usedGutter);
  assert(!overlaps(scene.bounds!, result.placements[0].labelBounds!));
  const visible = [
    ...result.drawing.markup.matchAll(/<text[^>]*>([^<]*)<\/text>/g),
  ].map((m) => m[1]).join("");
  assertEquals(visible.replace(/\s/g, ""), text.replace(/\s/g, ""));
});

Deno.test("brackets support vertical groups, horizontal spans, and no message", () => {
  const pie = {
    type: "pie_chart" as const,
    id: "books",
    title: "Books",
    slices: [{ id: "a", label: "Fiction", value: 12 }, {
      id: "b",
      label: "Nonfiction",
      value: 6,
    }, { id: "c", label: "Poetry", value: 2 }],
    annotations: [{
      type: "bracket" as const,
      targetIds: ["books.b.legend-label", "books.c.legend-label"],
      content: "The remaining genres",
    }],
  };
  const vertical = renderWhiteboardSvg({ layout: "single", children: [pie] })
    .calloutPlacements[0];
  assert(["left", "right"].includes(vertical.side));
  const horizontal = renderWhiteboardSvg({
    layout: "single",
    children: [{
      ...chart,
      annotations: [{
        type: "bracket",
        targetIds: ["motion.start.mark", "motion.finish.mark"],
        content: null,
      }],
    }],
  });
  assert(["top", "bottom"].includes(horizontal.calloutPlacements[0].side));
  assertEquals(horizontal.calloutPlacements[0].labelBounds, null);
});

Deno.test("pie arrows use wedge boundaries and can also reach interior percentages", () => {
  const pie = {
    type: "pie_chart" as const,
    id: "pie",
    title: "Composition",
    slices: [{ id: "a", label: "Majority", value: 60 }, {
      id: "b",
      label: "Remainder",
      value: 40,
    }],
  };
  const base = renderCircularGraphDrawing(pie, { id: "test" });
  const result = renderWhiteboardSvg({
    layout: "single",
    children: [{
      ...pie,
      annotations: [
        { type: "arrow", targetIds: ["pie.a.mark"], content: "Largest share" },
        {
          type: "line",
          targetIds: ["pie.b.percentage"],
          content: "Two fifths",
        },
      ],
    }],
  });
  assertEquals(result.calloutPlacements.length, 2);
  const mark = result.calloutPlacements.find((p) => p.annotationIndex === 0)!;
  const anchor = base.targets.get("pie.a.mark")!.anchor!;
  const end = mark.paths[0].at(-1)!;
  assert(
    Math.abs(Math.hypot(end.x - anchor.point.x, end.y - anchor.point.y) - 9) <
      0.001,
  );
  const disk = base.obstacles.find((o) => o.circle)!;
  for (const p of result.calloutPlacements) {
    assert(!obstacleHitsBox(disk, p.labelBounds!, 5));
  }
});

Deno.test("expanded child extents never overlap in split or stack layouts", () => {
  const second = { ...chart, id: "second", annotations: [] };
  for (const layout of ["split", "stack"] as const) {
    const result = renderWhiteboardSvg({ layout, children: [chart, second] });
    const first = renderWhiteboardSvg({ layout: "single", children: [chart] });
    const next = renderWhiteboardSvg({ layout: "single", children: [second] });
    const a = {
      ...first.bounds,
      x: first.bounds.x + result.childPlacements[0].x,
      y: first.bounds.y + result.childPlacements[0].y,
    };
    const b = {
      ...next.bounds,
      x: next.bounds.x + result.childPlacements[1].x,
      y: next.bounds.y + result.childPlacements[1].y,
    };
    assert(!overlaps(inflate(a, 15), inflate(b, 15)));
  }
});

Deno.test("message XML is escaped and invalid references fail explicitly", () => {
  const result = renderWhiteboardSvg({
    layout: "single",
    children: [{
      ...chart,
      annotations: [{
        type: "line",
        targetIds: ["motion.peak.mark"],
        content: "<tag> & value",
      }],
    }],
  });
  assert(result.svg.includes("&lt;tag&gt; &amp; value"));
  assert(!result.svg.includes("<tag>"));
  assertThrows(
    () =>
      renderWhiteboardSvg({
        layout: "single",
        children: [{
          ...chart,
          annotations: [{
            type: "arrow",
            targetIds: ["missing.mark"],
            content: "Missing",
          }],
        }],
      }),
    Error,
    "Unknown or unavailable",
  );
});

if (import.meta.main) {
  const output = new URL("./output-ex/", import.meta.url);
  const examples: [string, WhiteboardSpec][] = [
    ["whiteboard-callouts-motion", { layout: "single", children: [chart] }],
    ["whiteboard-callouts-group", {
      layout: "single",
      children: [{
        ...chart,
        annotations: [{
          type: "bracket",
          targetIds: ["motion.start.mark", "motion.finish.mark"],
          content: "The complete journey",
        }, {
          type: "arrow",
          targetIds: ["motion.peak.mark"],
          content: "Highest point",
        }],
      }],
    }],
    ["whiteboard-callouts-split", {
      layout: "split",
      children: [chart, {
        ...chart,
        id: "comparison",
        title: "A second view",
        annotations: [{
          type: "line",
          targetIds: ["comparison.peak.mark"],
          content: "Compare the same maximum",
        }],
      }],
    }],
  ];
  await Deno.mkdir(output, { recursive: true });
  for (const [name, spec] of examples) {
    const started = performance.now();
    const result = renderWhiteboardSvg(spec);
    await Deno.writeTextFile(new URL(`${name}.svg`, output), result.svg);
    await Deno.writeTextFile(
      new URL(`${name}.json`, output),
      JSON.stringify({ spec, placements: result.calloutPlacements }, null, 2),
    );
    console.log(
      `${name}: ${(performance.now() - started).toFixed(1)}ms; ${
        result.calloutPlacements.map((p) =>
          `${p.type}:${p.side}${p.usedGutter ? ":gutter" : ""}`
        ).join(", ")
      }`,
    );
  }
}

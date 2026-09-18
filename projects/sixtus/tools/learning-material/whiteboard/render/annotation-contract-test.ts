import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertThrows,
} from "@std/assert";
import { whiteboardFigures } from "../figures/index.ts";
import type { WhiteboardFigureContent } from "../schema.ts";
import { boardExample } from "./board-example.ts";
import { renderWhiteboardSvg } from "./index.ts";
import { prepareFigure } from "./prepare.ts";
import { renderAnnotations, resolveAnnotations } from "./annotations.ts";
import type { Annotation, AnnotationType } from "./annotation-types.ts";
import { ANNOTATION_TYPES } from "../figures/shared.ts";
import { renderEmphasis } from "./emphasis.ts";
import { connectorObstacles } from "./callouts.ts";
import { clearRoute, obstacleHitsBox } from "./placement.ts";
import { renderGeometryDrawing } from "./geometry.ts";
import { renderCoordinatePlotDrawing } from "./coordinate-plot.ts";
import {
  allowContainerConnections,
  containerContains,
  type ContainerGeometry,
  registerTarget,
  type RenderObstacle,
  type RenderTarget,
  type ScenePart,
  type TargetedDrawing,
  transformTarget,
  validateTarget,
} from "./targets.ts";
import { type Bounds, unionBounds } from "./bounds.ts";

const options = { id: "test", figureId: "scene", roughness: 0, seed: 10 };
const mark = (bounds: Bounds): RenderTarget => ({
  kind: "mark",
  bounds,
  attachment: { type: "bounds" },
});
function scene(
  targets: Map<string, RenderTarget>,
  obstacles: RenderObstacle[] = [],
): TargetedDrawing {
  return {
    markup: "<g/>",
    targets,
    obstacles,
    bounds: unionBounds([...targets.values()].map((t) => t.bounds))!,
    focusBounds: { x: 0, y: 0, width: 400, height: 300 },
  };
}
function quiet<T>(run: () => T): { result: T; warnings: string[] } {
  const original = console.warn, warnings: string[] = [];
  console.warn = (message: string) => warnings.push(message);
  try {
    return { result: run(), warnings };
  } finally {
    console.warn = original;
  }
}
function containsBounds(outer: Bounds, inner: Bounds) {
  assert(
    inner.x >= outer.x - 0.01 && inner.y >= outer.y - 0.01 &&
      inner.x + inner.width <= outer.x + outer.width + 0.01 &&
      inner.y + inner.height <= outer.y + outer.height + 0.01,
  );
}

for (const definition of whiteboardFigures) {
  Deno.test(`shared annotation contract: ${definition.type}`, () => {
    const figure: WhiteboardFigureContent = {
      ...structuredClone(definition.example.output),
      title: "Annotation heading",
      annotations: [],
    };
    const prepared = prepareFigure(figure, { id: "whiteboard-figure-0" });
    assert(prepared.ok);
    const base = prepared.figure.base;
    const before = structuredClone(base);
    const title = `${figure.id}.title`;
    assert(base.targets.has(title));
    const textId = [...base.targets].find(([id, target]) =>
      id !== title && target.kind === "text"
    )?.[0] ?? title;
    const markId = [...base.targets].find(([, target]) =>
      target.kind === "mark"
    )?.[0];
    const text = (type: AnnotationType) =>
      type === "callout" ? "Explanation" : null;
    for (const type of ANNOTATION_TYPES) {
      const annotations: Annotation[] = [{
        type,
        targetIds: [textId],
        text: text(type),
      }];
      const spec = boardExample([{ ...figure, annotations }]);
      const result = quiet(() =>
        renderWhiteboardSvg(spec)
      ).result;
      assert(
        result.svg.includes(`data-annotation-type="${type}"`),
        `${definition.type}/${type}`,
      );
      assertEquals(result, quiet(() => renderWhiteboardSvg(spec)).result);
      assertEquals(spec, boardExample([{ ...figure, annotations }]));
      containsBounds(result.bounds, result.contentBounds);
      assert(result.stages.emphasis.svg.includes(base.markup));
      assert(result.stages.callouts.svg.includes(base.markup));
      assert(!result.svg.includes("NaN"));
    }
    // Short references resolve against this figure: `title` and the canonical form agree.
    for (const type of ANNOTATION_TYPES) {
      const render = (ref: string) =>
        quiet(() =>
          renderAnnotations([{ type, targetIds: [ref], text: text(type) }], base, {
            ...options,
            figureId: figure.id!,
          })
        ).result;
      const result = render("title");
      const markup = result.emphasis.markup + result.callouts.markup;
      assert(markup.includes(`data-annotation-type="${type}"`));
      assert(markup.includes(`data-target-id`));
      assertEquals(render(title), result);
    }
    if (markId) {
      for (const type of ANNOTATION_TYPES) {
        const result = quiet(() =>
          renderAnnotations(
            [{ type, targetIds: [markId], text: text(type) }],
            base,
            options,
          )
        ).result;
        const markup = result.emphasis.markup + result.callouts.markup;
        assert(markup.includes(`data-annotation-type="${type}"`));
        // Marks are chosen from the target: callouts to marks point with arrows;
        // striking out a mark draws a cross rather than a text strikethrough.
        if (type === "callout") {
          assert(markup.includes(`data-annotation-mark="arrow"`));
        }
        if (type === "strikeout") {
          assert(markup.includes(`data-annotation-mark="cross"`));
        }
      }
    }
    assertThrows(
      () =>
        renderAnnotations(
          [{ type: "highlight", targetIds: ["missing"], text: null }],
          base,
          options,
        ),
      Error,
      "Unknown or unavailable",
    );
    assertEquals(base, before);
  });
}

Deno.test("registration validates complete geometry and never derives attachment from obstacles", () => {
  const targets = new Map<string, RenderTarget>();
  const bounds = { x: 0, y: 0, width: 30, height: 20 };
  const drawing = {
    markup: "<path/>",
    bounds,
    obstacles: [{
      bounds,
      kind: "stroke" as const,
      segment: { a: { x: 0, y: 0 }, b: { x: 30, y: 20 } },
    }],
  };
  registerTarget({ targets, id: "mark", drawing, kind: "mark" });
  assertEquals(targets.get("mark")!.attachment, { type: "bounds" });
  assertThrows(
    () => registerTarget({ targets, id: "mark", drawing, kind: "mark" }),
    Error,
    "Duplicate",
  );
  assertThrows(
    () =>
      registerTarget({
        targets,
        id: "bad",
        drawing,
        kind: "mark",
        attachment: {
          type: "anchor",
          point: { x: 0, y: 0 },
          direction: { x: 0, y: 0 },
        },
      }),
    Error,
    "Invalid",
  );
  assertThrows(
    () => validateTarget(mark({ ...bounds, x: NaN }), "bad"),
    Error,
    "Invalid",
  );
  assertThrows(
    () =>
      registerTarget({
        targets,
        id: "empty",
        drawing,
        kind: "mark",
        attachment: { type: "segments", segments: [] },
      }),
    Error,
    "Invalid",
  );
  assert(!targets.has("bad") && !targets.has("empty"));
});

Deno.test("transforming targets moves every attachment and rotated decoration without mutation", () => {
  const targets = new Map<string, RenderTarget>();
  registerTarget({
    targets,
    id: "label",
    drawing: { markup: "", bounds: { x: 10, y: 20, width: 12, height: 40 } },
    kind: "text",
    textRotation: -90,
  });
  const original = targets.get("label")!, copy = structuredClone(original);
  const transformed = transformTarget(original, { x: 100, y: -20, scale: 2 });
  assert(transformed.kind === "text");
  assertEquals(transformed.decorations.underline, {
    a: { x: 150, y: 20 },
    b: { x: 150, y: 100 },
  });
  assertEquals(transformed.decorations.strikethrough, {
    a: { x: 132, y: 20 },
    b: { x: 132, y: 100 },
  });
  const anchored: RenderTarget = {
    ...mark({ x: 0, y: 0, width: 10, height: 10 }),
    attachment: {
      type: "anchor",
      point: { x: 5, y: 5 },
      direction: { x: 1, y: 0 },
    },
  };
  assertEquals(transformTarget(anchored, { x: 4, y: 6, scale: 3 }).attachment, {
    type: "anchor",
    point: { x: 19, y: 21 },
    direction: { x: 1, y: 0 },
  });
  assertEquals(original, copy);
});

Deno.test("strict container geometry excludes boundaries, ellipse corners, and concave cutouts", () => {
  const rectangle: ContainerGeometry = {
    type: "rectangle",
    bounds: { x: 0, y: 0, width: 100, height: 100 },
  };
  const ellipse: ContainerGeometry = {
    type: "ellipse",
    cx: 50,
    cy: 50,
    rx: 50,
    ry: 50,
  };
  const polygon: ContainerGeometry = {
    type: "polygon",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 30 },
      { x: 30, y: 30 },
      { x: 30, y: 100 },
      { x: 0, y: 100 },
    ],
  };
  for (const geometry of [rectangle, ellipse, polygon]) {
    assert(!containerContains(geometry, { x: 0, y: 50 }));
  }
  assert(containerContains(rectangle, { x: 90, y: 90 }));
  assert(!containerContains(ellipse, { x: 90, y: 90 }));
  assert(!containerContains(polygon, { x: 50, y: 50 }));
  assert(containerContains(polygon, { x: 20, y: 50 }));
  assert(!containerContains(polygon, { x: 30, y: 50 }));
});

Deno.test("nested container permissions apply only to their own obstacles and never to labels", () => {
  const targets = new Map<string, RenderTarget>([[
    "inside",
    mark({ x: 48, y: 48, width: 4, height: 4 }),
  ], ["corner", mark({ x: 88, y: 88, width: 4, height: 4 })]]);
  const outer: ScenePart = {
    markup: "",
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    targetId: "outer",
    container: {
      type: "rectangle",
      bounds: { x: 0, y: 0, width: 100, height: 100 },
    },
  };
  const inner: ScenePart = {
    markup: "",
    bounds: { x: 20, y: 20, width: 60, height: 60 },
    targetId: "inner",
    container: { type: "ellipse", cx: 50, cy: 50, rx: 30, ry: 30 },
  };
  const obstacles: RenderObstacle[] = [
    { kind: "shape", bounds: outer.bounds!, ownerId: "outer" },
    { kind: "shape", bounds: inner.bounds!, ownerId: "inner" },
    {
      kind: "text",
      bounds: { x: 40, y: 40, width: 20, height: 20 },
      ownerId: "label",
    },
    {
      kind: "stroke",
      bounds: outer.bounds!,
      ownerId: "open-path",
      segment: { a: { x: 0, y: 0 }, b: { x: 100, y: 100 } },
    },
  ];
  const permitted = allowContainerConnections(targets, obstacles, [
    outer,
    inner,
  ]);
  assertEquals(permitted[0].connectorPassThroughFor, ["inside", "corner"]);
  assertEquals(permitted[1].connectorPassThroughFor, ["inside"]);
  assertEquals(
    connectorObstacles(permitted, ["inside"]).map((o) => o.ownerId),
    ["label", "open-path"],
  );
  assert(
    permitted.every((o) =>
      obstacleHitsBox(o, { x: 48, y: 48, width: 4, height: 4 })
    ),
  );
  assert(
    !clearRoute(
      [{ x: 35, y: 50 }, { x: 65, y: 50 }],
      connectorObstacles(permitted, ["inside"]),
      1,
    ),
  );
  assertEquals(obstacles[0].connectorPassThroughFor, undefined);
});

Deno.test("figure renderers declare actual containers and retain visible circle attachments", () => {
  const coordinate = renderCoordinatePlotDrawing({
    type: "coordinate_plot",
    id: "plot",
    title: null,
    axes: { x: { min: -3, max: 3 }, y: { min: -3, max: 3 } },
    elements: [{ type: "circle", id: "ring", center: [0, 0], radius: 2 }, {
      type: "point",
      id: "inside",
      position: [0, 0],
    }, {
      type: "line",
      id: "open",
      from: [-2, -2],
      to: [2, 2],
      extend: "neither",
    }],
  }, { id: "test" });
  assert(
    coordinate.obstacles.filter((o) => o.ownerId === "plot.ring.mark").every(
      (o) => o.connectorPassThroughFor?.includes("plot.inside.mark"),
    ),
  );
  assert(
    coordinate.obstacles.filter((o) => o.ownerId === "plot.open.mark").every(
      (o) => !o.connectorPassThroughFor,
    ),
  );
  const ring = coordinate.targets.get("plot.ring.mark")!;
  assert(ring.attachment.type === "segments");
  const center = {
    x: ring.bounds.x + ring.bounds.width / 2,
    y: ring.bounds.y + ring.bounds.height / 2,
  };
  const first = ring.attachment.segments[0].a;
  assertAlmostEquals(first.y, center.y, 0.01);
  assert(first.x > center.x);
  const geometry = renderGeometryDrawing({
    type: "geometry",
    id: "geometry",
    title: null,
    points: [
      { kind: "position", id: "a", at: [0, 0] },
      { kind: "position", id: "b", at: [4, 0] },
      { kind: "position", id: "c", at: [0, 4] },
      { kind: "position", id: "inside", at: [1, 1] },
      { kind: "position", id: "outside", at: [3, 3] },
    ],
    objects: [{ kind: "polygon", id: "triangle", points: ["a", "b", "c"] }],
    labels: [],
    markings: [],
  }, { id: "test" });
  const permissions = geometry.obstacles.find((o) =>
    o.ownerId === "geometry.triangle.mark"
  )!.connectorPassThroughFor!;
  assert(permissions.includes("geometry.inside.mark"));
  assert(!permissions.includes("geometry.outside.mark"));
});

Deno.test("emphasis boundaries accumulate per target while numbers reserve independent space", () => {
  const targets = new Map([[
    "target",
    mark({ x: 100, y: 100, width: 20, height: 20 }),
  ]]);
  const input: Annotation[] = [
    { type: "highlight", targetIds: ["target"], text: null },
    { type: "highlight", targetIds: ["target"], text: null },
    { type: "number", targetIds: ["target"], text: null },
  ];
  const requests = resolveAnnotations(input, targets, "scene");
  assertEquals(requests.map((r) => r.type), ["circle", "circle", "number"]);
  assertEquals(requests[2].text, "1");
  const emphasis = renderEmphasis(
    requests.filter((r) =>
      r.type === "circle" || r.type === "box" || r.type === "number"
    ),
    options,
  );
  assertEquals(emphasis.attachmentBounds.size, 1);
  for (const obstacle of emphasis.obstacles.filter((o) => o.ownerId)) {
    containsBounds(emphasis.attachmentBounds.get("target")!, obstacle.bounds);
  }
  assertEquals(emphasis.obstacles[2].ownerId, undefined);
  const number = renderEmphasis(
    requests.filter((r) => r.type === "number"),
    options,
  );
  assertEquals(number.attachmentBounds.size, 0);
  const result = renderAnnotations(
    [
      ...input,
      { type: "callout", targetIds: ["target"], text: "Explanation" },
    ],
    scene(targets),
    options,
  );
  assertEquals(result.diagnostics, []);
  const tip = result.placements[0].paths[0].at(-1)!;
  const boundary = emphasis.attachmentBounds.get("target")!;
  assert(
    !obstacleHitsBox({ kind: "shape", bounds: boundary }, {
      x: tip.x,
      y: tip.y,
      width: 0.01,
      height: 0.01,
    }),
  );
});

Deno.test("bracket geometry is invariant under group target order, including fixed anchors", () => {
  const targets = new Map<string, RenderTarget>([
    ["a", {
      ...mark({ x: 20, y: 20, width: 10, height: 10 }),
      attachment: {
        type: "anchor",
        point: { x: 20, y: 20 },
        direction: { x: 0, y: -1 },
      },
    }],
    ["b", mark({ x: 100, y: 160, width: 10, height: 10 })],
    ["c", mark({ x: 200, y: 60, width: 10, height: 10 })],
  ]);
  const render = (targetIds: string[]) =>
    renderAnnotations(
      [{ type: "group", targetIds, text: "Group" }],
      scene(targets),
      options,
    ).placements[0];
  const first = render(["a", "b", "c"]);
  for (const order of [["a", "c", "b"], ["b", "a", "c"], ["c", "b", "a"]]) {
    const result = render(order);
    assertEquals(result.paths, first.paths);
    assertEquals(result.labelBounds, first.labelBounds);
    assertEquals(result.side, first.side);
  }
});

Deno.test("blocked routes report best-effort fallback and numerically unusable routes are skipped", () => {
  const target = mark({ x: 196, y: 146, width: 8, height: 8 });
  const input: Annotation[] = [{
    type: "callout",
    targetIds: ["target"],
    text: "Explain <this>",
  }];
  const blocked = scene(new Map([["target", target]]), [{
    kind: "text",
    bounds: { x: 150, y: 100, width: 100, height: 100 },
    ownerId: "unrelated",
  }]);
  const { result } = quiet(() => renderAnnotations(input, blocked, options));
  assertEquals(result.placements.length, 1);
  assertEquals(result.diagnostics.map((d) => d.code), ["overlap-fallback"]);
  assert(result.diagnostics[0].message.includes("using a fallback placement"));
  assert(result.callouts.markup.includes("&lt;this&gt;"));
  assertEquals(
    result,
    quiet(() => renderAnnotations(input, blocked, options)).result,
  );
  const huge = scene(
    new Map([["target", mark({ x: 1e308, y: 1e308, width: 0, height: 0 })]]),
  );
  const skipped = quiet(() => renderAnnotations(input, huge, options)).result;
  assertEquals(skipped.placements, []);
  assertEquals(skipped.diagnostics.map((d) => d.code), ["unplaceable"]);
  assertEquals(skipped.callouts.markup, "");
});

Deno.test("multiple callouts to one emphasized target reserve each other's labels and arrowheads", () => {
  const target = mark({ x: 196, y: 146, width: 8, height: 8 });
  const base = scene(new Map([["target", target]]), [{
    kind: "shape",
    ownerId: "target",
    bounds: target.bounds,
  }]);
  const result = renderAnnotations(
    [
      { type: "highlight", targetIds: ["target"], text: null },
      { type: "callout", targetIds: ["target"], text: "First explanation" },
      { type: "callout", targetIds: ["target"], text: "Second explanation" },
      { type: "callout", targetIds: ["target"], text: "Third explanation" },
    ],
    base,
    options,
  );
  assertEquals(result.diagnostics, []);
  assertEquals(result.placements.length, 3);
  for (const placement of result.placements) {
    const label = placement.labelBounds!;
    for (const other of result.placements) {
      if (other === placement) continue;
      assert(
        !obstacleHitsBox(
          { kind: "text", bounds: label },
          other.labelBounds!,
          5,
        ),
      );
      for (const path of other.paths) {
        assert(clearRoute(path, [{ kind: "text", bounds: label }], 3));
      }
    }
  }
});

Deno.test("board rendering exposes structured fallback diagnostics with stable annotation identity", () => {
  const figure: WhiteboardFigureContent = {
    type: "math_expressions",
    id: "blocked",
    title: null,
    expressions: [{ id: "answer", latex: "x=8" }],
    annotations: Array.from({ length: 12 }, (_, i) => ({
      type: "callout" as const,
      targetIds: ["answer"],
      text:
        `Explain this result in detail with extra words so labels collide ${i + 1}`,
    })),
  };
  const result = renderWhiteboardSvg(boardExample([figure]), {
    width: 160,
    height: 140,
  });
  const diagnostic = result.annotationDiagnostics.find((issue) =>
    issue.code === "overlap-fallback"
  );
  assert(diagnostic, "expected a crowded board to fall back");
  assertEquals(diagnostic.figureId, "blocked");
  assertEquals(diagnostic.targetIds, ["blocked.answer.expression"]);
  assert(typeof diagnostic.annotationIndex === "number");
  assert(diagnostic.message.includes("fallback"));
  assertEquals(
    result.calloutPlacements[diagnostic.annotationIndex]?.targetIds,
    ["blocked.answer.expression"],
  );
});

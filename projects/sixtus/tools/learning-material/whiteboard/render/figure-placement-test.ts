import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertThrows,
} from "@std/assert";
import { z } from "@zod";
import { WhiteboardOutput, type WhiteboardSpec } from "../schema.ts";
import { type Bounds, type Drawing } from "./bounds.ts";
import { figureAllocation, placeFigures } from "./figure-placement.ts";

type Side = NonNullable<WhiteboardSpec["figures"][number]["side"]>;
const figure = (
  id: string,
  anchor: string | null = null,
  side: Side | null = null,
) => ({
  type: "math_expressions" as const,
  id,
  anchor,
  side,
  title: id,
  annotations: [],
  expressions: [{ id: "value", latex: "x=1" }],
});
const drawing = (bounds: Bounds): Drawing => ({ markup: "", bounds });
const boardBounds = (spec: WhiteboardSpec, drawings: Drawing[], gap = 32) =>
  placeFigures(spec, drawings, { gap }).map((p, i) => ({
    ...drawings[i].bounds!,
    x: drawings[i].bounds!.x + p.x,
    y: drawings[i].bounds!.y + p.y,
  }));
const separated = (a: Bounds, b: Bounds, gap: number) =>
  a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x ||
  a.y + a.height + gap <= b.y || b.y + b.height + gap <= a.y;

Deno.test("measured bounds with negative local offsets anchor and center on every side", () => {
  const drawings = [
    drawing({ x: -45, y: -30, width: 300, height: 180 }),
    drawing({ x: -90, y: 15, width: 120, height: 70 }),
  ];
  for (const side of ["top", "left", "right", "bottom"] as const) {
    const spec = {
      title: null,
      figures: [figure("root"), figure("detail", "root", side)],
    };
    const [a, b] = boardBounds(spec, drawings);
    assertEquals(a, drawings[0].bounds);
    if (side === "top" || side === "bottom") {
      assertAlmostEquals(b.x + b.width / 2, a.x + a.width / 2);
      assertEquals(
        side === "top" ? a.y - b.y - b.height : b.y - a.y - a.height,
        32,
      );
    } else {
      assertAlmostEquals(b.y + b.height / 2, a.y + a.height / 2);
      assertEquals(
        side === "left" ? a.x - b.x - b.width : b.x - a.x - a.width,
        32,
      );
    }
  }
});

Deno.test("cousin collisions move later figures along their side and descendants follow", () => {
  const spec = {
    title: null,
    figures: [
      figure("a"),
      figure("b", "a", "right"),
      figure("c", "a", "bottom"),
      figure("d", "b", "bottom"),
      figure("e", "d", "right"),
    ],
  };
  const drawings = [100, 100, 400, 100, 100].map((width) =>
    drawing({ x: -10, y: -20, width, height: 100 })
  );
  const before = JSON.stringify({ spec, drawings });
  const boxes = boardBounds(spec, drawings, 20);
  assertEquals(boxes[3].x, boxes[1].x);
  assertEquals(boxes[3].y, boxes[2].y + boxes[2].height + 20);
  assertEquals(boxes[4].x, boxes[3].x + boxes[3].width + 20);
  assertEquals(boxes[4].y, boxes[3].y);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < i; j++) assert(separated(boxes[i], boxes[j], 20));
  }
  assertEquals(JSON.stringify({ spec, drawings }), before);
  assertEquals(boardBounds(spec, drawings, 20), boxes);
});

Deno.test("repeated siblings clear all earlier figures in every direction, including zero gap", () => {
  for (const side of ["top", "left", "right", "bottom"] as const) {
    for (const gap of [0, 32]) {
      const spec = {
        title: null,
        figures: [
          figure("a"),
          ...["b", "c", "d"].map((id) => figure(id, "a", side)),
        ],
      };
      const drawings = spec.figures.map(() =>
        drawing({ x: 10, y: -20, width: 100, height: 100 })
      );
      const boxes = boardBounds(spec, drawings, gap);
      for (let i = 1; i < boxes.length; i++) {
        for (let j = 0; j < i; j++) assert(separated(boxes[i], boxes[j], gap));
      }
    }
  }
});

Deno.test("placement validation rejects extra roots, invalid sides, and non-earlier anchors", () => {
  const root = figure("a");
  const valid = {
    title: null,
    figures: [root, figure("b", "a", "right"), figure("c", "a", "bottom")],
  };
  assert(WhiteboardOutput.safeParse(valid).success);
  for (
    const invalid of [
      { title: null, figures: [] },
      { title: null, figures: [figure("a", "b", "right")] },
      { title: null, figures: [figure("a", null, "right")] },
      { title: null, figures: [root, figure("b")] },
      { title: null, figures: [root, figure("b", "a", null)] },
      { title: null, figures: [root, figure("b", "missing", "right")] },
      { title: null, figures: [root, figure("b", "b", "right")] },
      {
        title: null,
        figures: [root, figure("b", "c", "right"), figure("c", "a", "bottom")],
      },
      { title: null, figures: [root, figure("a", "a", "right")] },
      {
        title: null,
        figures: [root, { ...figure("b", "a", "right"), side: "diagonal" }],
      },
      { figures: [root] },
    ]
  ) {
    assert(
      !WhiteboardOutput.safeParse(invalid).success,
      JSON.stringify(invalid),
    );
  }
});

Deno.test("structured output keeps placement flat in anyOf figure branches", () => {
  const schema = z.toJSONSchema(WhiteboardOutput) as unknown as {
    properties: {
      title: unknown;
      figures: {
        items: {
          anyOf: { properties: Record<string, unknown>; required: string[] }[];
        };
      };
    };
    required: string[];
  };
  assert("title" in schema.properties);
  assert(schema.required.includes("title"));
  for (const branch of schema.properties.figures.items.anyOf) {
    for (const field of ["id", "anchor", "side"]) {
      assert(field in branch.properties);
      assert(branch.required.includes(field));
    }
    for (const field of ["layout", "align", "size", "gap"]) {
      assert(!(field in branch.properties));
    }
  }
});

Deno.test("allocation is per figure and rejects invalid renderer options", () => {
  assertEquals(figureAllocation(), { width: 800, height: 520, gap: 32 });
  assertEquals(figureAllocation({ width: 900, height: 600, gap: 0 }), {
    width: 900,
    height: 600,
    gap: 0,
  });
  for (
    const options of [
      { width: 0 },
      { height: -1 },
      { width: NaN },
      { gap: -1 },
      { gap: Infinity },
    ]
  ) {
    assertThrows(() => figureAllocation(options), Error, "finite positive");
  }
});

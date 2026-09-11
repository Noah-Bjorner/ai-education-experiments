import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertThrows,
} from "@std/assert";
import {
  type Freeform,
  freeform,
  type FreeformElement,
  freeformSchema,
} from "../children/freeform.ts";
import { WhiteboardOutput } from "../schema.ts";
import { WHITEBOARD_SPEC_SYSTEM_PROMPT } from "../prompt.ts";
import { renderFreeformDrawing, wrapFreeformText } from "./freeform.ts";
import { freeformExamples } from "./freeform-examples.ts";
import { renderWhiteboardSvg } from "./index.ts";
import { SERIES_COLORS } from "./theme.ts";
import { xyChart } from "../children/xy-chart.ts";
const spec = (elements: FreeformElement[]): Freeform => ({
  type: "freeform",
  id: "test",
  title: "Freeform test",
  annotations: [],
  elements,
});
const box: FreeformElement = {
  id: "box",
  type: "rectangle",
  x: 240,
  y: 180,
  width: 120,
  height: 80,
};
const label: FreeformElement = {
  id: "label",
  type: "text",
  content: "Label",
  position: { x: 32, y: 32 },
  width: 100,
  align: "left",
  size: "normal",
};
const draw = (s: Freeform) => renderFreeformDrawing(s, { id: "test-render" });
const captureWarnings = (fn: () => void): string[] => {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) =>
    warnings.push(args.map(String).join(" "));
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return warnings;
};

Deno.test("freeform registers schema, instructions, and example", () => {
  WhiteboardOutput.parse({
    layout: "single",
    children: [freeform.example.output],
  });
  assert(WHITEBOARD_SPEC_SYSTEM_PROMPT.includes("## freeform"));
  assert(WHITEBOARD_SPEC_SYSTEM_PROMPT.includes('"Sending a message"'));
  assert(
    WHITEBOARD_SPEC_SYSTEM_PROMPT.includes(
      "Omit color so the base scene draws in ink; teaching annotations use accent-1",
    ),
  );
  for (
    const elements of [
      [],
      [box, box],
      [{ ...box, width: 0 }],
      [{ ...box, x: Infinity }],
      [{ ...box, script: "bad" }],
      [{ ...label, content: " " }],
      [{
        id: "line",
        type: "line",
        from: { x: 10, y: 10 },
        to: { x: 10, y: 10 },
      }],
    ]
  ) assert(!freeformSchema.safeParse({ ...spec([]), elements }).success);
  assert(!freeformSchema.safeParse({ ...spec([box]), svg: "<svg/>" }).success);
  assert(
    !freeformSchema.safeParse(
      spec(Array.from({ length: 129 }, (_, i) => ({ ...box, id: `box-${i}` }))),
    ).success,
  );
});
Deno.test("freeform validates attachments and resolves forward references", () => {
  const arrow: FreeformElement = {
    id: "arrow",
    type: "arrow",
    from: { x: 100, y: 220 },
    to: { target: "box" },
  };
  const d = draw(spec([arrow, box]));
  const outline = d.targets.get("test.arrow.mark")!.outline!;
  assertAlmostEquals(outline[0].b.x, 240);
  assertAlmostEquals(outline[0].b.y, 284);
  assertThrows(
    () => draw(spec([{ ...arrow, to: { target: "missing" } }, box])),
    Error,
    "missing",
  );
  assertThrows(
    () => draw(spec([{ ...arrow, to: { target: "label" } }, label])),
    Error,
    "label",
  );
  const reversed = captureWarnings(() =>
    draw(spec([{ ...arrow, from: { target: "box" } }, box]))
  );
  assert(reversed.some((w) => w.includes("arrow")));
  assertThrows(
    () =>
      draw(spec([{ ...label, position: { target: "missing", side: "top" } }])),
    Error,
    "missing",
  );
});
Deno.test("freeform renders examples deterministically with bounded semantic targets", () => {
  for (const s of freeformExamples) {
    const original = structuredClone(s), d = draw(s);
    assertEquals(draw(s), d);
    assertEquals(s, original);
    assert(!/NaN|Infinity|undefined/.test(d.markup));
    assertEquals(d.targets.size, s.elements.length + 1);
    for (const [id, t] of d.targets) {
      assert(d.markup.includes(`id="${id}"`));
      assert(t.bounds.x >= d.bounds!.x - 1e-8);
      assert(t.bounds.y >= d.bounds!.y - 1e-8);
      assert(
        t.bounds.x + t.bounds.width <= d.bounds!.x + d.bounds!.width + 1e-8,
      );
      assert(
        t.bounds.y + t.bounds.height <= d.bounds!.y + d.bounds!.height + 1e-8,
      );
    }
    renderWhiteboardSvg({ layout: "single", children: [s] });
  }
});
Deno.test("freeform wraps without losing content, preserves newlines and escapes XML", () => {
  const text = "A longunbrokenword and more\n\nLast";
  assertEquals(
    wrapFreeformText(text, 22, 64).join(""),
    text.replaceAll("\n", ""),
  );
  assert(wrapFreeformText(text, 22, 64).includes(""));
  assertThrows(() => wrapFreeformText("W", 22, 1), Error, "glyph");
  const d = draw(spec([{ ...label, content: 'A < B & "C"', width: 240 }]));
  assert(d.markup.includes("A &lt; B &amp; &quot;C&quot;"));
});
Deno.test("freeform supports four label sides and uniform scaling", () => {
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const s = spec([box, { ...label, position: { target: "box", side } }]);
    const d = draw(s),
      b = d.targets.get("test.box.mark")!.bounds,
      t = d.targets.get("test.label.label")!.bounds;
    if (side === "top") assert(t.y + t.height < b.y);
    if (side === "bottom") assert(t.y > b.y + b.height);
    if (side === "left") assert(t.x + t.width < b.x);
    if (side === "right") assert(t.x > b.x + b.width);
  }
  const s = spec([{
    id: "circle",
    type: "ellipse",
    x: 200,
    y: 200,
    rx: 40,
    ry: 40,
  }]);
  const t = renderFreeformDrawing(s, { id: "scaled", width: 640, height: 480 })
    .targets.get("test.circle.mark")!;
  assertAlmostEquals(t.bounds.width, t.bounds.height);
  const tiny = captureWarnings(() =>
    renderFreeformDrawing(spec([label]), {
      id: "small",
      width: 200,
      height: 200,
    })
  );
  assert(tiny.some((w) => w.includes("14 units")));
});
Deno.test("freeform warns on collisions, skips damaged elements, and allows containment", () => {
  const emoji = captureWarnings(() =>
    draw(spec([{ ...label, content: "🙂" }]))
  );
  assert(emoji.some((w) => w.includes("Freeform 'test'")));
  const stacked = captureWarnings(() =>
    draw(spec([label, { ...label, id: "duplicate-text" }]))
  );
  assert(stacked.some((w) => w.includes("overlaps")));
  const crossed = captureWarnings(() =>
    draw(spec([label, {
      id: "cross",
      type: "line",
      from: { x: 20, y: 45 },
      to: { x: 200, y: 45 },
    }]))
  );
  assert(crossed.some((w) => w.includes("cross")));
  const oversized = captureWarnings(() =>
    draw(spec([box, {
      id: "offside-line",
      type: "line",
      from: { x: 560, y: 30 },
      to: { x: 560, y: 50_000 },
    }]))
  );
  assert(oversized.some((w) => w.includes("offside-line")));
  assert(oversized.some((w) => w.includes("too large")));
  const allowed = captureWarnings(() => {
    draw(spec([{ ...box, x: 20, y: 20, width: 300, height: 180 }, label]));
    draw(spec([box, { ...box, id: "overlap", x: 260 }]));
    draw(spec([
      { id: "field", type: "rectangle", x: 24, y: 16, width: 752, height: 400 },
      {
        ...label,
        id: "offside-line-lbl",
        content: "Offside line",
        position: { x: 400, y: 16 },
        width: 160,
        align: "center",
      },
    ]));
  });
  assertEquals(allowed, []);
});
Deno.test("freeform includes content that extends the 800 × 440 scene", () => {
  const caption = draw(spec([{
    ...label,
    content: "A caption that wraps onto another line",
    position: { x: 40, y: 420 },
    width: 240,
  }]));
  assert(caption.bounds!.y + caption.bounds!.height > 64 + 440);
  const edge = draw(spec([{ ...box, x: 0 }, {
    ...label,
    id: "side",
    position: { x: 780, y: 32 },
  }]));
  assert(edge.bounds!.x + edge.bounds!.width > 800);
  const above = draw(spec([
    { ...box, y: 0 },
    { ...label, position: { target: "box", side: "top" } },
  ]));
  const title = above.targets.get("test.title")!;
  const text = above.targets.get("test.label.label")!;
  assert(text.bounds.y >= 64 - 1e-8);
  assert(text.bounds.y >= title.bounds.y + title.bounds.height);
});
Deno.test("freeform elliptical and marker attachments meet their actual outlines", () => {
  for (
    const shape of [
      { id: "shape", type: "ellipse", x: 400, y: 200, rx: 80, ry: 40 },
      { id: "shape", type: "marker", variant: "o", x: 400, y: 200, radius: 20 },
      {
        id: "shape",
        type: "marker",
        variant: "dot",
        x: 400,
        y: 200,
        radius: 20,
      },
      { id: "shape", type: "marker", variant: "x", x: 400, y: 200, radius: 20 },
    ] as FreeformElement[]
  ) {
    const d = draw(
      spec([{
        id: "arrow",
        type: "arrow",
        from: { x: 200, y: 200 },
        to: { target: "shape" },
      }, shape]),
    );
    const b = d.targets.get("test.arrow.mark")!.outline![0].b;
    assertAlmostEquals(b.y, 264);
    assertAlmostEquals(
      b.x,
      shape.type === "ellipse"
        ? 320
        : shape.type === "marker" && shape.variant === "x"
        ? 400 - Math.SQRT2
        : 380,
    );
  }
});
Deno.test("freeform annotations use the first accent against an ink diagram", () => {
  const s = structuredClone(freeform.example.output) as Freeform;
  s.annotations = [{
    type: "circle",
    targetIds: ["message.sender.mark"],
    content: null,
  }];
  const result = renderWhiteboardSvg({ layout: "single", children: [s] });
  assert(result.stages.emphasis.svg.includes(SERIES_COLORS[0]));
  assert(!result.stages.base.svg.includes(SERIES_COLORS[0]));
});

Deno.test("freeform composes with charts and shared annotations without duplicate SVG IDs", () => {
  const s = structuredClone(freeform.example.output) as Freeform;
  s.annotations = [{
    type: "circle",
    targetIds: ["message.sender.mark"],
    content: null,
  }, {
    type: "underline",
    targetIds: ["message.sender-label.label"],
    content: null,
  }];
  for (const layout of ["split", "stack"] as const) {
    const result = renderWhiteboardSvg({
      layout,
      children: [s, xyChart.example.output],
    });
    assert(result.stages.emphasis.svg.length > result.stages.base.svg.length);
    assertEquals(result.childPlacements.length, 2);
  }
  const first = structuredClone(freeformExamples[2]);
  first.annotations = [];
  const second = structuredClone(first);
  second.id = "other";
  const result = renderWhiteboardSvg({
    layout: "split",
    children: [first, second],
  });
  const ids = [...result.svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assertEquals(new Set(ids).size, ids.length);
});

Deno.test("freeform skips large filled shapes before generating hatch strokes", () => {
  const boxWarning = captureWarnings(() =>
    draw(spec([{ ...box, width: 1e300, fill: true }]))
  );
  assert(boxWarning.some((w) => w.includes("box")));
  const ellipseWarning = captureWarnings(() =>
    draw(spec([{
      id: "huge",
      type: "ellipse",
      x: 400,
      y: 220,
      rx: 1e300,
      ry: 100,
      fill: true,
    }]))
  );
  assert(ellipseWarning.some((w) => w.includes("huge")));
});

Deno.test("freeform validates options, titles, gaps and diagonal ellipse endpoints", () => {
  for (
    const options of [{ width: NaN }, { height: 0 }, { roughness: -1 }, {
      hatchGap: 0,
    }]
  ) {
  assertThrows(
    () => renderFreeformDrawing(spec([box]), { id: "invalid", ...options }),
      Error,
      "options",
    );
  }
  const longTitle = captureWarnings(() =>
    draw({ ...spec([box]), title: "Too long ".repeat(100) })
  );
  assert(longTitle.some((w) => w.includes("title")));
  const d = draw(
    spec([box, {
      ...label,
      position: { target: "box", side: "bottom", gap: 24 },
    }]),
  );
  assert(
    d.targets.get("test.label.label")!.bounds.y >
      d.targets.get("test.box.mark")!.bounds.y + 80 + 24,
  );
  assert(
    !freeformSchema.safeParse(
      spec([box, {
        ...label,
        position: { target: "box", side: "bottom", gap: -1 },
      }]),
    ).success,
  );
  const ellipse: FreeformElement = {
    id: "ellipse",
    type: "ellipse",
    x: 400,
    y: 220,
    rx: 100,
    ry: 50,
  };
  const diagonal = draw(
    spec([ellipse, {
      id: "diagonal",
      type: "arrow",
      from: { target: "ellipse" },
      to: { x: 680, y: 360 },
    }]),
  );
  const a = diagonal.targets.get("test.diagonal.mark")!.outline![0].a;
  assertAlmostEquals(
    ((a.x - 400) / 100) ** 2 + ((a.y - 64 - 220) / 50) ** 2,
    1,
  );
});

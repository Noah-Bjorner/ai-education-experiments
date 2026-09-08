import { hatchIntervals, hatchStrokes } from "./hatching.ts";

const circle = { type: "circle", cx: 0, cy: 0, r: 10 } as const;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}
function near(a: number, b: number) {
  assert(Math.abs(a - b) < 1e-7, `Expected ${a} to equal ${b}`);
}
function randomSource() {
  let seed = 17;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

Deno.test("hatch intersections handle circles, tangencies, and parallel rectangle edges", () => {
  const chord = hatchIntervals(circle, { x: 0, y: 6 }, { x: 1, y: 0 });
  near(chord[0][0], -8);
  near(chord[0][1], 8);
  assert(
    hatchIntervals(circle, { x: 0, y: 10 }, { x: 1, y: 0 }).length === 0,
    "A tangent must not produce a zero-length stroke",
  );
  const rect = {
    type: "rectangle",
    x: 10,
    y: 20,
    width: 30,
    height: 40,
  } as const;
  const horizontal = hatchIntervals(rect, { x: 0, y: 30 }, { x: 1, y: 0 });
  near(horizontal[0][0], 10);
  near(horizontal[0][1], 40);
  assert(
    hatchIntervals(rect, { x: 0, y: 19 }, { x: 1, y: 0 }).length === 0,
    "Do not emit lines outside a rectangle",
  );
});

Deno.test("major pie slices split strokes around their missing wedge", () => {
  const pieces = hatchIntervals(circle, { x: 2, y: 0 }, { x: 0, y: 1 }, {
    startAngle: Math.PI / 4,
    endAngle: Math.PI * 7 / 4,
  });
  assert(pieces.length === 2, "A 270-degree slice can cross one line twice");
  near(pieces[0][0], -Math.sqrt(96));
  near(pieces[0][1], -2);
  near(pieces[1][0], 2);
  near(pieces[1][1], Math.sqrt(96));
  const wrapped = hatchIntervals(circle, { x: 0, y: 0 }, { x: 1, y: 0 }, {
    startAngle: Math.PI * 7 / 4,
    endAngle: Math.PI * 9 / 4,
  });
  assert(wrapped.length === 1, "Angles can wrap past one turn");
  near(wrapped[0][0], 0);
  near(wrapped[0][1], 10);
});

Deno.test("roughness scales angle and spacing continuously from clean hatching", () => {
  const shape = { ...circle, r: 100 };
  const angleAndGap = (roughness: number) => {
    const strokes = hatchStrokes(shape, roughness, 9, () => 0.75);
    const { start, end } = strokes[0];
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const projection = (p: { x: number; y: number }) =>
      -Math.sin(angle) * p.x + Math.cos(angle) * p.y;
    return { angle, gap: projection(strokes[1].start) - projection(start) };
  };
  const clean = angleAndGap(0);
  const light = angleAndGap(0.15);
  const normal = angleAndGap(1.5);
  near(clean.angle, -Math.PI / 4);
  near(clean.gap, 9);
  near(light.angle - clean.angle, (normal.angle - clean.angle) / 10);
  near(light.gap - clean.gap, (normal.gap - clean.gap) / 10);
});

Deno.test("stroke ends stop independently short of the edge without erasing tiny strokes", () => {
  const clean = hatchStrokes(circle, 0, 2, randomSource());
  for (const stroke of clean) {
    near(Math.hypot(stroke.start.x, stroke.start.y), circle.r);
    near(Math.hypot(stroke.end.x, stroke.end.y), circle.r);
  }
  const rough = hatchStrokes(circle, 4, 2, randomSource());
  const gaps: number[] = [];
  for (const stroke of rough) {
    for (const end of [stroke.start, stroke.end]) {
      const gap = circle.r - Math.hypot(end.x, end.y);
      assert(gap > 0, "Pen endpoints should lie inside the nominal circle");
      gaps.push(gap);
    }
    assert(
      Math.hypot(stroke.end.x - stroke.start.x, stroke.end.y - stroke.start.y) >
        0,
      "Shortening must not reverse or erase a stroke",
    );
  }
  assert(
    new Set(gaps.map((g) => g.toFixed(5))).size > 3,
    "Endpoints need varied gaps",
  );
  assert(
    JSON.stringify(rough) ===
      JSON.stringify(hatchStrokes(circle, 4, 2, randomSource())),
    "The same seed must reproduce the stroke geometry",
  );
});

Deno.test("a pie wedge emits only local strokes and less geometry than a full circle", () => {
  const shape = { ...circle, r: 100 };
  const full = hatchStrokes(shape, 0, 9, () => 0.5);
  const quarter = hatchStrokes(shape, 0, 9, () => 0.5, {
    startAngle: 0,
    endAngle: Math.PI / 2,
  });
  assert(
    quarter.length > 0 && quarter.length < full.length,
    "Small slices should generate fewer strokes",
  );
  for (const stroke of quarter) {
    for (const p of [stroke.start, stroke.c1, stroke.c2, stroke.end]) {
      assert(
        p.x >= -1e-7 && p.y >= -1e-7,
        "Omit hidden geometry outside the wedge",
      );
    }
  }
});

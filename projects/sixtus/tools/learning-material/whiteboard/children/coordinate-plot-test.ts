import { assert, assertEquals, assertThrows } from "@std/assert";
import { z } from "@zod";
import { coordinatePlot, coordinatePlotSchema } from "./coordinate-plot.ts";
import { parseCoordinateExpression } from "./coordinate-expression.ts";
import { whiteboardChildren } from "./index.ts";

const example = coordinatePlot.example.output;
const plot = (elements: unknown[]) => ({ ...example, elements });

Deno.test("coordinate spec accepts example, blank grid, and all five element types", () => {
  assertEquals(coordinatePlotSchema.parse(example), example);
  assert(coordinatePlotSchema.safeParse(plot([])).success);
  assert(
    coordinatePlotSchema.safeParse(plot([
      { type: "point", id: "hole", position: [0, 1], marker: "open" },
      {
        type: "line",
        id: "vertical",
        from: [2, 0],
        to: [2, 1],
        extend: "both",
        stroke: "dashed",
      },
      { type: "circle", id: "unit", center: [0, 0], radius: 1 },
      { type: "polygon", id: "triangle", vertices: [[0, 0], [1, 0], [0, 1]] },
      {
        type: "function",
        id: "reciprocal",
        expression: "1/x",
        domain: [
          { min: null, max: 0, includeMin: false, includeMax: false },
          { min: 0, max: null, includeMin: false, includeMax: false },
        ],
      },
    ])).success,
  );
});

Deno.test("coordinate expression grammar preserves mathematical precedence", () => {
  assertEquals(parseCoordinateExpression("-x^2"), {
    type: "unary",
    operator: "-",
    operand: {
      type: "binary",
      operator: "^",
      left: { type: "symbol", name: "x" },
      right: { type: "number", value: 2 },
    },
  });
  assertEquals(parseCoordinateExpression("2^3^2"), {
    type: "binary",
    operator: "^",
    left: { type: "number", value: 2 },
    right: {
      type: "binary",
      operator: "^",
      left: { type: "number", value: 3 },
      right: { type: "number", value: 2 },
    },
  });
  for (
    const expression of [
      "x^-2",
      "sin(pi*x)+cos(x)",
      "sqrt(abs(x))",
      "1e-3*x",
      " .5*x ",
      "ln(x)/log10(e)",
      "exp(x)-tan(x)",
    ]
  ) {
    parseCoordinateExpression(expression);
  }
  for (
    const expression of [
      "2x",
      "y=2*x",
      "Math.sin(x)",
      "x;alert(1)",
      "sin(x,2)",
      "foo(x)",
      "x+",
      "(x",
      "x)",
      "1e999",
      "",
      "-".repeat(257) + "x",
    ]
  ) {
    assertThrows(
      () => parseCoordinateExpression(expression),
      Error,
      undefined,
      expression,
    );
  }
});

Deno.test("coordinate spec rejects invalid geometry, intervals, expressions, and IDs", () => {
  const invalid = [
    [{ type: "point", id: "p", position: [0, Infinity] }],
    [{ type: "point", id: "p", position: [0, 1, 2] }],
    [{ type: "point", id: "p", position: [0, 1], color: "red" }],
    [{ type: "line", id: "l", from: [1, 1], to: [1, 1], extend: "both" }],
    [{ type: "circle", id: "c", center: [0, 0], radius: 0 }],
    [{ type: "polygon", id: "p", vertices: [[0, 0], [1, 1], [2, 2]] }],
    [{ type: "polygon", id: "p", vertices: [[0, 0], [1, 0], [0, 1], [0, 0]] }],
    [{ type: "function", id: "f", expression: "2x" }],
    [{ type: "function", id: "f", expression: "x", endpointMarkers: true }],
    [{
      type: "function",
      id: "f",
      expression: "x",
      domain: [
        { min: 2, max: 1, includeMin: true, includeMax: true },
      ],
    }],
    [{
      type: "function",
      id: "f",
      expression: "x",
      domain: [
        { min: null, max: 1, includeMin: true, includeMax: true },
      ],
    }],
    [{
      type: "function",
      id: "f",
      expression: "x",
      domain: [
        { min: 0, max: 1, includeMin: true, includeMax: true },
        { min: 1, max: 2, includeMin: true, includeMax: false },
      ],
    }],
    [{ type: "point", id: "p", position: [0, 1] }, {
      type: "point",
      id: "p",
      position: [1, 0],
    }],
  ];
  for (const elements of invalid) {
    assert(
      !coordinatePlotSchema.safeParse(plot(elements)).success,
      JSON.stringify(elements),
    );
  }
});

Deno.test("coordinate axes support symbolic ticks and reject ambiguous or invalid ranges", () => {
  const withX = (x: unknown) => ({ ...example, axes: { ...example.axes, x } });
  assert(
    coordinatePlotSchema.safeParse(
      withX({
        min: 0,
        max: Math.PI,
        ticks: [{ value: Math.PI / 2, label: "π/2" }],
      }),
    ).success,
  );
  for (
    const x of [
      { min: 1, max: 1 },
      { min: 2, max: 1 },
      { min: 0, max: Infinity },
      { min: -1e308, max: 1e308 },
      { min: 0, max: 2, tickStep: 0 },
      { min: 0, max: 2, tickStep: 1, ticks: [] },
      { min: 0, max: 2, ticks: [{ value: 3, label: "3" }] },
      {
        min: 0,
        max: 2,
        ticks: [{ value: 1, label: "1" }, { value: 1, label: "one" }],
      },
    ]
  ) assert(!coordinatePlotSchema.safeParse(withX(x)).success);
});

Deno.test("coordinate annotations resolve only declared visual parts", () => {
  const annotate = (target: string) => ({
    ...example,
    annotations: [{ type: "arrow", targetIds: [target], content: "Look here" }],
  });
  assert(coordinatePlotSchema.safeParse(annotate("slope.f.mark")).success);
  assert(coordinatePlotSchema.safeParse(annotate("slope.run.label")).success);
  assert(
    !coordinatePlotSchema.safeParse(annotate("slope.missing.mark")).success,
  );
  assert(
    !coordinatePlotSchema.safeParse({
      ...annotate("slope.f.mark"),
      id: undefined,
    }).success,
  );
  assert(
    !coordinatePlotSchema.safeParse({
      ...annotate("slope.f.label"),
      elements: [{ type: "function", id: "f", expression: "x" }],
    }).success,
  );
});

Deno.test("coordinate schema exports JSON Schema and is enabled in the live registry", () => {
  const schema = z.toJSONSchema(coordinatePlotSchema);
  assert(JSON.stringify(schema).includes('"anyOf"'));
  assert(!JSON.stringify(schema).includes('"oneOf"'));
  assert(
    whiteboardChildren.some((child) =>
      String(child.type) === "coordinate_plot"
    ),
  );
});

import { z } from "@zod";
import {
  childAnnotationsField,
  childTitleField,
  elementIdField,
  type WhiteboardChildDefinition,
} from "./shared.ts";
import { parseCoordinateExpression } from "./coordinate-expression.ts";

const number = z.number().finite();
const label = z.string().trim().min(1).max(200);
const position = z.array(number).length(2).describe(
  "Exactly [x, y], in mathematical coordinates.",
);
const samePosition = (a: number[], b: number[]) =>
  a[0] === b[0] && a[1] === b[1];
const stroke = z.enum(["solid", "dashed"]);
const common = { id: elementIdField, label: label.optional() };

const axis = z.strictObject({
  min: number,
  max: number,
  label: label.optional(),
  tickStep: number.positive().optional(),
  ticks: z.array(z.strictObject({ value: number, label })).max(100).optional(),
}).superRefine((value, ctx) => {
  if (!(value.min < value.max) || !Number.isFinite(value.max - value.min)) {
    ctx.addIssue({
      code: "custom",
      message: "Axis bounds require a finite positive span.",
    });
  }
  if (value.tickStep !== undefined && value.ticks !== undefined) {
    ctx.addIssue({
      code: "custom",
      message: "Choose tickStep or explicit ticks, not both.",
    });
  }
  const seen = new Set<number>();
  for (const [i, tick] of (value.ticks ?? []).entries()) {
    if (
      tick.value < value.min || tick.value > value.max || seen.has(tick.value)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["ticks", i],
        message: "Ticks must be unique and inside the visible range.",
      });
    }
    seen.add(tick.value);
  }
});

const interval = z.strictObject({
  min: number.nullable().describe("Null means unbounded below."),
  max: number.nullable().describe("Null means unbounded above."),
  includeMin: z.boolean(),
  includeMax: z.boolean(),
}).superRefine((value, ctx) => {
  if ((value.min ?? -Infinity) >= (value.max ?? Infinity)) {
    ctx.addIssue({
      code: "custom",
      message:
        "Domain intervals require min < max; use a point for an isolated value.",
    });
  }
  if (
    (value.min === null && value.includeMin) ||
    (value.max === null && value.includeMax)
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Unbounded endpoints cannot be included.",
    });
  }
});

const expression = z.string().trim().min(1).max(1000).superRefine(
  (value, ctx) => {
    try {
      parseCoordinateExpression(value);
    } catch (error) {
      ctx.addIssue({ code: "custom", message: (error as Error).message });
    }
  },
);

// Ordinary unions produce anyOf for structured-output consumers.
export const coordinateElementSchema = z.union([
  z.strictObject({
    type: z.literal("point"),
    ...common,
    position,
    marker: z.enum(["open", "filled"]).optional(),
  }),
  z.strictObject({
    type: z.literal("line"),
    ...common,
    from: position,
    to: position,
    extend: z.enum(["neither", "start", "end", "both"]),
    arrowheads: z.enum(["none", "start", "end", "both"]).optional(),
    stroke: stroke.optional(),
  }).refine((value) => !samePosition(value.from, value.to), {
    message: "A line needs two distinct points.",
  }),
  z.strictObject({
    type: z.literal("function"),
    ...common,
    expression,
    domain: z.array(interval).min(1).max(32).optional(),
    endpointMarkers: z.boolean().optional(),
    stroke: stroke.optional(),
  }).superRefine((value, ctx) => {
    const intervals = value.domain ?? [];
    for (let i = 1; i < intervals.length; i++) {
      const previous = intervals[i - 1], current = intervals[i];
      const end = previous.max ?? Infinity, start = current.min ?? -Infinity;
      if (
        start < end ||
        (start === end && previous.includeMax && current.includeMin)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["domain", i],
          message:
            "Intervals must be ordered and nonoverlapping, including endpoints.",
        });
      }
    }
    if (value.endpointMarkers && !value.domain) {
      ctx.addIssue({
        code: "custom",
        path: ["endpointMarkers"],
        message: "Endpoint markers require an explicit domain.",
      });
    }
  }),
  z.strictObject({
    type: z.literal("circle"),
    ...common,
    center: position,
    radius: number.positive(),
    stroke: stroke.optional(),
  }),
  z.strictObject({
    type: z.literal("polygon"),
    ...common,
    vertices: z.array(position).min(3).max(100),
    stroke: stroke.optional(),
  }).superRefine((value, ctx) => {
    const vertices = value.vertices;
    if (
      new Set(vertices.map((v) => JSON.stringify(v))).size !== vertices.length
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["vertices"],
        message: "Vertices must be distinct; closure is automatic.",
      });
    }
    const [a, b] = vertices;
    if (
      a && b &&
      vertices.every((p) =>
        (b[0] - a[0]) * (p[1] - a[1]) === (b[1] - a[1]) * (p[0] - a[0])
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["vertices"],
        message: "Polygon vertices cannot all be collinear.",
      });
    }
  }),
]);

export const coordinatePlotSchema = z.strictObject({
  type: z.literal("coordinate_plot"),
  id: elementIdField.optional(),
  title: childTitleField,
  annotations: childAnnotationsField.optional(),
  axes: z.strictObject({
    x: axis,
    y: axis,
    scale: z.enum(["equal", "independent"]).optional(),
    grid: z.boolean().optional(),
  }),
  elements: z.array(coordinateElementSchema).max(100),
}).superRefine((value, ctx) => {
  const ids = new Set<string>();
  for (const [i, element] of value.elements.entries()) {
    if (ids.has(element.id)) {
      ctx.addIssue({
        code: "custom",
        path: ["elements", i, "id"],
        message: "Element IDs must be unique within the plot.",
      });
    }
    ids.add(element.id);
  }
  if (value.annotations?.length) {
    if (!value.id) {
      ctx.addIssue({
        code: "custom",
        path: ["id"],
        message: "Annotated plots require an explicit child ID.",
      });
    }
    const targets = new Set([
      `${value.id}.title`,
      `${value.id}.x-label`,
      `${value.id}.y-label`,
    ]);
    for (const element of value.elements) {
      targets.add(`${value.id}.${element.id}.mark`);
      if (element.label) targets.add(`${value.id}.${element.id}.label`);
    }
    for (const [i, annotation] of value.annotations.entries()) {
      if (annotation.targetIds.some((id) => !targets.has(id))) {
        ctx.addIssue({
          code: "custom",
          path: ["annotations", i, "targetIds"],
          message: "Unknown coordinate plot annotation target.",
        });
      }
    }
  }
});

export type CoordinatePlot = z.infer<typeof coordinatePlotSchema>;
export type CoordinateElement = z.infer<typeof coordinateElementSchema>;

export const coordinatePlot = {
  type: "coordinate_plot",
  schema: coordinatePlotSchema,
  instructions: `### When to use it

Use for functions and coordinate geometry on one Cartesian plane. Use xy_chart for supplied observations or category comparisons. An empty elements array produces a blank coordinate exercise.

### Plane and common fields

- type: "coordinate_plot". title, id, annotations follow shared rules.
- axes.x and axes.y: finite min < max; optional label (defaults to x/y). Optional positive tickStep OR ticks: [{ value, label }] for symbolic labels such as π/2 at a numeric position. Omit both for automatic ticks; ticks: [] hides ticks. Explicit ticks are unique and within the window.
- axes.scale: "equal" (default: equal physical unit lengths) or "independent". Equal scale preserves the supplied ranges by fitting the plane's aspect ratio, not by changing bounds.
- axes.grid: boolean, default true. Axes cross at zero when visible; otherwise use the corresponding plot edge.
- elements: ordered array, 0–100 objects. Every element has a unique stable id and optional plain-text label. Labels are literal text; do not supply LaTeX. Coordinates are [x, y] in mathematical units, never pixels.

### Elements

- point: position: [x, y]; optional marker: "open" or "filled" (default filled).
- line: distinct from/to coordinates; extend: "neither" (segment), "start", "end" (rays), or "both" (infinite line). Optional arrowheads: "none" (default), "start", "end", "both"; start is toward from, end toward to. Arrowheads affect appearance only, not extent. Use a segment with an end arrowhead for a vector.
- function: expression describing y in terms of x; optional domain array, endpointMarkers (default false), and stroke. Write piecewise branches as separate function elements with disjoint domains.
- circle: center: [x, y] and positive radius in coordinate units. Independent axis scaling can make its screen appearance elliptical.
- polygon: 3–100 distinct vertices: [[x, y], ...], in boundary order; closes automatically. Vertices must not all be collinear. Self-intersections are allowed and drawn as an outline. Add point elements for labeled vertices.
- line, function, circle, polygon accept optional stroke: "solid" (default) or "dashed". Shapes are outlines; filling/shading is not supported yet. Draw dashed lines for asymptotes, coordinate projections, or slope guides.

### Expressions and domains

- Supports finite numbers (including decimals/scientific notation), x, pi, e, parentheses, + - * / ^, and unary +/-. Multiplication must be explicit: 2*x. Powers associate right; -x^2 means -(x^2), and x^-2 is allowed. Zero to the zeroth power and negative bases raised to fractional powers are undefined in this real numerical evaluator.
- Supported single-argument functions: sqrt, abs, sin, cos, tan, exp, ln, log10. Trigonometry uses radians. No equations, implicit multiplication, arbitrary variables, LaTeX, JavaScript, or conditionals. Maximum 1000 characters / 256 tokens.
- domain: [{ min, max, includeMin, includeMax }]. Null min/max means unbounded below/above; unbounded endpoints must be excluded. Intervals are ordered and nonoverlapping, including included boundary values. Omit domain for the expression's natural real domain. Intervals restrict that domain; they never make an undefined value valid.
- endpointMarkers: true requires domain. Show filled/open markers for included/excluded finite endpoints only when the corresponding value or one-sided limit is finite. Do not mark viewport clipping edges or infinite/undefined endpoints. Use explicit open points for holes when needed.
- The visible axes window and a function's domain are independent. Undefined values and discontinuities must produce breaks, never connecting strokes.

### Labels, annotations, and rendering contract

- Annotation targets: <childId>.title, <childId>.x-label, <childId>.y-label, <childId>.<elementId>.mark, and <childId>.<elementId>.label (only with an explicit label). Annotated plots require a child id. A mark means the entire element; add a point to target a specific location. Use text emphasis only on text targets.
- Geometry is clipped to the window. The renderer owns typography, colors, sampling, and label placement. Labels and annotations must not imply visibility for entirely clipped elements.
- Supply explicit coordinates for intersections, tangent lines, and other constructions; the renderer is not a symbolic solver.
- Rendering uses bounded adaptive numerical sampling, not symbolic analysis. Extremely rapid oscillations or tiny features can require a narrower window. Unsupported numerical ranges, excessive ticks, and invisible annotation targets produce explicit errors.`,
  example: {
    goal: "Show that y = 2x rises by 2 for a run of 1.",
    output: {
      type: "coordinate_plot",
      id: "slope",
      title: "A rise of 2 for a run of 1",
      axes: {
        x: { min: -1, max: 4 },
        y: { min: -1, max: 7 },
        scale: "equal",
        grid: true,
      },
      elements: [
        { type: "function", id: "f", expression: "2*x", label: "f(x)" },
        {
          type: "line",
          id: "run",
          from: [1, 2],
          to: [2, 2],
          extend: "neither",
          label: "1",
        },
        {
          type: "line",
          id: "rise",
          from: [2, 2],
          to: [2, 4],
          extend: "neither",
          label: "2",
        },
      ],
      annotations: [],
    },
  },
} satisfies WhiteboardChildDefinition<typeof coordinatePlotSchema>;

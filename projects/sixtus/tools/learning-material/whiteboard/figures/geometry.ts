import { z } from "@zod";
import {
  figureAnnotationsField,
  figureTitleField,
  elementIdField as id,
  type WhiteboardFigureDefinition,
} from "./shared.ts";
import { resolveGeometry } from "./geometry-resolver.ts";

const number = z.number().finite();
const pair = z.array(id).length(2);
const triple = z.array(id).length(3);
const latex = z.string().trim().min(1).max(500);
const stroke = { dashed: z.boolean().optional() };

// Use unions (anyOf), not discriminated unions (oneOf), for structured output.
const point = z.union([
  z.object({ id, kind: z.literal("position"), at: z.array(number).length(2) })
    .strict(),
  z.object({ id, kind: z.literal("along"), points: pair, fraction: number })
    .strict(),
  z.object({ id, kind: z.literal("projection"), point: id, onto: pair })
    .strict(),
  z.object({ id, kind: z.literal("on-circle"), circle: id, angle: number })
    .strict(),
  z.object({
    id,
    kind: z.literal("intersection"),
    objects: pair,
    solution: z.enum(["first", "second"]),
  }).strict(),
]);

const object = z.union([
  z.object({
    id,
    kind: z.enum(["segment", "line", "ray"]),
    points: pair,
    ...stroke,
  }).strict(),
  z.object({
    id,
    kind: z.literal("polygon"),
    points: z.array(id).min(3).max(64),
    fill: z.boolean().optional(),
    ...stroke,
  }).strict(),
  z.object({
    id,
    kind: z.literal("circle"),
    center: id,
    radius: z.union([number.positive(), z.object({ through: id }).strict()]),
    fill: z.boolean().optional(),
    ...stroke,
  }).strict(),
  z.object({
    id,
    kind: z.literal("arc"),
    circle: id,
    startAngle: number,
    endAngle: number,
    direction: z.enum(["clockwise", "counterclockwise"]),
    ...stroke,
  }).strict(),
]);

const label = z.union([
  z.object({ id, kind: z.literal("text"), target: id, latex }).strict(),
  z.object({
    id,
    kind: z.literal("length"),
    points: pair,
    latex: latex.optional(),
  }).strict(),
]);

const marking = z.union([
  z.object({ id, kind: z.literal("right-angle"), points: triple }).strict(),
  z.object({
    id,
    kind: z.literal("angle"),
    points: triple,
    sweep: z.enum(["minor", "reflex"]),
    latex: latex.optional(),
    group: id.optional(),
  }).strict(),
  z.object({
    id,
    kind: z.enum(["equal-length", "parallel"]),
    objects: z.array(id).min(2).max(32),
  }).strict(),
]);

const geometryShape = z.object({
  type: z.literal("geometry"),
  id: id.optional(),
  title: figureTitleField,
  annotations: figureAnnotationsField.optional(),
  unit: z.string().trim().min(1).max(30).optional(),
  points: z.array(point).min(1).max(128),
  objects: z.array(object).min(1).max(128),
  labels: z.array(label).max(128),
  markings: z.array(marking).max(128),
}).strict();

export type Geometry = z.infer<typeof geometryShape>;

export const geometrySchema = geometryShape.superRefine((spec, ctx) => {
  try {
    resolveGeometry(spec);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export const geometry = {
  type: "geometry",
  schema: geometrySchema,
  instructions: String.raw`### When to use it

Use for 2D geometry: shapes, circle geometry, constructions, angle relationships, and proofs. Use xy_chart for data or function plots and math_expressions for equations.

### Fields

- type: always "geometry". title, id, annotations follow shared rules.
- unit: optional common length unit. One coordinate unit equals one unit of length.
- points, objects, labels, markings: arrays; labels and markings may be empty.
- All points, objects, labels, and markings require stable IDs, unique together within this figure. Group names on angle markings are matching-style keys, not element IDs.
- Coordinates are mathematical (positive Y upward), never pixels. The renderer preserves aspect ratio, fits the figure, and places labels automatically. No axes or grid are implied.

### Points

- position: at: [x, y].
- along: points: [a, b], fraction: t. A + t(B - A); 0.5 is the midpoint. Values outside [0, 1] extend the line.
- projection: point: p, onto: [a, b]. The perpendicular foot on the infinite line through A and B.
- on-circle: circle: circleId, angle: degrees counterclockwise from positive X.
- intersection: objects: [firstId, secondId], solution: "first" or "second". Supports segment/line/ray and circle combinations. Solutions are sorted by X then Y; first is the only solution for a tangent or a unique crossing. Second requires two distinct solutions. Segment/ray intersections respect their finite/half-infinite domains. Coincident objects and objects with no isolated intersection are errors.
- Every declared point is shown as a dot. Point names require explicit text labels.
- Forward references are allowed, but dependencies must be acyclic. Derive points when relationships matter instead of approximating coordinates.

### Objects

- segment, line, ray: points: [a, b]. A ray starts at A and passes through B. Lines extend in both directions and rays in one direction to the drawing boundary, with arrowheads indicating continuation.
- polygon: points in boundary order, at least three distinct vertices; do not repeat the first vertex. Simple, nonzero-area polygons only. fill is an optional boolean.
- circle: center: pointId; radius is a positive number or { through: pointId }. fill is an optional boolean.
- arc: circle: circleId, startAngle, endAngle (degrees), direction: "clockwise" or "counterclockwise". Sweep is strictly between 0 and 360 degrees; use a circle for a full turn.
- All objects accept optional dashed. Objects draw in supplied order. Every declared object is visible; a supporting circle is not implicitly hidden.
- Shapes are compositions: a triangle is a three-point polygon. Add explicit segments for edges that need an object ID, for example for parallel/equal-length markings. Polygon edge names are not generated implicitly.

### Labels and markings

- text label: target is a point, object, or marking ID; latex is the displayed text/math. Point names are displayed only when explicitly labelled.
- length label: points: [a, b]; optional latex displays a symbol or supplied text (such as "x"). Without latex, display the calculated length in unit, rounded to at most two decimal places. No other measurement is revealed automatically. Labels do not define geometry or assert numeric values.
- right-angle marking: points: [a, vertex, b]. Requires perpendicular arms.
- angle marking: points: [a, vertex, b], sweep: "minor" or "reflex"; optional latex for a visible value/symbol, optional group for equal-angle arcs. Same-group angles must actually be equal. Minor means [0, 180] degrees; reflex means 360 minus the minor angle. Zero/full-turn angles are unsupported.
- equal-length marking: objects: two or more segment IDs. Requires equal lengths.
- parallel marking: objects: two or more segment/line/ray IDs. Requires parallel directions.
- The renderer chooses matching tick/arrow/arc styles from groups. Mathematical markings assert properties; annotations only add teaching emphasis.
- LaTeX follows math_expressions conventions; escape backslashes in JSON.

### Validation and targets

Unknown/wrong-kind references, duplicate IDs, cyclic dependencies, degenerate objects, impossible intersections, self-crossing polygons, and contradictory mathematical markings are errors. This is deterministic construction, not a constraint solver. It does not interpret mathematical assertions in free-form LaTeX labels.

Annotation targets: <figureId>.title (only when title is not null), <figureId>.<pointId>.mark, <figureId>.<objectId>.mark, <figureId>.<markingId>.mark, and <figureId>.<labelId>.label. An angle marking with latex also exposes <figureId>.<markingId>.label. Only text targets support underline/strikethrough.`,
  example: {
    goal:
      "Show a triangle's base and perpendicular height without revealing measurements.",
    output: {
      type: "geometry",
      id: "triangle",
      title: "Triangle and height",
      annotations: [],
      points: [
        { id: "a", kind: "position", at: [2, 3] },
        { id: "b", kind: "position", at: [0, 0] },
        { id: "c", kind: "position", at: [6, 0] },
        { id: "d", kind: "projection", point: "a", onto: ["b", "c"] },
      ],
      objects: [
        { id: "abc", kind: "polygon", points: ["a", "b", "c"] },
        { id: "height", kind: "segment", points: ["a", "d"], dashed: true },
      ],
      labels: [
        { id: "base-label", kind: "length", points: ["b", "c"], latex: "b" },
        { id: "height-label", kind: "text", target: "height", latex: "h" },
      ],
      markings: [{ id: "foot", kind: "right-angle", points: ["a", "d", "c"] }],
    },
  },
} satisfies WhiteboardFigureDefinition<typeof geometrySchema>;

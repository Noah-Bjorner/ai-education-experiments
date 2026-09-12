import { type Geometry, geometry } from "../figures/geometry.ts";

/** Representative fixtures, also used by the visual gallery and regression tests. */
export const geometryExamples: Geometry[] = [
  {
    ...geometry.example.output,
    annotations: [{
      type: "arrow",
      targetIds: ["triangle.height.mark"],
      content: "Perpendicular height",
    }],
    labels: [
      ...geometry.example.output.labels,
      { id: "a-name", kind: "text", target: "a", latex: "A" },
      { id: "b-name", kind: "text", target: "b", latex: "B" },
      { id: "c-name", kind: "text", target: "c", latex: "C" },
    ],
  },
  {
    type: "geometry",
    id: "circle-diagram",
    title: "Radius, tangent and arc",
    unit: "cm",
    points: [
      { id: "o", kind: "position", at: [0, 0] },
      { id: "a", kind: "on-circle", circle: "circle", angle: 0 },
      { id: "b", kind: "on-circle", circle: "circle", angle: 90 },
      { id: "t", kind: "position", at: [3, 2] },
    ],
    objects: [
      { id: "circle", kind: "circle", center: "o", radius: 3 },
      { id: "radius", kind: "segment", points: ["o", "a"] },
      { id: "tangent", kind: "line", points: ["a", "t"], dashed: true },
      {
        id: "quarter",
        kind: "arc",
        circle: "circle",
        startAngle: 0,
        endAngle: 90,
        direction: "counterclockwise",
      },
    ],
    markings: [{ id: "right", kind: "right-angle", points: ["o", "a", "t"] }],
    labels: [
      { id: "origin", kind: "text", target: "o", latex: "O" },
      { id: "radius-length", kind: "length", points: ["o", "a"] },
      { id: "arc-name", kind: "text", target: "quarter", latex: "s" },
    ],
    annotations: [],
  },
  {
    type: "geometry",
    id: "square",
    title: "Equal sides and parallel lines",
    points: [
      { id: "a", kind: "position", at: [0, 0] },
      { id: "b", kind: "position", at: [4, 0] },
      { id: "c", kind: "position", at: [4, 4] },
      { id: "d", kind: "position", at: [0, 4] },
    ],
    objects: [
      {
        id: "shape",
        kind: "polygon",
        points: ["a", "b", "c", "d"],
        fill: true,
      },
      { id: "ab", kind: "segment", points: ["a", "b"] },
      { id: "bc", kind: "segment", points: ["b", "c"] },
      { id: "cd", kind: "segment", points: ["c", "d"] },
      { id: "da", kind: "segment", points: ["d", "a"] },
    ],
    markings: [
      { id: "same", kind: "equal-length", objects: ["ab", "bc", "cd", "da"] },
      { id: "horizontal", kind: "parallel", objects: ["ab", "cd"] },
      { id: "vertical", kind: "parallel", objects: ["bc", "da"] },
    ],
    labels: [{ id: "side", kind: "length", points: ["a", "b"], latex: "x" }],
    annotations: [],
  },
  {
    type: "geometry",
    id: "angles",
    title: "Minor and reflex angles",
    points: [
      { id: "o", kind: "position", at: [0, 0] },
      { id: "a", kind: "position", at: [4, 0] },
      { id: "b", kind: "position", at: [0, 4] },
    ],
    objects: [{ id: "oa", kind: "ray", points: ["o", "a"] }, {
      id: "ob",
      kind: "ray",
      points: ["o", "b"],
    }],
    markings: [
      {
        id: "small",
        kind: "angle",
        points: ["a", "o", "b"],
        sweep: "minor",
        latex: "90^\\circ",
      },
      {
        id: "large",
        kind: "angle",
        points: ["a", "o", "b"],
        sweep: "reflex",
        latex: "270^\\circ",
      },
    ],
    labels: [],
    annotations: [{
      type: "circle",
      targetIds: ["angles.large.label"],
      content: null,
    }],
  },
  {
    type: "geometry",
    id: "construction",
    title: "Equal angles in an isosceles triangle",
    points: [
      { id: "a", kind: "position", at: [-3, 0] },
      { id: "b", kind: "position", at: [3, 0] },
      { id: "c", kind: "position", at: [0, 4] },
      { id: "m", kind: "along", points: ["a", "b"], fraction: 0.5 },
    ],
    objects: [
      { id: "triangle", kind: "polygon", points: ["a", "b", "c"] },
      { id: "median", kind: "segment", points: ["c", "m"], dashed: true },
    ],
    markings: [
      {
        id: "left",
        kind: "angle",
        points: ["b", "a", "c"],
        sweep: "minor",
        group: "base",
        latex: "\\alpha",
      },
      {
        id: "right",
        kind: "angle",
        points: ["a", "b", "c"],
        sweep: "minor",
        group: "base",
        latex: "\\alpha",
      },
    ],
    labels: [{ id: "midpoint", kind: "text", target: "m", latex: "M" }],
    annotations: [],
  },
  {
    type: "geometry",
    id: "filled-circle",
    title: "A labelled shaded circle",
    points: [{ id: "o", kind: "position", at: [0, 0] }, {
      id: "a",
      kind: "on-circle",
      circle: "disk",
      angle: -45,
    }],
    objects: [
      {
        id: "disk",
        kind: "circle",
        center: "o",
        radius: Math.SQRT2,
        fill: true,
      },
      { id: "radius", kind: "segment", points: ["o", "a"], dashed: true },
    ],
    markings: [],
    labels: [
      { id: "origin", kind: "text", target: "o", latex: "O" },
      {
        id: "radius-label",
        kind: "length",
        points: ["o", "a"],
        latex: "\\sqrt{2}",
      },
    ],
    annotations: [],
  },
];

import { freeform } from "./freeform.ts";
export { freeform, freeformSchema } from "./freeform.ts";
export type { Freeform, FreeformElement } from "./freeform.ts";
import { circularChart } from "./circular-chart.ts";
import { xyChart } from "./xy-chart.ts";
import { mathExpressions } from "./math-expressions.ts";
import { coordinatePlot } from "./coordinate-plot.ts";

export { coordinatePlot, coordinatePlotSchema } from "./coordinate-plot.ts";
export type { CoordinateElement, CoordinatePlot } from "./coordinate-plot.ts";

import { geometry } from "./geometry.ts";
export { geometry, geometrySchema } from "./geometry.ts";
export type { Geometry } from "./geometry.ts";
export { resolveGeometry } from "./geometry-resolver.ts";

export const whiteboardChildren = [
  xyChart,
  circularChart,
  mathExpressions,
  coordinatePlot,
  geometry,
  freeform,
] as const;

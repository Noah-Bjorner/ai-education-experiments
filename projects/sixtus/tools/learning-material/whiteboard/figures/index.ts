import { freeform } from "./freeform.ts";
export { freeform, freeformSchema } from "./freeform.ts";
export type { Freeform, FreeformElement } from "./freeform.ts";
import { circularChart } from "./circular-chart.ts";
import { xyChart } from "./xy-chart.ts";
import { mathExpressions } from "./math-expressions.ts";
import { coordinatePlot } from "./coordinate-plot.ts";
import { textFigure } from "./text.ts";
export { textFigure, textFigureSchema } from "./text.ts";
export type { TextFigure } from "./text.ts";

export { coordinatePlot, coordinatePlotSchema } from "./coordinate-plot.ts";
export type { CoordinateElement, CoordinatePlot } from "./coordinate-plot.ts";

import { geometry } from "./geometry.ts";
export { geometry, geometrySchema } from "./geometry.ts";
export type { Geometry } from "./geometry.ts";
export { resolveGeometry } from "./geometry-resolver.ts";

export const whiteboardFigureCategories = {
  charts: [xyChart, circularChart],
  math: [mathExpressions, coordinatePlot, geometry],
  miscellaneous: [freeform, textFigure],
} as const;

export const whiteboardFigures = [
  ...whiteboardFigureCategories.charts,
  ...whiteboardFigureCategories.math,
  ...whiteboardFigureCategories.miscellaneous,
] as const;

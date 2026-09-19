import { circularChart } from "./circular-chart.ts";
import { xyChart } from "./xy-chart.ts";
import { distribution } from "./distribution.ts";
import { mathExpressions } from "./math-expressions.ts";
import { coordinatePlot } from "./coordinate-plot.ts";
import { textFigure } from "./text.ts";
export { textFigure, textFigureSchema } from "./text.ts";
export type { TextFigure } from "./text.ts";
export { distribution, distributionSchema } from "./distribution.ts";
export type { Distribution } from "./distribution.ts";

export { coordinatePlot, coordinatePlotSchema } from "./coordinate-plot.ts";
export type { CoordinateElement, CoordinatePlot } from "./coordinate-plot.ts";

import { geometry } from "./geometry.ts";
export { geometry, geometrySchema } from "./geometry.ts";
export type { Geometry } from "./geometry.ts";
export { resolveGeometry } from "./geometry-resolver.ts";

export const whiteboardFigureCategories = {
  charts: [xyChart, circularChart, distribution],
  math: [mathExpressions, coordinatePlot, geometry],
  miscellaneous: [textFigure],
} as const;

export const whiteboardFigures = [
  xyChart,
  circularChart,
  distribution,
  mathExpressions,
  coordinatePlot,
  geometry,
  textFigure,
] as const;

export function whiteboardFigureByType(type: string) {
  return whiteboardFigures.find((figure) => figure.type === type);
}

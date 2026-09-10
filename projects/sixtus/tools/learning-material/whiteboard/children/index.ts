import { circularChart } from "./circular-chart.ts";
import { xyChart } from "./xy-chart.ts";
import { mathExpressions } from "./math-expressions.ts";

export const whiteboardChildren = [
  xyChart,
  circularChart,
  mathExpressions,
] as const;

import type { Diagram } from "./schema.ts";
import {
  type RenderXyChartOptions,
  renderXyChartSvg,
} from "./renderers/xy-chart.ts";

export type RenderDiagramOptions = RenderXyChartOptions;

/** Dispatches a typed diagram spec to its SVG renderer. */
export function renderDiagramSvg(
  diagram: Diagram,
  options: RenderDiagramOptions = {},
): string {
  switch (diagram.type) {
    case "xy_chart":
      return renderXyChartSvg(diagram, options);
    default:
      throw new Error(
        `No SVG renderer has been implemented for diagram type: ${diagram.type}`,
      );
  }
}

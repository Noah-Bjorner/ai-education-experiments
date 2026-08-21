import "@std/dotenv/load";
import { generateText, Output } from "@ai";

import { imageSearchSelector } from "../../../shared/image-search-selector/index.ts";
import {
  SVG_DIAGRAM_ROUTE_SYSTEM_PROMPT,
  svgStaticSpecSystemPrompt,
} from "./prompt.ts";
import {
  type Diagram,
  diagramRouteSchema,
  diagramSchemas,
  type DiagramType,
  type SvgStaticVisualization,
} from "./schema.ts";
import { renderDiagramSvg } from "./render.ts";
import {
  readSvgViewBoxSize,
  type SvgRenderOptions,
} from "./shared/svg.ts";

const SVG_DIAGRAM_ROUTE_MODEL = "openai/gpt-5.6-sol" as const;
const SVG_DIAGRAM_ROUTE_REASONING = "low" as const;

const SVG_STATIC_SPEC_MODEL = "openai/gpt-5.6-sol" as const;
const SVG_STATIC_SPEC_REASONING = "medium" as const;

export const staticVisualizationExecutor = (_instruction: string) => {
  //1. staticVisualizationRouter
  //2. switch case call the right function
  //3. return the result
  return "";
};

export const staticVisualizationRouter = (_instruction: string) => {
  // TODO: modality router → svg | ai_image | web_search
  return "";
};

export const webSearchImageExecutor = async (instruction: string) => {
    const { imageURL } = await imageSearchSelector({
        prompt: instruction,
        mode: "fast",
        maxCandidates: 5,
    });
    //need size of the image as well for aspect ratio setup
    return imageURL;
};

export const aiImageGeneratorExecutor = (_instruction: string) => {
  return "";
};

/** Step 1: instruction → which diagram type to build. */
export async function routeSvgDiagramType(
  instruction: string,
): Promise<DiagramType> {
  const { output } = await generateText({
    model: SVG_DIAGRAM_ROUTE_MODEL,
    reasoning: SVG_DIAGRAM_ROUTE_REASONING,
    system: SVG_DIAGRAM_ROUTE_SYSTEM_PROMPT,
    prompt: instruction,
    output: Output.object({
      schema: diagramRouteSchema,
      name: "svg_diagram_route",
      description: "Pick the single best diagram type for this instruction.",
    }),
  });

  if (!output) {
    throw new Error("SVG diagram routing produced no structured output.");
  }

  return output.type;
}

/** Step 2: instruction + known type → typed diagram payload (narrow schema). */
export async function createSvgDiagramSpec(
  instruction: string,
  type: DiagramType,
): Promise<Diagram> {
  // Switch keeps each Output.object call on one concrete schema (not the union).
  switch (type) {
    case "xy_chart":
      return await fillDiagramSpec(instruction, type, diagramSchemas.xy_chart);
    case "flowchart":
      return await fillDiagramSpec(instruction, type, diagramSchemas.flowchart);
    case "pie_chart":
      return await fillDiagramSpec(instruction, type, diagramSchemas.pie_chart);
    case "mind_map":
      return await fillDiagramSpec(instruction, type, diagramSchemas.mind_map);
    case "quadrant":
      return await fillDiagramSpec(instruction, type, diagramSchemas.quadrant);
    case "venn":
      return await fillDiagramSpec(instruction, type, diagramSchemas.venn);
    case "timeline":
      return await fillDiagramSpec(instruction, type, diagramSchemas.timeline);
    case "radar":
      return await fillDiagramSpec(instruction, type, diagramSchemas.radar);
    case "sequence":
      return await fillDiagramSpec(instruction, type, diagramSchemas.sequence);
  }
}

async function fillDiagramSpec(
  instruction: string,
  type: DiagramType,
  schema: (typeof diagramSchemas)[DiagramType],
): Promise<Diagram> {
  const { output } = await generateText({
    model: SVG_STATIC_SPEC_MODEL,
    reasoning: SVG_STATIC_SPEC_REASONING,
    system: svgStaticSpecSystemPrompt(type),
    prompt: instruction,
    output: Output.object({
      // One concrete schema at runtime; the map value type is a union.
      schema: schema as typeof diagramSchemas.xy_chart,
      name: `svg_static_${type}`,
      description: `Fill structured ${type} data for SVG rendering.`,
    }),
  });

  if (!output) {
    throw new Error(
      "SVG static spec generation produced no structured output.",
    );
  }

  return output as Diagram;
}

/**
 * Programmatic static path (diagrams only for now):
 * route type → fill typed spec → render standalone SVG.
 */
export async function svgStaticVisualizationExecutor(
  instruction: string,
  options: SvgRenderOptions = {},
): Promise<SvgStaticVisualization> {
  const type = await routeSvgDiagramType(instruction);
  const diagram = await createSvgDiagramSpec(instruction, type);
  const svg = renderDiagramSvg(diagram, options);
  const { width, height } = readSvgViewBoxSize(svg);

  return { category: "diagram", diagram, svg, width, height };
}

export { renderDiagramSvg } from "./render.ts";
export {
  type RenderXyChartOptions,
  renderXyChartSvg,
  type XyChart,
} from "./renderers/xy-chart.ts";

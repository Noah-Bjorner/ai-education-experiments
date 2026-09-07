/**
 * Whiteboard SVG composition.
 *
 * Planned entry point:
 *   renderWhiteboardSvg(spec, options) -> { svg, width, height }
 *
 * Input: WhiteboardSpec from ../schema.ts, plus canvas dimensions, padding,
 * gap, and shared theme/font settings supplied by the application.
 *
 * Responsibilities:
 * - Ask layout.ts for the canvas size and each child's allocated rectangle.
 * - Dispatch children by type to their renderer group:
 *     xy_chart -> graphs.ts / renderXyGraph
 *     pie_chart -> graphs.ts / renderPieGraph
 * - Position each returned SVG group at its rectangle's x/y coordinates.
 * - Wrap the groups in one root <svg> with a viewBox and shared definitions,
 *   including GRAPH_FONT_DEFS from font.ts, once per whiteboard.
 * - Return the complete SVG markup and its dimensions.
 *
 * Unsupported child types should produce an explicit error until implemented.
 * Spec generation and uploading the finished SVG remain outside the renderer.
 */

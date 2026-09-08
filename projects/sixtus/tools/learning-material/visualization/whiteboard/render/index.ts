/**
 * Whiteboard SVG composition.
 *
 * Planned entry point:
 *   renderWhiteboardSvg(spec, options) -> { svg, width, height }
 *
 * Input: WhiteboardSpec from ../schema.ts, plus layout constraints, internal
 * gap, and shared theme/font settings supplied by the application.
 * The client owns outer padding; the export adds none.
 *
 * Responsibilities:
 * - Ask layout.ts for each child's allocated rectangle.
 * - Dispatch children by type to their renderer group:
 *     xy_chart -> graphs.ts / renderXyGraph
 *     pie_chart -> graphs.ts / renderPieGraph
 * - Position each returned SVG group at its rectangle's x/y coordinates.
 * - Union the children's painted bounds after applying their placements.
 * - Derive root width, height, and viewBox from that union, with zero padding.
 * - Wrap the groups in one root <svg> with shared definitions,
 *   including GRAPH_FONT_DEFS from font.ts, once per whiteboard.
 * - Return the complete SVG markup and its measured dimensions.
 *
 * Unsupported child types should produce an explicit error until implemented.
 * Spec generation and uploading the finished SVG remain outside the renderer.
 */

/**
 * Whiteboard layout: allocate space for children independently of their type.
 *
 * Planned function:
 *   layoutWhiteboard(spec, options) -> { children }
 *
 * Each child placement: { childIndex, x, y, width, height }.
 * All dimensions use the root SVG's coordinate system.
 *
 * Initial layout rules:
 * - single: exactly one child fills the available content rectangle.
 * - split: exactly two children share the available width with a gap.
 * - stack: two or more children occupy rows separated by gaps.
 *
 * Account for internal gaps when allocating child rectangles. Add no outer
 * padding: the client owns that spacing. Layout constraints may start with
 * explicit dimensions and equal columns/rows. Reject invalid allocations or
 * child counts.
 *
 * Allocations guide layout; they are not the final export dimensions. The
 * compositor measures the placed content's painted bounds and wraps the root
 * SVG tightly around their union. See DESIGN.md / Tight export bounds.
 *
 * This module handles board placement. Each renderer handles its own internal
 * layout, such as the space needed for its title, axes, and legend.
 */

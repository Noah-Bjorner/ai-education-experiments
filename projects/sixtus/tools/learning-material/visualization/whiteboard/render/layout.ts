/**
 * Whiteboard layout: allocate space for children independently of their type.
 *
 * Planned function:
 *   layoutWhiteboard(spec, options) -> { width, height, children }
 *
 * Each child placement: { childIndex, x, y, width, height }.
 * All dimensions use the root SVG's coordinate system.
 *
 * Initial layout rules:
 * - single: exactly one child fills the available content rectangle.
 * - split: exactly two children share the available width with a gap.
 * - stack: two or more children occupy rows separated by gaps.
 *
 * Account for outer padding and gaps before allocating child rectangles.
 * Start with explicit canvas dimensions and equal columns/rows; content-based
 * sizing can be added later. Reject invalid dimensions or child counts.
 *
 * This module handles board placement. Each renderer handles its own internal
 * layout, such as the space needed for its title, axes, and legend.
 */

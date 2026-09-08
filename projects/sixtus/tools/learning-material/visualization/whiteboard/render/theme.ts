/** Shared whiteboard colors. See DESIGN.md for usage and layout rules. */
export const COLORS = {
  ink: "#111111", // Primary text, axes, outlines, and connectors.
  textMuted: "#909090", // Ticks, secondary values, and supporting labels.
  grid: "#dadad9", // Quiet reference lines, never the main data marks.
} as const;

/** Ordered categorical accents. These colors carry no intrinsic meaning. */
export const SERIES_COLORS = [
  "#3c82f6", // Blue.
  "#f59e0c", // Orange.
  "#ef4444", // Red.
  "#34c759", // Green.
  "#ffd608", // Yellow.
  "#8e8e93", // Gray.
] as const;

/** Same accent for both layers; borders keep their own full-strength color. */
export const FILL_STYLE = {
  backgroundOpacity: 0.05,
  hatchOpacity: 0.5,
} as const;

// There is deliberately no background color: exported SVGs are transparent.

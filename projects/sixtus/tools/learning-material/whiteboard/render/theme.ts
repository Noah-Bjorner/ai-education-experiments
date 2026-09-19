/** Shared hand steadiness. 0 = clean, 0.7 = steady, 1.5 = natural, 3 = loose.
 * Override with renderWhiteboardSvg(spec, { roughness }) for a single board.
 */
export const HAND_DRAWING = { roughness: 2.75 };

/** Semantic sizes in SVG units. Font family/weight live in font.ts. */
export const TYPE_SCALE = {
  boardTitle: 32,
  figureTitle: 25,
  body: 22,
  label: 16,
  supporting: 13,
  detail: 12,
  annotation: 16,
  mathDisplay: 36,
} as const;

/** Baseline spacing, shared by wrapping, measurement, and drawing. */
export const LINE_HEIGHT = {
  boardTitle: 42,
  figureTitle: 34,
  body: 30,
  label: 22,
  supporting: 18,
  detail: 16,
  annotation: 22,
  mathDisplay: 48,
} as const satisfies Record<keyof typeof TYPE_SCALE, number>;

/** Distinct relationships may share a value without sharing a setting. */
export const SPACING = {
  boardTitleGap: 32,
  figureGap: 32,
  figureTitleGap: 24,
  cardPadding: 16,
  labelGap: 8,
  labelClearance: 4,
  legendItemGap: 32,
  legendRowGap: 8,
  sectionGap: 24,
  mathRowGap: 24,
  titleUnderlineGap: 3,
  titleBoxPadding: 5,
} as const;

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

/** Text cards share sizing; roles only change border and text colors. */
export const TEXT_FIGURE_STYLE = {
  fontSize: TYPE_SCALE.label,
  lineHeight: LINE_HEIGHT.label,
  padding: SPACING.titleBoxPadding * 2,
  strokeWidth: 2,
  roles: {
    note: { border: SERIES_COLORS[5], text: SERIES_COLORS[5] },
    question: { border: SERIES_COLORS[0], text: SERIES_COLORS[0] },
    takeaway: { border: SERIES_COLORS[3], text: SERIES_COLORS[3] },
  },
} as const;

/** Same accent for both layers; borders keep their own full-strength color. */
export const FILL_STYLE = {
  backgroundOpacity: 0.05,
  hatchOpacity: 0.5,
} as const;

// There is deliberately no background color: exported SVGs are transparent.

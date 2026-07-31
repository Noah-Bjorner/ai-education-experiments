# Design Guidelines

## Titles
- Center align at the top of the page 

## Colors
- Chrome roles live in `SVG_COLORS` (`shared/theme.ts`): `background`, `text`, `textMuted`, `axis`, `tick`, `divider`, `border`, `seriesStroke`.
- Data series use `SERIES_COLORS` — an ordered accent list (primary → …). Cycle by index; do not hardcode series hex in renderers.
- Do not invent one-off hex values in renderers; add a named role or accent instead.

## Typography

## Indicators
- Place color indicators in the bottom-left corner as 1:1 squares

## Size
- Size the svg based on its contents, like in xy-charts.

## Border radius
- Chrome sizes (including bar corner radius) scale with the SVG viewBox width via `SVG_SIZE_RATIOS` / `createSvgDesignScale` in `shared/theme.ts`.
- Tweak `barRadius` there (authored against `SVG_DESIGN_WIDTH = 1200`). Current placeholder: `8 / SVG_DESIGN_WIDTH`.
- Apply border radius only to filled shapes like bars — not to dots, markers, or straight line series.
- On bars, round only the free end away from the zero/baseline (top for positive values, bottom for negative). Keep the baseline end square.

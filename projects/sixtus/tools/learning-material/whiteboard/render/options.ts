import { HAND_DRAWING } from "./theme.ts";
import { renderError, type RenderIssue } from "./issues.ts";

/** Allocations may grow to this multiple of the requested size before content is rejected. */
export const ALLOCATION_GROWTH = {
  maxScale: 2,
  /** Used when a renderer reports "grow" without an exact requirement. */
  step: 1.25,
  maxAttempts: 4,
} as const;

export type FigureRenderOptions = {
  id: string;
  /** Preferred allocation. Content that needs more room grows it up to the ceiling. */
  width?: number;
  height?: number;
  /** Ceiling for growth. Defaults to `ALLOCATION_GROWTH.maxScale` × the preferred size. */
  maxWidth?: number;
  maxHeight?: number;
  /** Hand imperfection: 0 clean, 0.7 steady, 1.5 natural, 3 loose. */
  roughness?: number;
  hatchGap?: number;
  seed?: number;
  onDiagnostic?: (issue: RenderIssue) => void;
};

export function resolveFigureOptions(options: FigureRenderOptions) {
  const width = options.width ?? 800;
  const height = options.height ?? 520;
  const resolved = {
    id: options.id,
    width,
    height,
    maxWidth: options.maxWidth ?? width * ALLOCATION_GROWTH.maxScale,
    maxHeight: options.maxHeight ?? height * ALLOCATION_GROWTH.maxScale,
    roughness: options.roughness ?? HAND_DRAWING.roughness,
    hatchGap: options.hatchGap ?? 9,
    seed: options.seed ?? 10,
    onDiagnostic: options.onDiagnostic,
  };
  if (
    !/^[a-zA-Z][\w-]*$/.test(resolved.id) ||
    ![
      resolved.width,
      resolved.height,
      resolved.maxWidth,
      resolved.maxHeight,
      resolved.roughness,
      resolved.hatchGap,
      resolved.seed,
    ].every(Number.isFinite) ||
    resolved.width <= 0 || resolved.height <= 0 ||
    resolved.maxWidth < resolved.width ||
    resolved.maxHeight < resolved.height ||
    resolved.roughness < 0 || resolved.hatchGap < 2
  ) {
    throw renderError(
      "INVALID_OPTIONS",
      "Rendering options require a simple SVG id, finite positive dimensions, a ceiling no smaller than the allocation, roughness >= 0, and hatchGap >= 2.",
      { stage: "validation" },
    );
  }
  return resolved;
}

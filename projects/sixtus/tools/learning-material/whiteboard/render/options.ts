import { renderError, type RenderIssue } from "./issues.ts";

export type FigureRenderOptions = {
  id: string;
  width?: number;
  height?: number;
  roughness?: number;
  hatchGap?: number;
  seed?: number;
  onDiagnostic?: (issue: RenderIssue) => void;
};

export function resolveFigureOptions(options: FigureRenderOptions) {
  const resolved = {
    id: options.id,
    width: options.width ?? 800,
    height: options.height ?? 520,
    roughness: options.roughness ?? 1.5,
    hatchGap: options.hatchGap ?? 9,
    seed: options.seed ?? 10,
    onDiagnostic: options.onDiagnostic,
  };
  if (
    !/^[a-zA-Z][\w-]*$/.test(resolved.id) ||
    ![
      resolved.width,
      resolved.height,
      resolved.roughness,
      resolved.hatchGap,
      resolved.seed,
    ].every(Number.isFinite) ||
    resolved.width <= 0 || resolved.height <= 0 || resolved.roughness < 0 ||
    resolved.hatchGap < 2
  ) {
    throw renderError(
      "INVALID_OPTIONS",
      "Rendering options require a simple SVG id, finite positive dimensions, roughness >= 0, and hatchGap >= 2.",
      { stage: "validation" },
    );
  }
  return resolved;
}

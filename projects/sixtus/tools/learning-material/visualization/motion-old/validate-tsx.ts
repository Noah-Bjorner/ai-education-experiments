import * as esbuild from "esbuild";
import {
  extractTsxSource,
  fixKnownEasingMistakes,
  validateGeneratedTsx,
  type TsxValidationResult,
} from "../../../../helper/remotion/prepare-tsx-shared.ts";

export {
  extractTsxSource,
  fixKnownEasingMistakes,
  validateGeneratedTsx,
  type TsxValidationResult,
};

function validateSyntax(tsx: string): string | null {
  try {
    esbuild.transformSync(tsx, {
      loader: "tsx",
      jsx: "automatic",
      logLevel: "silent",
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function validateGeneratedTsxForRender(raw: string): TsxValidationResult {
  const result = validateGeneratedTsx(raw);
  if (!result.ok) {
    return result;
  }

  const syntaxError = validateSyntax(result.tsx);
  if (syntaxError) {
    return {
      ok: false,
      errors: [`TSX syntax check failed: ${syntaxError}`],
    };
  }

  return result;
}

const REMOTION_BINDINGS = [
  "AbsoluteFill",
  "Audio",
  "Easing",
  "Freeze",
  "Img",
  "Loop",
  "OffthreadVideo",
  "Sequence",
  "Series",
  "Video",
  "cancelRender",
  "continueRender",
  "delayRender",
  "getInputProps",
  "interpolate",
  "interpolateColors",
  "random",
  "spring",
  "staticFile",
  "useCurrentFrame",
  "useCurrentScale",
  "useVideoConfig",
] as const;

function stripMarkdownCodeFence(source: string): string {
  const trimmed = source.trim();
  const match = trimmed.match(
    /^```(?:tsx|typescript|ts|jsx|javascript|js)?\s*\n([\s\S]*?)\n```$/,
  );

  return match ? match[1].trim() : trimmed;
}

function removeRuntimeImports(source: string): string {
  const importFromRegex =
    /(^|\n)\s*import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];?/g;

  const withoutRuntimeImports = source.replace(
    importFromRegex,
    (match, _leadingNewline: string, _importClause: string, moduleName: string) => {
      if (
        moduleName === "react" ||
        moduleName === "remotion" ||
        moduleName === "@remotion/media"
      ) {
        return "\n";
      }

      return match;
    },
  );

  const sideEffectImportRegex =
    /(^|\n)\s*import\s+["'](react|remotion|@remotion\/media)["'];?/g;

  return withoutRuntimeImports.replace(sideEffectImportRegex, "\n");
}

function removeRuntimePreamble(source: string): string {
  const preambleRegex =
    /const runtime = globalThis\.__REMOTION_REMOTE_RUNTIME__;[\s\S]*?(?=\n(?:export|const|function|type|interface)\b)/;

  return source.replace(preambleRegex, "");
}

function buildImportBlock(source: string): string {
  const usedRemotionBindings = REMOTION_BINDINGS.filter((binding) =>
    new RegExp(`\\b${binding}\\b`).test(source)
  );

  const reactHooks = ["useMemo", "useState", "useEffect", "useCallback", "useRef"]
    .filter((hook) => new RegExp(`\\b${hook}\\b`).test(source));

  const lines = ['import React from "react";'];

  if (reactHooks.length > 0) {
    lines.push(`import { ${reactHooks.join(", ")} } from "react";`);
  }

  if (usedRemotionBindings.length > 0) {
    lines.push(
      `import { ${usedRemotionBindings.join(", ")} } from "remotion";`,
    );
  }

  return `${lines.join("\n")}\n\n`;
}

export function prepareTsxForRender(rawTsx: string): string {
  let source = stripMarkdownCodeFence(rawTsx);
  source = removeRuntimePreamble(source);
  source = removeRuntimeImports(source).trim();

  if (!source) {
    throw new Error("Remotion TSX source is empty after preprocessing.");
  }

  if (!/export\s+default\s+/m.test(source)) {
    throw new Error(
      "Remotion TSX must default-export the video component (RemotionVideo).",
    );
  }

  return `${buildImportBlock(source)}${source}\n`;
}

import {
  extractTsxSource,
  fixKnownEasingMistakes,
  validateGeneratedTsx,
} from "../../../../helper/remotion/prepare-tsx-shared.ts";

const ALLOWED_MODULES = new Set(["react", "remotion"]);
const ALLOWED_MODULE_PREFIXES = ["@remotion/"];

function removeRuntimePreamble(source: string): string {
  const preambleRegex =
    /const runtime = globalThis\.__REMOTION_REMOTE_RUNTIME__;[\s\S]*?(?=\n(?:export|const|function|type|interface)\b)/;

  return source.replace(preambleRegex, "");
}

function isAllowedModule(moduleName: string): boolean {
  if (ALLOWED_MODULES.has(moduleName)) {
    return true;
  }

  return ALLOWED_MODULE_PREFIXES.some((prefix) => moduleName.startsWith(prefix));
}

function collectDisallowedImports(source: string): string[] {
  const disallowed = new Set<string>();
  const importFromRegex =
    /(^|\n)\s*import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];?/g;
  const sideEffectImportRegex =
    /(^|\n)\s*import\s+["']([^"']+)["'];?/g;

  for (const match of source.matchAll(importFromRegex)) {
    const moduleName = match[3];

    if (!isAllowedModule(moduleName)) {
      disallowed.add(moduleName);
    }
  }

  for (const match of source.matchAll(sideEffectImportRegex)) {
    const moduleName = match[2];

    if (!isAllowedModule(moduleName)) {
      disallowed.add(moduleName);
    }
  }

  return [...disallowed];
}

function hasDefaultExport(source: string): boolean {
  return /export\s+default\s+/m.test(source);
}

export function prepareTsxForRender(rawTsx: string): string {
  const { tsx: extracted } = extractTsxSource(rawTsx);
  let source = fixKnownEasingMistakes(removeRuntimePreamble(extracted)).trim();

  if (!source) {
    throw new Error("Remotion TSX source is empty after preprocessing.");
  }

  const validation = validateGeneratedTsx(source);
  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }

  source = validation.tsx;

  const disallowedImports = collectDisallowedImports(source);

  if (disallowedImports.length > 0) {
    throw new Error(
      `Disallowed imports: ${
        disallowedImports.join(", ")
      }. Only react, remotion, and @remotion/* modules are permitted.`,
    );
  }

  if (!hasDefaultExport(source)) {
    throw new Error(
      "Remotion TSX must default-export the video component (RemotionVideo).",
    );
  }

  return `${source}\n`;
}

export {
  extractTsxSource,
  fixKnownEasingMistakes,
  validateGeneratedTsx,
};

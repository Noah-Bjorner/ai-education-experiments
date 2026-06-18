const ALLOWED_MODULES = new Set(["react", "remotion"]);
const ALLOWED_MODULE_PREFIXES = ["@remotion/"];

const IMPORT_FROM_REGEX =
  /(^|\n)\s*import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];?/g;

const SIDE_EFFECT_IMPORT_REGEX =
  /(^|\n)\s*import\s+["']([^"']+)["'];?/g;

function stripMarkdownCodeFence(source: string): string {
  const trimmed = source.trim();
  const match = trimmed.match(
    /^```(?:tsx|typescript|ts|jsx|javascript|js)?\s*\n([\s\S]*?)\n```$/,
  );

  return match ? match[1].trim() : trimmed;
}

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

  for (const match of source.matchAll(IMPORT_FROM_REGEX)) {
    const moduleName = match[3];

    if (!isAllowedModule(moduleName)) {
      disallowed.add(moduleName);
    }
  }

  for (const match of source.matchAll(SIDE_EFFECT_IMPORT_REGEX)) {
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
  let source = stripMarkdownCodeFence(rawTsx);
  source = removeRuntimePreamble(source).trim();

  if (!source) {
    throw new Error("Remotion TSX source is empty after preprocessing.");
  }

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

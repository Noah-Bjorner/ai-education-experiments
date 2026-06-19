const ALLOWED_MODULES = new Set(["react", "remotion"]);
const ALLOWED_MODULE_PREFIXES = ["@remotion/"];

const IMPORT_FROM_REGEX =
  /(^|\n)\s*import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];?/g;

const SIDE_EFFECT_IMPORT_REGEX =
  /(^|\n)\s*import\s+["']([^"']+)["'];?/g;

const CODE_FENCE_PATTERN =
  /```(?:tsx|typescript|ts|jsx|javascript|js)?\s*\n([\s\S]*?)```/;

const REQUIRED_METADATA_CONSTANTS = [
  "WIDTH",
  "HEIGHT",
  "FPS",
  "DURATION_IN_FRAMES",
] as const;

const INVALID_STRING_EASING_PATTERN =
  /Easing\.(out|in|inOut)\(\s*["']/;

const EXPLANATION_PATTERN = /\*\*Explanation:\*\*/;

const MAX_GENERATED_TSX_LENGTH = 120_000;

export function extractTsxSource(raw: string): { tsx: string; issues: string[] } {
  const issues: string[] = [];
  const trimmed = raw.trim();

  if (!trimmed) {
    return { tsx: "", issues: ["TSX source is empty."] };
  }

  const fenceMatch = trimmed.match(CODE_FENCE_PATTERN);
  if (fenceMatch) {
    const trailingContent = trimmed
      .slice(trimmed.indexOf(fenceMatch[0]) + fenceMatch[0].length)
      .trim();

    if (trailingContent.length > 0) {
      issues.push(
        "Response included commentary after the code block; only TSX should be returned.",
      );
    }

    return { tsx: sanitizeExtractedTsx(fenceMatch[1]), issues };
  }

  if (trimmed.includes("```")) {
    issues.push(
      "Response contains markdown code fences that could not be parsed.",
    );
  }

  return { tsx: sanitizeExtractedTsx(trimmed), issues };
}

function sanitizeExtractedTsx(source: string): string {
  let tsx = source.trim();

  const explanationMatch = tsx.match(/\n\*\*Explanation:\*\*[\s\S]*$/);
  if (explanationMatch?.index !== undefined) {
    tsx = tsx.slice(0, explanationMatch.index).trim();
  }

  return tsx;
}

export function fixKnownEasingMistakes(source: string): string {
  return source
    .replace(
      /Easing\.out\(\s*["'](\w+)["']\s*\)/g,
      "Easing.out(Easing.$1)",
    )
    .replace(
      /Easing\.in\(\s*["'](\w+)["']\s*\)/g,
      "Easing.in(Easing.$1)",
    )
    .replace(
      /Easing\.inOut\(\s*["'](\w+)["']\s*\)/g,
      "Easing.inOut(Easing.$1)",
    );
}

function isAllowedModule(moduleName: string): boolean {
  if (ALLOWED_MODULES.has(moduleName)) {
    return true;
  }

  return ALLOWED_MODULE_PREFIXES.some((prefix) => moduleName.startsWith(prefix));
}

export function collectDisallowedImports(source: string): string[] {
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

export function hasDefaultExport(source: string): boolean {
  return /export\s+default\s+/m.test(source);
}

function hasRequiredMetadataConstant(source: string, name: string): boolean {
  return new RegExp(
    `(?:^|\\n)\\s*(?:export\\s+)?const\\s+${name}\\s*(?::\\s*number)?\\s*=\\s*\\d+`,
    "m",
  ).test(source);
}

function appearsTruncated(source: string): boolean {
  const trimmed = source.trim();

  if (/=\s*"[^"\n]*$/.test(trimmed)) {
    return true;
  }

  if (/=\s*`[^`\n]*$/.test(trimmed)) {
    return true;
  }

  if (trimmed.endsWith(",") || trimmed.endsWith("=")) {
    return true;
  }

  return false;
}

export type TsxValidationResult =
  | { ok: true; tsx: string }
  | { ok: false; errors: string[] };

export function validateGeneratedTsx(raw: string): TsxValidationResult {
  const { tsx: extracted, issues } = extractTsxSource(raw);
  const tsx = fixKnownEasingMistakes(extracted);
  const errors = [...issues];

  if (!tsx) {
    errors.push("TSX source is empty after extraction.");
  }

  if (tsx.includes("```")) {
    errors.push("Extracted TSX still contains markdown fence markers.");
  }

  if (EXPLANATION_PATTERN.test(tsx)) {
    errors.push("Extracted TSX contains trailing explanation text.");
  }

  if (tsx.length > MAX_GENERATED_TSX_LENGTH) {
    errors.push(
      `Generated TSX exceeds ${MAX_GENERATED_TSX_LENGTH} characters and is likely too large to render reliably.`,
    );
  }

  for (const constant of REQUIRED_METADATA_CONSTANTS) {
    if (!hasRequiredMetadataConstant(tsx, constant)) {
      errors.push(`Missing required metadata constant ${constant}.`);
    }
  }

  if (!hasDefaultExport(tsx)) {
    errors.push(
      "Remotion TSX must default-export the video component (RemotionVideo).",
    );
  }

  const disallowedImports = collectDisallowedImports(tsx);
  if (disallowedImports.length > 0) {
    errors.push(
      `Disallowed imports: ${disallowedImports.join(", ")}. Only react, remotion, and @remotion/* modules are permitted.`,
    );
  }

  if (INVALID_STRING_EASING_PATTERN.test(tsx)) {
    errors.push(
      'Uses invalid string-based Easing helper. Use Easing.out(Easing.cubic) instead of Easing.out("cubic").',
    );
  }

  if (appearsTruncated(tsx)) {
    errors.push(
      "Generated TSX appears truncated (unclosed string or incomplete statement).",
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, tsx };
}

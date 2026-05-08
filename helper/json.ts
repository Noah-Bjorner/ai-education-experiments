import { z } from "@zod";

export function parseJsonFromTextSafely<T = unknown>(
  text: string,
): T | undefined {
  if (!text) return undefined;
  let cleaned = text.trim();

  // Strip fenced code blocks like ```json ... ``` or ``` ... ```.
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
    cleaned = cleaned.replace(/```\s*$/i, "");
    cleaned = cleaned.trim();
  }

  // Drop any descriptive preamble before the JSON object.
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace > 0) {
    cleaned = cleaned.slice(firstBrace);
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fall through to extracting the first balanced JSON object.
  }

  const start = cleaned.indexOf("{");
  if (start === -1) return undefined;

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (ch === "\\") {
        escapeNext = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = cleaned.slice(start, i + 1);
        try {
          return JSON.parse(candidate) as T;
        } catch {
          // Keep scanning in case a later balanced object is valid JSON.
        }
      }
    }
  }

  return undefined;
}

export function parseJsonWithSchemaSafely<TSchema extends z.ZodType>(
  text: string,
  schema: TSchema,
): z.infer<TSchema> | undefined {
  const parsed = parseJsonFromTextSafely<unknown>(text);
  if (parsed === undefined) return undefined;

  const result = schema.safeParse(parsed);
  return result.success ? result.data : undefined;
}

export function parseJsonWithSchema<TSchema extends z.ZodType>(
  text: string,
  schema: TSchema,
): z.infer<TSchema> {
  const parsed = parseJsonFromTextSafely<unknown>(text);
  if (parsed === undefined) {
    throw new Error("Could not parse JSON from text");
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Parsed JSON did not match schema: ${result.error.message}`);
  }

  return result.data;
}

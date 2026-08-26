import {
  citationRefPattern,
  groundedContextSchema,
  SOURCE_PRODUCING_TOOL_PART_TYPES,
  type CitationSource,
  type GroundedContext,
} from "./schema.ts";

export function parseGroundedContext(output: unknown): GroundedContext | undefined {
  const parsed = groundedContextSchema.safeParse(output);
  return parsed.success ? parsed.data : undefined;
}

export function collectCitationSourcesFromToolResults(
  results: ReadonlyArray<{ toolName: string; output: unknown }>,
): CitationSource[] {
  const sources: CitationSource[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    if (
      result.toolName !== "gatherContext" &&
      result.toolName !== "searchLibraryContext"
    ) {
      continue;
    }

    const context = parseGroundedContext(result.output);
    if (!context) continue;
    pushUniqueSources(sources, seen, context.sources);
  }

  return sources;
}

export function collectCitationSourcesFromMessages(
  messages: ReadonlyArray<{ parts: ReadonlyArray<unknown> }>,
): CitationSource[] {
  const sources: CitationSource[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    for (const part of message.parts) {
      if (!isSourceToolPart(part)) continue;
      const context = parseGroundedContext(part.output);
      if (!context) continue;
      pushUniqueSources(sources, seen, context.sources);
    }
  }

  return sources;
}

export function listCitationRefs(text: string): string[] {
  return [...text.matchAll(citationRefPattern())].map(
    (match) => match[1]!,
  );
}

export function partitionCitationRefs(
  text: string,
  sources: CitationSource[],
): {
  resolved: CitationSource[];
  unresolved: string[];
} {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const resolved: CitationSource[] = [];
  const unresolved: string[] = [];
  const seenResolved = new Set<string>();
  const seenUnresolved = new Set<string>();

  for (const id of listCitationRefs(text)) {
    const source = sourceById.get(id);
    if (!source) {
      if (!seenUnresolved.has(id)) {
        seenUnresolved.add(id);
        unresolved.push(id);
      }
      continue;
    }
    if (!seenResolved.has(source.id)) {
      seenResolved.add(source.id);
      resolved.push(source);
    }
  }

  return { resolved, unresolved };
}

function pushUniqueSources(
  target: CitationSource[],
  seen: Set<string>,
  sources: CitationSource[],
): void {
  for (const source of sources) {
    if (seen.has(source.id)) continue;
    seen.add(source.id);
    target.push(source);
  }
}

function isSourceToolPart(
  part: unknown,
): part is { type: string; state: string; output: unknown } {
  if (typeof part !== "object" || part === null) return false;
  const record = part as Record<string, unknown>;
  return (
    typeof record.type === "string" &&
    (SOURCE_PRODUCING_TOOL_PART_TYPES as readonly string[]).includes(
      record.type,
    ) &&
    record.state === "output-available"
  );
}

import { z } from "@zod";

export const CITATION_KINDS = [
  "web",
  "video",
  "library",
  "user-document",
] as const;

export type CitationKind = typeof CITATION_KINDS[number];

export const citationLocatorSchema = z.object({
  label: z.string().min(1),
});

export const citationSourceSchema = z.object({
  id: z.string().min(1).describe(
    "Opaque server-generated id. Use this exact value in <citation ref=\"...\" />.",
  ),
  kind: z.enum(CITATION_KINDS),
  title: z.string().min(1),
  url: z.string().url().optional(),
  excerpt: z.string().min(1),
  locator: citationLocatorSchema.optional(),
});

export const groundedContextSchema = z.object({
  content: z.string().describe(
    "Concise grounding material for the tutor. Not learner-facing.",
  ),
  sources: z.array(citationSourceSchema),
});

export type CitationLocator = z.infer<typeof citationLocatorSchema>;
export type CitationSource = z.infer<typeof citationSourceSchema>;
export type GroundedContext = z.infer<typeof groundedContextSchema>;

export const CITATION_REF_PATTERN = /<citation\s+ref="([^"]+)"\s*\/>/g;

export function citationRefPattern(): RegExp {
  return /<citation\s+ref="([^"]+)"\s*\/>/g;
}

export const SOURCE_PRODUCING_TOOL_NAMES = [
  "gatherContext",
  "searchLibraryContext",
] as const;

export type SourceProducingToolName =
  typeof SOURCE_PRODUCING_TOOL_NAMES[number];

export const SOURCE_PRODUCING_TOOL_PART_TYPES = SOURCE_PRODUCING_TOOL_NAMES.map(
  (name) => `tool-${name}` as const,
);

const MAX_TOOL_CALL_ID_CHARS = 48;

export function createCitationId(toolCallId: string, index: number): string {
  const safe = toolCallId.replace(/[^a-zA-Z0-9_-]/g, "").slice(
    0,
    MAX_TOOL_CALL_ID_CHARS,
  ) || "call";
  return `src_${safe}_${index}`;
}

export function assignCitationIds(
  drafts: Array<Omit<CitationSource, "id">>,
  toolCallId: string,
): CitationSource[] {
  return drafts.map((draft, index) => ({
    ...draft,
    id: createCitationId(toolCallId, index + 1),
  }));
}

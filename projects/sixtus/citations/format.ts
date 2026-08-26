import {
  citationRefPattern,
  type CitationSource,
  type GroundedContext,
} from "./schema.ts";

export function formatGroundedContextForModel(
  context: GroundedContext,
): string {
  const sections = [
    context.content.trim() || "(no grounding content)",
  ];

  if (context.sources.length === 0) {
    sections.push(
      "",
      "Sources: none. Do not invent citations, URLs, or source ids.",
    );
    return sections.join("\n");
  }

  sections.push(
    "",
    "Sources (cite with <citation ref=\"SOURCE_ID\" /> using an exact id below):",
  );

  for (const source of context.sources) {
    sections.push(formatSourceBlock(source));
  }

  return sections.join("\n");
}

export function groundedContextToModelOutput(context: GroundedContext) {
  return {
    type: "content" as const,
    value: [{ type: "text" as const, text: formatGroundedContextForModel(context) }],
  };
}

export function rewriteDocumentCitations(
  markdown: string,
  sources: CitationSource[],
): string {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const cited: CitationSource[] = [];
  const numberById = new Map<string, number>();

  const withoutLegacySources = stripGeneratedSourcesSection(markdown);
  const rewritten = withoutLegacySources.replaceAll(
    citationRefPattern(),
    (fullMatch, rawId: string) => {
      const source = sourceById.get(rawId);
      if (!source) return "";

      let number = numberById.get(source.id);
      if (number === undefined) {
        number = cited.length + 1;
        numberById.set(source.id, number);
        cited.push(source);
      }
      return `[${number}]`;
    },
  );

  const body = rewritten.replace(/\n{3,}/g, "\n\n").trimEnd();
  if (cited.length === 0) return body;

  const footer = [
    "",
    "## Sources",
    ...cited.map((source, index) => formatDocumentSourceLine(index + 1, source)),
  ].join("\n");

  return `${body}\n${footer}\n`;
}

function formatSourceBlock(source: CitationSource): string {
  const lines = [
    "",
    `- id: ${source.id}`,
    `  kind: ${source.kind}`,
    `  title: ${source.title}`,
  ];
  if (source.url) lines.push(`  url: ${source.url}`);
  if (source.locator?.label) lines.push(`  locator: ${source.locator.label}`);
  lines.push(`  excerpt: ${source.excerpt}`);
  return lines.join("\n");
}

function formatDocumentSourceLine(index: number, source: CitationSource): string {
  if (source.url) return `${index}. [${escapeMarkdownLabel(source.title)}](${source.url})`;
  return `${index}. ${source.title}`;
}

function escapeMarkdownLabel(value: string): string {
  return value.replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function stripGeneratedSourcesSection(markdown: string): string {
  return markdown.replace(/\n## Sources\s*\n[\s\S]*$/u, "\n").trimEnd();
}

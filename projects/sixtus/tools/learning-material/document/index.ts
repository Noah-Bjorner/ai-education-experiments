import "@std/dotenv/load";
import {
  generateText,
  isStepCount,
  Output,
  tool,
  type UIToolInvocation,
} from "@ai";
import { z } from "@zod";

import { collectCitationSourcesFromToolResults } from "../../../citations/extract.ts";
import { rewriteDocumentCitations } from "../../../citations/format.ts";
import { uploadDocument } from "../../../../../lib/cloudflare.ts";
import { gatherContextTool } from "../../gather-context/index.ts";
import { visualizationTool } from "../visualization/index.ts";
import {
  buildDocumentSystemPrompt,
  DOCUMENT_TYPES,
  type DocumentType,
} from "./prompt.ts";

export { DOCUMENT_TYPES, type DocumentType };

export const DOCUMENT_TOOL_DESCRIPTION =
  "Create a reusable, self-contained written learning resource.";

export const DOCUMENT_SYSTEM_PROMPT_DESCRIPTION = [
  "Use when the learner would benefit from a written resource they can study, reference, or revisit.",
  "Choose the type that best matches the need:",
  "  - studyGuide: guide the learner through what to learn, practice, and review.",
  "  - cheatSheet: make key information quick and easy to find.",
  "  - deepResearch: explore a topic in depth and synthesize the findings into a clear report.",
  "  - primer: give a newcomer a clear and concise foundation for understanding a topic.",
  "  - miscellaneous: create another requested written document that does not fit the types above.",
  "Pass a self-contained instruction describing the topic, learning goal, scope, relevant learner context, and any constraints.",
].join("\n");

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

const DOCUMENT_GENERATOR_MODEL = "openai/gpt-5.6-sol" as const;
const DOCUMENT_GENERATOR_REASONING = "medium" as const;
const MAX_DOCUMENT_GENERATION_STEPS = 12;
const DOCUMENT_UPLOAD_PREFIX = "sixtus/learning-material/documents";

const documentAgentOutputSchema = z.object({
  title: z.string().min(1).describe("Concise learner-facing title for the document."),
  description: z.string().min(1).describe(
    "One or two sentences summarizing what the document covers.",
  ),
  markdown: z.string().min(1).describe(
    "Full markdown document body, starting with an H1 title.",
  ),
});

export const documentInputSchema = z.object({
  type: documentTypeSchema.describe("The kind of learning document to create."),
  instruction: z.string().min(1).describe(
    "A self-contained brief for what to write: topic, audience, scope, and any constraints.",
  ),
});

export const documentOutputSchema = z.object({
  type: documentTypeSchema.describe("The type of document that was created."),
  title: z.string().min(1).describe("Learner-facing title for the document."),
  description: z.string().min(1).describe(
    "Short learner-facing summary of the document.",
  ),
  url: z.string().min(1).describe("Public URL of the uploaded markdown file."),
});

export type CreateDocumentOptions = z.infer<typeof documentInputSchema>;
export type DocumentToolOutput = z.infer<typeof documentOutputSchema>;

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "document";
}

function buildDocumentFileName(title: string): string {
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${slugifyTitle(title)}-${suffix}`;
}

async function generateDocumentContent(
  options: CreateDocumentOptions,
): Promise<z.infer<typeof documentAgentOutputSchema>> {
  const result = await generateText({
    model: DOCUMENT_GENERATOR_MODEL,
    reasoning: DOCUMENT_GENERATOR_REASONING,
    system: buildDocumentSystemPrompt(options.type),
    prompt: options.instruction,
    tools: {
      gatherContext: gatherContextTool,
      visualization: visualizationTool,
    },
    stopWhen: isStepCount(MAX_DOCUMENT_GENERATION_STEPS),
    prepareStep: ({ stepNumber }) => stepNumber === MAX_DOCUMENT_GENERATION_STEPS - 1 ? { toolChoice: "none" } : {},
    output: Output.object({
      schema: documentAgentOutputSchema,
      name: "learning_document",
      description: "Title, short description, and full markdown body for the learning document.",
    }),
  });

  if (!result.output) {
    throw new Error("Document generation produced no structured output.");
  }

  const sources = collectCitationSourcesFromToolResults(result.staticToolResults);
  return {
    ...result.output,
    markdown: rewriteDocumentCitations(result.output.markdown, sources),
  };
}

async function uploadMarkdownDocument(
  title: string,
  markdown: string,
): Promise<string> {
  const name = buildDocumentFileName(title);
  return await uploadDocument(
    new Blob([markdown], { type: "text/markdown; charset=utf-8" }),
    `${name}.md`,
    {
      prefix: DOCUMENT_UPLOAD_PREFIX,
      name,
    },
  );
}

export async function createDocument(
  options: CreateDocumentOptions,
): Promise<DocumentToolOutput> {
  const content = await generateDocumentContent(options);
  const url = await uploadMarkdownDocument(content.title, content.markdown);

  return documentOutputSchema.parse({
    type: options.type,
    title: content.title,
    description: content.description,
    url,
  });
}

export const documentTool = tool({
  description: DOCUMENT_TOOL_DESCRIPTION,
  inputSchema: documentInputSchema,
  outputSchema: documentOutputSchema,
  execute: createDocument,
});

export type DocumentToolInvocation = UIToolInvocation<typeof documentTool>;

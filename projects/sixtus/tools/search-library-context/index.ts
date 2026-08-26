import { tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";

import { groundedContextToModelOutput } from "../../citations/format.ts";
import {
  assignCitationIds,
  groundedContextSchema,
  type GroundedContext,
} from "../../citations/schema.ts";
import { normalizeLibraryMatch } from "../../citations/normalize.ts";
import { searchLibrary } from "../../library/search.ts";

/* make this part of general context lookup tool */

export const SEARCH_LIBRARY_CONTEXT_TOOL_DESCRIPTION =
  "Search the learner's uploaded library for documents, websites, transcripts, and other saved materials.";
export const SEARCH_LIBRARY_CONTEXT_SYSTEM_PROMPT_DESCRIPTION =
  "Use when the learner's own library materials are relevant — uploaded files, saved websites, or transcripts. Pass a specific query. Cite returned source ids with <citation ref=\"SOURCE_ID\" />; never invent ids, titles, or URLs.";

const searchLibraryContextInputSchema = z.object({
  query: z.string().min(1).describe(
    "What to search for in the learner's library. Be specific about the facts or passages needed.",
  ),
});

export type SearchLibraryContextRuntime = {
  userId: string;
};

export function createSearchLibraryContextTool(
  runtime: SearchLibraryContextRuntime,
) {
  return tool({
    description: SEARCH_LIBRARY_CONTEXT_TOOL_DESCRIPTION,
    inputSchema: searchLibraryContextInputSchema,
    outputSchema: groundedContextSchema,
    execute: async ({ query }, { toolCallId }): Promise<GroundedContext> => {
      const matches = await searchLibrary({
        userId: runtime.userId,
        query,
      });
      const drafts = matches
        .map(normalizeLibraryMatch)
        .filter((draft): draft is NonNullable<typeof draft> => draft != null);
      const sources = assignCitationIds(drafts, toolCallId);

      if (sources.length === 0) {
        return {
          content:
            "No matching library materials were found. Do not invent library sources or citations.",
          sources: [],
        };
      }

      return {
        content: [
          `Found ${sources.length} library passage(s) for "${query.trim()}".`,
          "Use the attached source ids when a claim comes from these materials.",
        ].join(" "),
        sources,
      };
    },
    toModelOutput: ({ output }) => groundedContextToModelOutput(output),
  });
}

export type SearchLibraryContextTool = ReturnType<
  typeof createSearchLibraryContextTool
>;
export type SearchLibraryContextToolInvocation = UIToolInvocation<
  SearchLibraryContextTool
>;

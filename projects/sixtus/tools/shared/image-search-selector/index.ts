import "@std/dotenv/load";
import { generateText, Output, tool, type UIToolInvocation } from "@ai";
import { z } from "@zod";
import {
  imageSearch,
  type ImageSearchResult,
  type TimeRange,
} from "../../../../../lib/serper.ts";
import {
  defaultSelectionCriteria,
  fastImageSearchParamsPrompt,
  intelligentImageSearchParamsPrompt,
} from "./prompts.ts";

const imageSearchSelectorInputSchema = z.object({
  prompt: z.string().min(1).describe(
    "Natural-language instructions for the image to find and select.",
  ),
  mode: z.enum(["smart", "fast"]).optional().describe(
    "Use smart for more careful search-parameter generation, or fast for lower latency.",
  ),
  maxCandidates: z.number().int().min(1).max(10).optional().describe(
    "Maximum number of image search results to judge.",
  ),
  size: z.enum(["large", "medium", "icon"]).optional().describe(
    "Preferred Google Images size filter.",
  ),
  paramsModel: z.string().optional().describe(
    "Optional model id for turning instructions into image-search parameters.",
  ),
  judgeModel: z.string().optional().describe(
    "Optional vision-capable model id for judging candidate images.",
  ),
  requireDownloadable: z.boolean().optional().describe(
    "When true, only return images that can be downloaded successfully.",
  ),
});

const imageSearchSelectorOutputSchema = z.object({
  imageURL: z.string().url().describe("URL of the selected full-size image."),
  thumbnailImageURL: z.string().describe(
    "URL of the selected image thumbnail, if one was returned.",
  ),
  query: z.string().describe("Google Images query used for the search."),
  timeRange: z.enum(["day", "week", "month", "year"]).nullable().describe(
    "Recency filter used for the search, or null when no filter was used.",
  ),
  selectionCriteria: z.string().nullable().describe(
    "Criteria used by the judge model when selecting the best image.",
  ),
  judgeReasoning: z.string().describe(
    "Concise explanation for why this image was selected.",
  ),
  durationSeconds: z.number().int().nonnegative().describe(
    "Total selector runtime rounded to seconds.",
  ),
});

const queryParamsSchema = z.object({
  query: z.string().describe(
    "A concise Google Images search query derived from the instructions.",
  ),
  timeRange: z.enum(["day", "week", "month", "year"]).nullish().describe(
    "Recency filter for the image search, or null/omitted when no time restriction is needed.",
  ),
  selectionCriteria: z.string().nullish().describe(
    "Detailed criteria for judging which image best satisfies the request, if provided.",
  ),
});

type ImageQueryParams = {
  query: string;
  timeRange: TimeRange | null;
  selectionCriteria: string | null;
};

type JudgableImageCandidate = {
  candidate: ImageSearchResult;
  imagePart: { type: "file"; mediaType: "image"; data: string };
};

export type ImageSearchSelectorInput = z.infer<
  typeof imageSearchSelectorInputSchema
>;
export type ImageSearchSelectorOutput = z.infer<
  typeof imageSearchSelectorOutputSchema
>;

async function instructionsToQueryParams(
  prompt: string,
  model: string,
  mode: "smart" | "fast",
): Promise<ImageQueryParams> {
  const result = await generateText({
    model: model,
    output: Output.object({
      schema: queryParamsSchema,
      name: "image_search_query",
      description:
        "Search query, recency filter, and selection criteria for Google Images.",
    }),
    prompt: mode === "smart"
      ? intelligentImageSearchParamsPrompt(prompt)
      : fastImageSearchParamsPrompt(prompt),
  });
  return {
    query: result.output.query,
    timeRange: result.output.timeRange ?? null,
    selectionCriteria: result.output.selectionCriteria ?? null,
  };
}

async function searchCandidates(
  params: ImageQueryParams,
  maxResults: number,
  requireDownloadable: boolean,
  size: "large" | "medium" | "icon",
): Promise<ImageSearchResult[]> {
  const candidates = await imageSearch({
    q: params.query,
    num: maxResults,
    size: size,
    timeRange: params.timeRange ?? undefined,
    download: requireDownloadable,
  });
  return candidates;
}

function toJudgableImageCandidate(
  candidate: ImageSearchResult,
): JudgableImageCandidate | null {
  const judgeImageUrl = candidate.thumbnailUrl ?? candidate.url;
  if (!judgeImageUrl) {
    return null;
  }

  return {
    candidate,
    imagePart: {
      type: "file",
      mediaType: "image",
      data: judgeImageUrl,
    },
  };
}

async function judgeImage(
  prompt: string,
  selectionCriteria: string | null,
  candidates: ImageSearchResult[],
  model: string,
): Promise<{ image: ImageSearchResult; reasoning: string }> {
  if (candidates.length === 0) {
    throw new Error("No image candidates to judge");
  }

  if (candidates.length === 1) {
    return { image: candidates[0], reasoning: "ONLY ONE CANDIDATE" };
  }

  const judgableCandidates = candidates
    .map(toJudgableImageCandidate)
    .filter((candidate): candidate is JudgableImageCandidate =>
      candidate !== null
    );

  if (judgableCandidates.length === 0) {
    return { image: candidates[0], reasoning: "NO JUDGABLE CANDIDATES" };
  }

  if (judgableCandidates.length === 1) {
    return {
      image: judgableCandidates[0].candidate,
      reasoning: "ONLY ONE JUDGABLE CANDIDATE",
    };
  }

  const selectedIndexSchema = z.object({
    selectedIndex: z.number().int().min(0).max(judgableCandidates.length - 1),
    reasoning: z.string().describe(
      "A concise one-sentence explanation of why this candidate is the best match.",
    ),
  });

  let output: z.infer<typeof selectedIndexSchema>;
  try {
    const result = await generateText({
      model: model,
      reasoning: "low",
      output: Output.object({
        schema: selectedIndexSchema,
        name: "selected_image",
        description: "The index of the best candidate image for the request.",
      }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Pick the best image for this request using the selection criteria.

Request: ${prompt}

Selection criteria:
${selectionCriteria ?? defaultSelectionCriteria(prompt)}

Each candidate image is preceded by a marker like [INDEX 0]. Return the index of the best candidate and explain your choice in one concise sentence.`,
            },
            ...judgableCandidates.flatMap(({ imagePart }, index) => [
              {
                type: "text" as const,
                text: `[INDEX ${index}]`,
              },
              imagePart,
            ]),
          ],
        },
      ],
    });
    output = result.output;
  } catch {
    return {
      image: judgableCandidates[0].candidate,
      reasoning: "ERROR GENERATING OUTPUT",
    };
  }
  const selected = judgableCandidates[output.selectedIndex]?.candidate;
  if (!selected) {
    throw new Error(
      `Judge returned invalid candidate index: ${output.selectedIndex}`,
    );
  }

  return { image: selected, reasoning: output.reasoning };
}
export async function imageSearchSelector(
  input: ImageSearchSelectorInput,
): Promise<ImageSearchSelectorOutput> {
  const {
    prompt,
    paramsModel = "zai/glm-5.2-fast",
    judgeModel = "anthropic/claude-sonnet-5",
    requireDownloadable = false,
    mode = "fast",
    maxCandidates = 6,
    size = "large",
  } = input;
  const start = performance.now();
  const params = await instructionsToQueryParams(prompt, paramsModel, mode);
  const candidates = await searchCandidates(
    params,
    maxCandidates,
    requireDownloadable,
    size,
  );
  const selected = await judgeImage(
    prompt,
    params.selectionCriteria,
    candidates,
    judgeModel,
  );
  const end = performance.now();
  const durationSeconds = Math.round((end - start) / 1000);
  return {
    imageURL: selected.image.url,
    thumbnailImageURL: selected.image.thumbnailUrl ?? "",
    query: params.query,
    timeRange: params.timeRange,
    selectionCriteria: params.selectionCriteria,
    judgeReasoning: selected.reasoning,
    durationSeconds: durationSeconds,
  };
}

export const imageSearchSelectorTool = tool({
  description:
    "Find and select the best image for a natural-language request using Google Images search and visual judging.",
  inputSchema: imageSearchSelectorInputSchema,
  outputSchema: imageSearchSelectorOutputSchema,
  execute: imageSearchSelector,
});

export type ImageSearchSelectorToolInvocation = UIToolInvocation<
  typeof imageSearchSelectorTool
>;

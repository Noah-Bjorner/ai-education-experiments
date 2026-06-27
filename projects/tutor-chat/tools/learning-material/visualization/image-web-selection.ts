import "@std/dotenv/load";

// idea: do wide search for candiadtes then selection of the best one and return it as url
// status: kinda a mess right now clean up and make it a roboust workflow not agent?
//    -> later review code quailt etc to make sure it's ok, customizability: there are instructions, time range, quality or the size of the image, the quantity of images selected, filtering domains, and that kind of thing.

import { OpenAI } from "@openai";
const client = new OpenAI();


export interface ImageWebSearchResult {
  type: string;
  image_url: string;
  source_website_url: string;
  thumbnail_url?: string;
}

type WebSearchCallOutput = {
  type: "web_search_call";
  action: { queries: string[] };
  results?: Array<ImageWebSearchResult>;
};

async function candidateImages(
  prompt: string,
): Promise<ImageWebSearchResult[]> {
  const response = await client.responses.create({
    model: "gpt-5.4",
    reasoning: { effort: "medium" },
    tools: [
      {
        type: "web_search",
        search_content_types: ["image", "text"],
        image_settings: {
          max_results: 3,
        },
      } as any,
    ],
    tool_choice: "required",
    include: ["web_search_call.results"],
    input: prompt,
  });

  const webSearch = response.output?.find((item) => item.type === "web_search_call") as WebSearchCallOutput | undefined;
  if (!webSearch) {
    throw new Error("No web search call in output");
  }

  const queries = webSearch.action.queries;
  const imageResults = webSearch.results?.filter((result) => result.type === "image_result") ?? [];

  console.log("queries:", queries, "imageResults:", imageResults);

  return imageResults;
}

async function judgeImage(
  prompt: string,
  candidates: ImageWebSearchResult[],
): Promise<ImageWebSearchResult> {
  if (candidates.length === 0) {
    throw new Error("No image candidates to judge");
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const response = await client.responses.create({
    model: "gpt-5.4",
    reasoning: { effort: "medium" },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Pick the best image for this request: ${prompt}\nReturn only the image_url of the best candidate.`,
          },
          ...candidates.map((candidate) => ({
            type: "input_image" as const,
            image_url: candidate.image_url,
          })),
        ],
      } as any,
    ],
  });

  const selectedUrl = response.output_text.trim();
  console.log("selectedUrl:", selectedUrl);
  const selected = candidates.find((candidate) => selectedUrl.includes(candidate.image_url));
  if (!selected) {
    throw new Error(`Selected image was not one of the candidates: ${selectedUrl}`);
  }

  return selected;
}

export async function selectImage(prompt: string): Promise<ImageWebSearchResult> {
  const candidates = await candidateImages(prompt);
  return await judgeImage(prompt, candidates);
}


const image = await selectImage("Image of Adidas x Entire Studios Lightblaze POD Shoes");
console.log(image);








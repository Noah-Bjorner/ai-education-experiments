import "@std/dotenv/load";
import { type InferAgentUIMessage, isStepCount, ToolLoopAgent } from "@ai";
import { webSearchTool } from "../../../tools/web-search.ts";
import { INSTRUCTIONS } from "./instructions.ts";

export {
  swedishCourseLookupResultSchema,
  type SwedishCourseLookupResult,
} from "./schema.ts";
export { INSTRUCTIONS } from "./instructions.ts";

export const swedishCourseLookupAgent = new ToolLoopAgent({
  id: "swedish-course-lookup",
  model: "openai/gpt-5.5",
  reasoning: "high",
  instructions: INSTRUCTIONS,
  tools: {
    webSearch: webSearchTool,
  },
  stopWhen: isStepCount(20),
});

export type SwedishCourseLookupUIMessage = InferAgentUIMessage<typeof swedishCourseLookupAgent>;




/*
const parsedResult = parseJsonWithSchema(
  result.text,
  swedishCourseLookupResultSchema,
);

// "historia åk 9", "matte 2b", "historia 9", "biologi gymnasium 1"

//console.log("[STEPS]: ", result.steps);
//console.log("[PROVIDER METADATA]: ", result.providerMetadata);
console.log("[TEXT]: ", result.text);
console.log("[JSON]: ", parsedResult);
*/
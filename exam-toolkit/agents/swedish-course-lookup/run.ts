import { swedishCourseLookupAgent } from "./index.ts";
import { parseJsonWithSchemaSafely } from "../../../helper/json.ts";
import { swedishCourseLookupResultSchema } from "./schema.ts";

export const lookupSwedishCourseAndStoreInDB = async (prompt: string) => {
  const result = await swedishCourseLookupAgent.generate({ prompt });
  const parsedResult = parseJsonWithSchemaSafely(result.text, swedishCourseLookupResultSchema);
  if (!parsedResult) {
    throw new Error(`Could not parse result: ${result.text}`);
  }
  //store in db logic later...
  return parsedResult;
};
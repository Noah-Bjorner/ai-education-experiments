import "@std/dotenv/load";
import { TypeSafeClient } from "@typesafe-ai/sdk";

export { choice, noul, score } from "@typesafe-ai/sdk";

const apiKey = Deno.env.get("TYPESAFE_API_KEY");
if (!apiKey) {
  throw new Error("TYPESAFE_API_KEY environment variable is required");
}

export const typesafe = new TypeSafeClient({ apiKey });

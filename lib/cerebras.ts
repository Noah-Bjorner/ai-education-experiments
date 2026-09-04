import "@std/dotenv/load";
import { createCerebras } from "@ai-sdk/cerebras";

export const cerebras = createCerebras({
  apiKey: Deno.env.get("CEREBRAS_API_KEY") ?? "",
});

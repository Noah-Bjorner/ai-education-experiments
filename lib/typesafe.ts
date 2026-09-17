import "@std/dotenv/load";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { typesafeFetch } from "./typesafe-fetch.ts";

export { choice, noul, score } from "@typesafe-ai/sdk";

let client: TypeSafeClient | undefined;

/** Constructed on first use so importing this module never requires the API key. */
export function typesafe(): TypeSafeClient {
  if (client) return client;
  const apiKey = Deno.env.get("TYPESAFE_API_KEY");
  if (!apiKey) {
    throw new Error("TYPESAFE_API_KEY environment variable is required");
  }
  client = new TypeSafeClient({
    apiKey,
    fetch: typesafeFetch,
  });
  return client;
}

const KEEPALIVE_INTERVAL_MS = 20_000;
let keepAliveTimer: number | undefined;

/**
 * Ping TypeSafe periodically so the TLS socket stays warm between requests.
 * Call it right before a real request: that request opens the socket and the
 * interval keeps it alive. Idempotent. The timer is unref'd, so it never keeps
 * a short-lived script running.
 */
export function keepTypesafeWarm(intervalMs = KEEPALIVE_INTERVAL_MS): void {
  if (keepAliveTimer !== undefined) return;
  keepAliveTimer = setInterval(async () => {
    try {
      await typesafe().models.list({ retry: { maxRetries: 0 }, timeout: 5_000 });
    } catch (error) {
      console.warn(
        "TypeSafe keepalive failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }, intervalMs);
  Deno.unrefTimer(keepAliveTimer);
}

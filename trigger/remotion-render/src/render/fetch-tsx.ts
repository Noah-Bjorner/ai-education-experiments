import { assertAllowedTsxUrl } from "../../../client/contract.ts";

const MAX_TSX_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_FETCH_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function fetchTsx(tsxUrl: string): Promise<string> {
  assertAllowedTsxUrl(tsxUrl);

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithTimeout(tsxUrl);

      if (!response.ok) {
        const error = new Error(
          `Failed to fetch TSX from ${tsxUrl} (${response.status}).`,
        );

        if (attempt < MAX_FETCH_ATTEMPTS && isRetryableStatus(response.status)) {
          lastError = error;
          await sleep(250 * attempt);
          continue;
        }

        throw error;
      }

      const tsx = await response.text();

      if (!tsx.trim()) {
        throw new Error(`TSX source at ${tsxUrl} is empty.`);
      }

      if (tsx.length > MAX_TSX_BYTES) {
        throw new Error(
          `TSX source exceeds maximum size of ${MAX_TSX_BYTES} bytes.`,
        );
      }

      return tsx;
    } catch (error) {
      const normalized = error instanceof Error
        ? error
        : new Error(String(error));

      if (attempt < MAX_FETCH_ATTEMPTS && normalized.name === "AbortError") {
        lastError = new Error(
          `Timed out fetching TSX from ${tsxUrl} after ${FETCH_TIMEOUT_MS}ms.`,
        );
        await sleep(250 * attempt);
        continue;
      }

      if (attempt < MAX_FETCH_ATTEMPTS && normalized.name !== "AbortError") {
        lastError = normalized;
        await sleep(250 * attempt);
        continue;
      }

      throw normalized;
    }
  }

  throw lastError ?? new Error(`Failed to fetch TSX from ${tsxUrl}.`);
}

import {
  type TriggerRemotionRenderInput,
  validateTriggerRemotionRenderInput,
} from "../../client/contract.ts";

export type { TriggerRemotionRenderInput } from "../../client/contract.ts";

export type TriggerRemotionRenderResult = {
  runId: string;
};

const FETCH_TIMEOUT_MS = 30_000;

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

export async function triggerRemotionRender(
  input: TriggerRemotionRenderInput,
): Promise<TriggerRemotionRenderResult> {
  const secretKey = process.env.TRIGGER_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Missing TRIGGER_SECRET_KEY.");
  }

  const validatedInput = validateTriggerRemotionRenderInput(input);

  const response = await fetchWithTimeout(
    "https://api.trigger.dev/api/v1/tasks/render-remotion-video/trigger",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payload: validatedInput,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to trigger Remotion render (${response.status}): ${body}`,
    );
  }

  const data = await response.json() as { id?: string };

  if (!data.id) {
    throw new Error("Trigger.dev response did not include a run id.");
  }

  return { runId: data.id };
}

import {
  type TriggerRemotionRenderInput,
  type TriggerRemotionRenderResult,
  validateTriggerRemotionRenderInput,
} from "./contract.ts";
import {
  type TriggerRemotionSpecRenderInput,
  type TriggerRemotionSpecRenderResult,
  validateTriggerRemotionSpecRenderInput,
} from "./spec-contract.ts";

export type {
  TriggerRemotionRenderInput,
  TriggerRemotionRenderResult,
} from "./contract.ts";

export type {
  RemotionSceneSpec,
  SpecSceneElement,
  TriggerRemotionSpecRenderInput,
  TriggerRemotionSpecRenderResult,
} from "./spec-contract.ts";

export type TriggerMachinePreset =
  | "micro"
  | "small-1x"
  | "small-2x"
  | "medium-1x"
  | "medium-2x"
  | "large-1x"
  | "large-2x";

export type TriggerRemotionRenderOptions = {
  taskIdentifier?: string;
  machine?: TriggerMachinePreset;
};

type TriggerRunStatus =
  | "PENDING_VERSION"
  | "DELAYED"
  | "QUEUED"
  | "EXECUTING"
  | "REATTEMPTING"
  | "FROZEN"
  | "WAITING"
  | "COMPLETED"
  | "CANCELED"
  | "FAILED"
  | "CRASHED"
  | "INTERRUPTED"
  | "SYSTEM_FAILURE"
  | "EXPIRED";

type TriggerRunResponse = {
  id: string;
  status: TriggerRunStatus;
  output?: {
    videoUrl?: string;
  };
  outputPresignedUrl?: string;
  attempts?: Array<{
    status: string;
    error?: {
      message?: string;
    };
  }>;
};

const TERMINAL_FAILURE_STATUSES = new Set<TriggerRunStatus>([
  "CANCELED",
  "FAILED",
  "CRASHED",
  "INTERRUPTED",
  "SYSTEM_FAILURE",
  "EXPIRED",
]);

const DEFAULT_TSX_TASK_IDENTIFIER = "render-remotion-video";
const DEFAULT_SPEC_TASK_IDENTIFIER = "render-remotion-spec";
const POLL_INTERVAL_QUEUED_MS = 3_000;
const POLL_INTERVAL_EXECUTING_MS = 1_000;
const MAX_POLL_DURATION_MS = 30 * 60 * 1_000;
const FETCH_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPollIntervalMs(status: TriggerRunStatus): number {
  if (status === "EXECUTING" || status === "REATTEMPTING") {
    return POLL_INTERVAL_EXECUTING_MS;
  }

  return POLL_INTERVAL_QUEUED_MS;
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

function buildTriggerTaskUrl(taskIdentifier: string): string {
  return `https://api.trigger.dev/api/v1/tasks/${
    encodeURIComponent(taskIdentifier)
  }/trigger`;
}

async function triggerRun<TPayload>(
  secretKey: string,
  taskIdentifier: string,
  payload: TPayload,
  options: TriggerRemotionRenderOptions = {},
): Promise<string> {
  const body = {
    payload,
    ...(options.machine ? { options: { machine: options.machine } } : {}),
  };

  const response = await fetchWithTimeout(
    buildTriggerTaskUrl(taskIdentifier),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to trigger ${taskIdentifier} (${response.status}): ${body}`,
    );
  }

  const data = await response.json() as { id?: string };

  if (!data.id) {
    throw new Error("Trigger.dev response did not include a run id.");
  }

  return data.id;
}

async function retrieveRun(
  secretKey: string,
  runId: string,
): Promise<TriggerRunResponse> {
  const response = await fetchWithTimeout(
    `https://api.trigger.dev/api/v3/runs/${runId}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to retrieve Trigger.dev run (${response.status}): ${body}`,
    );
  }

  return await response.json() as TriggerRunResponse;
}

async function resolveRunOutput(
  run: TriggerRunResponse,
): Promise<{ videoUrl: string }> {
  if (run.output?.videoUrl) {
    return { videoUrl: run.output.videoUrl };
  }

  if (run.outputPresignedUrl) {
    const response = await fetchWithTimeout(run.outputPresignedUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch Trigger.dev run output (${response.status}).`,
      );
    }

    const output = await response.json() as { videoUrl?: string };

    if (!output.videoUrl) {
      throw new Error("Trigger.dev run output did not include a videoUrl.");
    }

    return { videoUrl: output.videoUrl };
  }

  throw new Error("Trigger.dev run completed without a videoUrl.");
}

function getRunFailureMessage(run: TriggerRunResponse): string {
  const attemptError = run.attempts
    ?.filter((attempt) => attempt.status === "FAILED")
    .map((attempt) => attempt.error?.message)
    .find(Boolean);

  return attemptError ??
    `Remotion render run finished with status ${run.status}.`;
}

async function waitForRunOutput(
  secretKey: string,
  runId: string,
): Promise<{ videoUrl: string }> {
  const deadline = Date.now() + MAX_POLL_DURATION_MS;
  let lastStatus: TriggerRunStatus | undefined;

  while (Date.now() < deadline) {
    const run = await retrieveRun(secretKey, runId);

    if (run.status === "COMPLETED") {
      return await resolveRunOutput(run);
    }

    if (TERMINAL_FAILURE_STATUSES.has(run.status)) {
      throw new Error(getRunFailureMessage(run));
    }

    lastStatus = run.status;
    await sleep(getPollIntervalMs(run.status));
  }

  throw new Error(
    `Timed out waiting for Trigger.dev run ${runId} to complete${
      lastStatus ? ` (last status: ${lastStatus})` : ""
    }.`,
  );
}

export type TriggerRemotionRenderCall = {
  input: TriggerRemotionRenderInput;
  options?: TriggerRemotionRenderOptions;
};

export type TriggerRemotionSpecRenderCall = {
  input: TriggerRemotionSpecRenderInput;
  options?: TriggerRemotionRenderOptions;
};

export async function triggerRemotionRender({
  input,
  options,
}: TriggerRemotionRenderCall): Promise<TriggerRemotionRenderResult> {
  const secretKey = Deno.env.get("TRIGGER_SECRET_KEY");

  if (!secretKey) {
    throw new Error("Missing TRIGGER_SECRET_KEY.");
  }

  const validatedInput = validateTriggerRemotionRenderInput(input);
  const taskIdentifier = options?.taskIdentifier ?? DEFAULT_TSX_TASK_IDENTIFIER;
  const runId = await triggerRun(secretKey, taskIdentifier, validatedInput, options);
  const { videoUrl } = await waitForRunOutput(secretKey, runId);

  return { videoUrl, runId };
}

export async function triggerRemotionSpecRender({
  input,
  options,
}: TriggerRemotionSpecRenderCall): Promise<TriggerRemotionSpecRenderResult> {
  const secretKey = Deno.env.get("TRIGGER_SECRET_KEY");

  if (!secretKey) {
    throw new Error("Missing TRIGGER_SECRET_KEY.");
  }

  const validatedInput = validateTriggerRemotionSpecRenderInput(input);
  const taskIdentifier = options?.taskIdentifier ?? DEFAULT_SPEC_TASK_IDENTIFIER;
  const runId = await triggerRun(secretKey, taskIdentifier, validatedInput, options);
  const { videoUrl } = await waitForRunOutput(secretKey, runId);

  return { videoUrl, runId };
}

import { configure, runs, tasks } from "@trigger.dev/sdk";
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

type TriggerRunOutput = {
  videoUrl?: string;
};

type TriggerRunAttempt = {
  status: string;
  error?: {
    message?: string;
  };
};

type TriggerRun = {
  id: string;
  status: TriggerRunStatus;
  output?: TriggerRunOutput;
  outputPresignedUrl?: string;
  attempts?: TriggerRunAttempt[];
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

function configureTriggerSdk(secretKey: string): void {
  configure({ secretKey });
}

async function triggerRun<TPayload>(
  taskIdentifier: string,
  payload: TPayload,
  options: TriggerRemotionRenderOptions = {},
): Promise<string> {
  const handle = await tasks.trigger(taskIdentifier, payload, {
    ...(options.machine ? { machine: options.machine } : {}),
  });

  if (!handle.id) {
    throw new Error("Trigger.dev response did not include a run id.");
  }

  return handle.id;
}

async function retrieveRun(runId: string): Promise<TriggerRun> {
  const run = await runs.retrieve(runId);
  const runWithAttempts = run as typeof run & {
    outputPresignedUrl?: string;
    attempts?: TriggerRunAttempt[];
  };

  return {
    id: run.id,
    status: run.status as TriggerRunStatus,
    output: run.output as TriggerRunOutput | undefined,
    outputPresignedUrl: runWithAttempts.outputPresignedUrl,
    attempts: runWithAttempts.attempts,
  };
}

async function resolveRunOutput(
  run: TriggerRun,
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

function getRunFailureMessage(run: TriggerRun): string {
  const attemptError = run.attempts
    ?.filter((attempt) => attempt.status === "FAILED")
    .map((attempt) => attempt.error?.message)
    .find(Boolean);

  return attemptError ??
    `Remotion render run finished with status ${run.status}.`;
}

async function waitForRunOutput(
  runId: string,
): Promise<{ videoUrl: string }> {
  const deadline = Date.now() + MAX_POLL_DURATION_MS;
  let lastStatus: TriggerRunStatus | undefined;

  while (Date.now() < deadline) {
    const run = await retrieveRun(runId);

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
  const secretKey = Deno.env.get("TRIGGER_SECRET_KEY_PROD");

  if (!secretKey) {
    throw new Error("Missing TRIGGER_SECRET_KEY.");
  }

  configureTriggerSdk(secretKey);

  const validatedInput = validateTriggerRemotionRenderInput(input);
  const taskIdentifier = options?.taskIdentifier ?? DEFAULT_TSX_TASK_IDENTIFIER;
  const runId = await triggerRun(taskIdentifier, validatedInput, options);
  const { videoUrl } = await waitForRunOutput(runId);

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

  configureTriggerSdk(secretKey);

  const validatedInput = validateTriggerRemotionSpecRenderInput(input);
  const taskIdentifier = options?.taskIdentifier ?? DEFAULT_SPEC_TASK_IDENTIFIER;
  const runId = await triggerRun(taskIdentifier, validatedInput, options);
  const { videoUrl } = await waitForRunOutput(runId);

  return { videoUrl, runId };
}

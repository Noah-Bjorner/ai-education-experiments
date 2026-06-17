export type TriggerRemotionRenderInput = {
  tsxUrl: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
};

export type TriggerRemotionRenderResult = {
  videoUrl: string;
  runId: string;
};

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

const DEFAULT_TASK_IDENTIFIER = "render-remotion-video";
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_DURATION_MS = 30 * 60 * 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildTriggerTaskUrl(taskIdentifier: string): string {
  return `https://api.trigger.dev/api/v1/tasks/${
    encodeURIComponent(taskIdentifier)
  }/trigger`;
}

async function triggerRun(
  secretKey: string,
  input: TriggerRemotionRenderInput,
  options: TriggerRemotionRenderOptions = {},
): Promise<string> {
  const taskIdentifier = options.taskIdentifier ?? DEFAULT_TASK_IDENTIFIER;
  const body = {
    payload: input,
    ...(options.machine ? { options: { machine: options.machine } } : {}),
  };

  const response = await fetch(
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
  const response = await fetch(
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
    const response = await fetch(run.outputPresignedUrl);

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

  while (Date.now() < deadline) {
    const run = await retrieveRun(secretKey, runId);

    if (run.status === "COMPLETED") {
      return await resolveRunOutput(run);
    }

    if (TERMINAL_FAILURE_STATUSES.has(run.status)) {
      throw new Error(getRunFailureMessage(run));
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out waiting for Trigger.dev run ${runId} to complete.`,
  );
}

export async function triggerRemotionRender(
  input: TriggerRemotionRenderInput,
  options: TriggerRemotionRenderOptions = {},
): Promise<TriggerRemotionRenderResult> {
  const secretKey = Deno.env.get("TRIGGER_SECRET_KEY");

  if (!secretKey) {
    throw new Error("Missing TRIGGER_SECRET_KEY.");
  }

  const runId = await triggerRun(secretKey, input, options);
  const { videoUrl } = await waitForRunOutput(secretKey, runId);

  return { videoUrl, runId };
}

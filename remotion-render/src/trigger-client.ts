export type TriggerRemotionRenderInput = {
  tsxUrl: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
};

export type TriggerRemotionRenderResult = {
  runId: string;
};

export async function triggerRemotionRender(
  input: TriggerRemotionRenderInput,
): Promise<TriggerRemotionRenderResult> {
  const secretKey = process.env.TRIGGER_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Missing TRIGGER_SECRET_KEY.");
  }

  const response = await fetch(
    "https://api.trigger.dev/api/v1/tasks/render-remotion-video/trigger",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payload: input,
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

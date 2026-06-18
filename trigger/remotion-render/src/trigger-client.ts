import { configure, tasks } from "@trigger.dev/sdk";
import {
  type TriggerRemotionRenderInput,
  validateTriggerRemotionRenderInput,
} from "../../client/contract.ts";

export type { TriggerRemotionRenderInput } from "../../client/contract.ts";

export type TriggerRemotionRenderResult = {
  runId: string;
};

const DEFAULT_TSX_TASK_IDENTIFIER = "render-remotion-video";

export async function triggerRemotionRender(
  input: TriggerRemotionRenderInput,
): Promise<TriggerRemotionRenderResult> {
  const secretKey = process.env.TRIGGER_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Missing TRIGGER_SECRET_KEY.");
  }

  configure({ secretKey });

  const validatedInput = validateTriggerRemotionRenderInput(input);
  const handle = await tasks.trigger(
    DEFAULT_TSX_TASK_IDENTIFIER,
    validatedInput,
  );

  if (!handle.id) {
    throw new Error("Trigger.dev response did not include a run id.");
  }

  return { runId: handle.id };
}

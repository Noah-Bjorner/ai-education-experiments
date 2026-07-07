import {
  objectiveSchema,
  type ObjectiveToolOutput,
} from "./tools/objective/index.ts";
import type { MammothUIMessage } from "./types.ts";

export function getLatestActiveObjective(
  messages: MammothUIMessage[],
): ObjectiveToolOutput | undefined {
  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex--
  ) {
    const message = messages[messageIndex];

    for (
      let partIndex = message.parts.length - 1;
      partIndex >= 0;
      partIndex--
    ) {
      const part = message.parts[partIndex];

      if (part.type !== "tool-objective" || part.state !== "output-available") {
        continue;
      }

      const parsedObjective = objectiveSchema.safeParse(part.output);
      if (!parsedObjective.success) {
        return undefined;
      }

      const { status } = parsedObjective.data;
      return status === "completed" || status === "abandoned"
        ? undefined
        : parsedObjective.data;
    }
  }

  return undefined;
}

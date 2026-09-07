import { z } from "@zod";

export const childTitleField = z.string().min(1).describe(
  "Short learner-facing title shown above this element.",
);

export type WhiteboardChildDefinition<S extends z.ZodType<{ type: string }>> = {
  type: z.infer<S>["type"];
  schema: S;
  instructions: string;
  example: {
    instruction: string;
    output: z.infer<S>;
  };
};

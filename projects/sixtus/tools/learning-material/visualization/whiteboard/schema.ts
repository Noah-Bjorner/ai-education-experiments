import { z } from "@zod";
import { whiteboardChildren } from "./children/index.ts";

const [firstChild, ...otherChildren] = whiteboardChildren;
// z.union emits anyOf. z.discriminatedUnion emits oneOf, which OpenAI
// response_format rejects on array items.
const whiteboardChildSchema = z.union([
  firstChild.schema,
  ...otherChildren.map((child) => child.schema),
]);

export const WhiteboardOutput = z.object({
  layout: z.enum(["single", "split", "stack"]).describe(
    "How children are arranged: single (one child), split (two side by side), stack (vertical).",
  ),
  children: z.array(whiteboardChildSchema).min(1).describe(
    "Elements on the whiteboard. Use 1 child for single, 2 for split, 2 or more for stack.",
  ),
});

export type WhiteboardSpec = z.infer<typeof WhiteboardOutput>;

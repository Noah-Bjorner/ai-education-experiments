import { z } from "@zod";

import { sixtusUIMessageSchema } from "../schema.ts";

export const tangentRequestSchema = z.object({
  messages: z.array(sixtusUIMessageSchema),
});

export type TangentRequest = z.infer<typeof tangentRequestSchema>;

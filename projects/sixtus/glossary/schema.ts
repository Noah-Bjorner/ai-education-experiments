import { z } from "@zod";

import { sixtusUIMessageSchema } from "../schema.ts";

export const glossaryRequestSchema = z.object({
  messages: z.array(sixtusUIMessageSchema),
});

export type GlossaryRequest = z.infer<typeof glossaryRequestSchema>;

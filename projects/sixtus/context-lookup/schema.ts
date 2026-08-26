import { z } from "@zod";

export const contextLookupRequestSchema = z.object({
  term: z.string().trim().min(1, {
    error: "term is required.",
  }).max(200, {
    error: "term must be at most 200 characters.",
  }),
  context_message: z.string().trim().min(1, {
    error: "context_message is required.",
  }).max(10000, {
    error: "context_message must be at most 10,000 characters.",
  }),
});

export const contextLookupSourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
});

export const contextLookupResultSchema = z.object({
  term: z.string().min(1),
  explanation: z.string(),
  sources: z.array(contextLookupSourceSchema),
});

export type ContextLookupRequest = z.infer<typeof contextLookupRequestSchema>;
export type ContextLookupSource = z.infer<typeof contextLookupSourceSchema>;
export type ContextLookupResult = z.infer<typeof contextLookupResultSchema>;

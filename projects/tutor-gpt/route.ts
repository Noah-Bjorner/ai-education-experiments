import { Hono } from "@hono/hono";
import type { UIMessage } from "@ai";

import { streamTutorGptChat } from "./chat.ts";

export const tutorGptRoutes = new Hono();

tutorGptRoutes.post("/chat", async (c) => {
  const { messages }: { messages?: UIMessage[] } = await c.req.json();

  if (!Array.isArray(messages)) {
    return c.json(
      {
        ok: false,
        error: {
          code: "INVALID_CHAT_REQUEST",
          message: "Expected a JSON body with a messages array.",
        },
      },
      400,
    );
  }

  const result = await streamTutorGptChat({ messages });

  return result.toUIMessageStreamResponse();
});

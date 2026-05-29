import { Hono } from "@hono/hono";

import { streamTutorGptChat } from "./chat.ts";
import { tutorGptChatRequestSchema } from "./schema.ts";

export const tutorGptRoutes = new Hono();

tutorGptRoutes.post("/chat", async (c) => {
  const body = await c.req.json();
  const parsedRequest = tutorGptChatRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return c.json(
      {
        ok: false,
        error: {
          code: "INVALID_CHAT_REQUEST",
          message: "Expected a JSON body with messages and optional tutor_instructions/student_profile.",
          issues: parsedRequest.error.issues,
        },
      },
      400,
    );
  }

  const result = await streamTutorGptChat(parsedRequest.data);

  return result.toUIMessageStreamResponse();
});

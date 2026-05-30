import { Hono } from "@hono/hono";

import { streamTutorChat } from "./chat.ts";
import { tutorChatRequestSchema } from "./schema.ts";

export const tutorChatRoutes = new Hono();

tutorChatRoutes.post("/chat", async (c) => {
  const body = await c.req.json();
  const parsedRequest = tutorChatRequestSchema.safeParse(body);

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

  const result = await streamTutorChat(parsedRequest.data);

  return result.toUIMessageStreamResponse();
});

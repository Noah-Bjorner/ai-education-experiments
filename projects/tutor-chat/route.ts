import { Hono } from "@hono/hono";
import { createUIMessageStreamResponse } from "@ai";

import { createTutorChatUIMessageStream } from "./chat.ts";
import { tutorChatApiKeyMiddleware } from "./middleware.ts";
import { tutorChatRequestSchema } from "./schema.ts";

export const tutorChatRoutes = new Hono();

tutorChatRoutes.use("*", tutorChatApiKeyMiddleware);

tutorChatRoutes.post("/chat", async (c) => {
  const body = await c.req.json();
  const parsedRequest = tutorChatRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return c.json(
      {
        ok: false,
        error: {
          code: "INVALID_CHAT_REQUEST",
          message:
            "Expected a JSON body with messages, optional tutor_instructions/student_profile, and optional model.",
          issues: parsedRequest.error.issues,
        },
      },
      400,
    );
  }
  const stream = createTutorChatUIMessageStream(parsedRequest.data, {
    onError: (error) => {
      console.error("Tutor chat stream failed", error);
      return "The tutor hit an error while generating the response. Please try again.";
    },
  });

  return createUIMessageStreamResponse({ stream });
});

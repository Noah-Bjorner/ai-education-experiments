import { Hono } from "@hono/hono";
import { createUIMessageStreamResponse } from "@ai";

import { createMammothUIMessageStream } from "./chat.ts";
import { mammothApiKeyMiddleware } from "./middleware.ts";
import { mammothRequestSchema } from "./schema.ts";

export const mammothRoutes = new Hono();

mammothRoutes.use("*", mammothApiKeyMiddleware);


mammothRoutes.post("/test", (c) => {
  return c.json({ message: "Hello, world!" });
});

mammothRoutes.post("/chat", async (c) => {
  const body = await c.req.json();
  const parsedRequest = mammothRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return c.json(
      {
        ok: false,
        error: {
          code: "INVALID_CHAT_REQUEST",
          message:
            "Expected a JSON body with messages, optional tutor_instructions/student_profile/memory, and optional model.",
          issues: parsedRequest.error.issues,
        },
      },
      400,
    );
  }
  const stream = createMammothUIMessageStream(parsedRequest.data, {
    onError: (error) => {
      console.error("Mammoth stream failed", error);
      return "Mammoth hit an error while generating the response. Please try again.";
    },
  });

  return createUIMessageStreamResponse({ stream });
});

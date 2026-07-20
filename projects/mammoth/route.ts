import { Hono, type Context } from "@hono/hono";
import { createUIMessageStreamResponse } from "@ai";

import { createZodJsonBodyMiddleware } from "../../helper/hono.ts";
import { mammothAuthMiddleware, type MammothEnv } from "./auth.ts";
import { createMammothUIMessageStream } from "./chat.ts";
import { mammothRequestSchema, type MammothRequest } from "./schema.ts";
import { mammothSubscriptionMiddleware } from "./subscription.ts";

type MammothChatEnv = {
  Variables: MammothEnv["Variables"] & {
    parsedBody: MammothRequest;
  };
};

export const mammothRoutes = new Hono<MammothEnv>();

mammothRoutes.use("*", mammothAuthMiddleware);

mammothRoutes.post("/test", (c) => {
  const user = c.get("mammothUser");
  return c.json({ ok: true, data: { user_id: user.id } });
});

const parseMammothChatBody = createZodJsonBodyMiddleware(mammothRequestSchema, {
  code: "INVALID_CHAT_REQUEST",
  message:
    "Expected a JSON body with messages, optional tutor_instructions/student_profile/memory, and optional model.",
});

mammothRoutes.post(
  "/chat",
  mammothSubscriptionMiddleware,
  parseMammothChatBody,
  (c: Context<MammothChatEnv>) => {
    const request = c.get("parsedBody");

    const stream = createMammothUIMessageStream(request, {
      onError: (error) => {
        console.error("Mammoth stream failed", error);
        return "Mammoth hit an error while generating the response. Please try again.";
      },
    });

    return createUIMessageStreamResponse({ stream });
  },
);

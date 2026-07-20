import { Hono } from "@hono/hono";
import { createUIMessageStreamResponse } from "@ai";

import { mammothAuthMiddleware, type MammothEnv } from "./auth.ts";
import { createMammothUIMessageStream } from "./chat.ts";
import { mammothRequestSchema } from "./schema.ts";
import {
  hasActiveSubscription,
  recordMammothRequest,
  subscriptionEnforcementEnabled,
} from "./supabase.ts";

export const mammothRoutes = new Hono<MammothEnv>();

mammothRoutes.use("*", mammothAuthMiddleware);
mammothRoutes.use("*", async (c, next) => {
  const user = c.get("mammothUser");
  await next();

  try {
    await recordMammothRequest({
      userID: user.id,
      method: c.req.method,
      path: c.req.path,
      responseStatus: c.res.status,
    });
  } catch (error) {
    console.error("Failed to record authenticated Mammoth request", error);
  }
});

mammothRoutes.post("/test", (c) => {
  const user = c.get("mammothUser");
  return c.json({ ok: true, data: { user_id: user.id } });
});

mammothRoutes.post("/chat", async (c) => {
  const user = c.get("mammothUser");

  if (
    subscriptionEnforcementEnabled() &&
    !(await hasActiveSubscription(user.id))
  ) {
    return c.json(
      {
        ok: false,
        error: {
          code: "ACTIVE_SUBSCRIPTION_REQUIRED",
          message: "An active subscription is required to send messages.",
        },
      },
      403,
    );
  }

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

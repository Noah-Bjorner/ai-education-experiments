import { type Context, Hono } from "@hono/hono";
import { createUIMessageStreamResponse } from "@ai";

import { createZodJsonBodyMiddleware } from "../../../helper/hono.ts";
import type { SixtusEnv } from "../auth.ts";
import { sixtusSubscriptionMiddleware } from "../subscription.ts";
import { createTangentUIMessageStream } from "./index.ts";
import { type TangentRequest, tangentRequestSchema } from "./schema.ts";

type TangentEnv = {
  Variables: SixtusEnv["Variables"] & {
    parsedBody: TangentRequest;
  };
};

export const tangentRoutes = new Hono<SixtusEnv>();

const parseTangentBody = createZodJsonBodyMiddleware(tangentRequestSchema, {
  code: "INVALID_TANGENT_REQUEST",
  message: "Expected a JSON body with messages.",
});

tangentRoutes.post(
  "/",
  sixtusSubscriptionMiddleware,
  parseTangentBody,
  (c: Context<TangentEnv>) => {
    const request = c.get("parsedBody");

    const stream = createTangentUIMessageStream(request, {
      onError: (error) => {
        console.error("Sixtus tangent stream failed", error);
        return "Sixtus hit an error while generating the tangent response. Please try again.";
      },
    });

    return createUIMessageStreamResponse({ stream });
  },
);

import { type Context, Hono } from "@hono/hono";

import { createZodJsonBodyMiddleware } from "../../../helper/hono.ts";
import type { SixtusEnv } from "../auth.ts";
import { generateContextLookup } from "./context.ts";
import {
  type ContextLookupRequest,
  contextLookupRequestSchema,
} from "./schema.ts";

type ContextLookupEnv = {
  Variables: SixtusEnv["Variables"] & {
    parsedBody: ContextLookupRequest;
  };
};

export const contextLookupRoutes = new Hono<SixtusEnv>();

const parseContextLookupBody = createZodJsonBodyMiddleware(
  contextLookupRequestSchema,
  {
    code: "INVALID_CONTEXT_REQUEST",
    message: "Expected a JSON body with term and context_message.",
  },
);

contextLookupRoutes.post(
  "/",
  parseContextLookupBody,
  async (c: Context<ContextLookupEnv>) => {
    const request = c.get("parsedBody");

    try {
      const data = await generateContextLookup(request);
      return c.json({ ok: true, data });
    } catch (error) {
      console.error("Sixtus context lookup failed", error);
      return c.json(
        {
          ok: false,
          error: {
            code: "CONTEXT_GENERATE_FAILED",
            message: "Failed to generate context for the selected term.",
          },
        },
        500,
      );
    }
  },
);

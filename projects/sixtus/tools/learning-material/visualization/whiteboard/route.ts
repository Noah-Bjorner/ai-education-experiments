import { type Context, Hono } from "@hono/hono";

import { createZodJsonBodyMiddleware } from "../../../../../../helper/hono.ts";
import type { SixtusEnv } from "../../../../auth.ts";
import { executeWhiteboard } from "./index.ts";
import { type WhiteboardRequest, whiteboardRequestSchema } from "./schema.ts";

type WhiteboardEnv = {
  Variables: SixtusEnv["Variables"] & {
    parsedBody: WhiteboardRequest;
  };
};

export const whiteboardRoutes = new Hono<SixtusEnv>();

const parseWhiteboardBody = createZodJsonBodyMiddleware(
  whiteboardRequestSchema,
  {
    code: "INVALID_WHITEBOARD_REQUEST",
    message:
      "Expected a JSON body with either { goal } or { layout, children }.",
  },
);

whiteboardRoutes.post(
  "/",
  parseWhiteboardBody,
  async (c: Context<WhiteboardEnv>) => {
    const request = c.get("parsedBody");

    try {
      const data = await executeWhiteboard(request);
      return c.json({ ok: true, data });
    } catch (error) {
      console.error("Sixtus whiteboard execution failed", error);
      return c.json(
        {
          ok: false,
          error: {
            code: "WHITEBOARD_EXECUTE_FAILED",
            message: "Failed to execute the whiteboard request.",
          },
        },
        500,
      );
    }
  },
);

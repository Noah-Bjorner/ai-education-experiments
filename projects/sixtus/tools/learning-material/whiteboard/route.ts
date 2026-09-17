import { whiteboardHttpError } from "./render/http-error.ts";
import { type Context, Hono } from "@hono/hono";

import { createZodJsonBodyMiddleware } from "../../../../../helper/hono.ts";
import { executeWhiteboard } from "./index.ts";
import { type WhiteboardRequest, whiteboardRequestSchema } from "./schema.ts";

type WhiteboardEnv = {
  Variables: {
    parsedBody: WhiteboardRequest;
  };
};

export const whiteboardRoutes = new Hono<WhiteboardEnv>();

const parseWhiteboardBody = createZodJsonBodyMiddleware(
  whiteboardRequestSchema,
  {
    code: "INVALID_WHITEBOARD_REQUEST",
    message:
      "Expected a JSON body with either { goal } or { title, figures } with optional format, orientation, fontMode, and animation.",
  },
);

whiteboardRoutes.post(
  "/",
  parseWhiteboardBody,
  async (c: Context<WhiteboardEnv>) => {
    const request = c.get("parsedBody");

    try {
      const startedAt = performance.now();
      const data = await executeWhiteboard(request);
      const durationMs = Math.round(performance.now() - startedAt);

      return c.json({
        ok: true,
        data: {
          ...data,
          durationMs,
          goal: "goal" in request ? request.goal : null,
        },
      });
    } catch (error) {
      console.error("Sixtus whiteboard execution failed", error);
      const failure = whiteboardHttpError(error, "goal" in request);
      return c.json(failure.body, failure.status);
    }
  },
);

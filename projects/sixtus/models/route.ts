import { Hono } from "@hono/hono";

import type { SixtusEnv } from "../auth.ts";
import { featuredInApp, searchModelsByName } from "./index.ts";

export const sixtusModelRoutes = new Hono<SixtusEnv>();

sixtusModelRoutes.get("/featured", (c) =>
  c.json({
    ok: true,
    data: featuredInApp,
}));

sixtusModelRoutes.get("/search", (c) => {
  const query = (c.req.query("q") ?? "").trim();

  if (!query) {
    return c.json(
      {
        ok: false,
        error: {
          code: "INVALID_MODEL_SEARCH",
          message: 'Expected a non-empty "q" query parameter.',
        },
      },
      400,
    );
  }

  return c.json({
    ok: true,
    data: searchModelsByName(query),
  });
});

import { assertEquals } from "@std/assert";
import { Hono } from "@hono/hono";

import type { SixtusEnv } from "../auth.ts";
import { searchModelsByName } from "./index.ts";
import { sixtusModelRoutes } from "./route.ts";

Deno.test("searchModelsByName matches model names case-insensitively", () => {
  assertEquals(
    searchModelsByName("gPt-5.6").map((model) => model.name),
    ["GPT-5.6 Luna", "GPT-5.6 Terra", "GPT-5.6 Sol"],
  );
  assertEquals(searchModelsByName("openai"), []);
});

Deno.test("GET /search returns models matching the q parameter", async () => {
  const app = new Hono<SixtusEnv>();
  app.route("/", sixtusModelRoutes);

  const response = await app.request("/search?q=flash");

  assertEquals(response.status, 200);
  assertEquals(
    (await response.json()).data.map(
      (model: { name: string }) => model.name,
    ),
    ["Gemini 3.6 Flash", "Gemini 3.7 Flash"],
  );
});

Deno.test("GET /search rejects an empty query", async () => {
  const app = new Hono<SixtusEnv>();
  app.route("/", sixtusModelRoutes);

  const response = await app.request("/search?q=%20");

  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    ok: false,
    error: {
      code: "INVALID_MODEL_SEARCH",
      message: 'Expected a non-empty "q" query parameter.',
    },
  });
});

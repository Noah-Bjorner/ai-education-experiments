import { assertEquals, assertStrictEquals } from "@std/assert";
import { Hono } from "@hono/hono";

import type { SixtusEnv } from "../auth.ts";
import {
  all,
  featuredInApp,
  featuredModelIds,
  SIXTUS_AUTO_MODEL,
  SIXTUS_GATEWAY_MODEL_CONFIG,
  SIXTUS_MODEL_OPTIONS,
  SIXTUS_MODELS,
  sixtusModelSchema,
} from "./index.ts";
import { sixtusModelRoutes } from "./route.ts";

Deno.test("model collections and request schema use all models", () => {
  assertStrictEquals(SIXTUS_GATEWAY_MODEL_CONFIG, all);
  assertEquals(featuredInApp.length, 4);
  assertEquals(
    featuredInApp.map((model) => model.id),
    [...featuredModelIds],
  );
  assertEquals(
    SIXTUS_MODEL_OPTIONS as readonly string[],
    ["auto", ...all.map((model) => model.id)],
  );
  assertEquals(sixtusModelSchema.parse(undefined), SIXTUS_AUTO_MODEL);

  for (const model of all) {
    assertEquals(SIXTUS_MODELS[model.id], model);
    assertEquals(sixtusModelSchema.parse(model.id), model.id);
    assertEquals(model.intelligence, 0);
    assertEquals(model.tps, 0);
    assertEquals(model.reasoningEffort, "high");
  }
});

Deno.test("GET /featured returns models featured in the app", async () => {
  const app = new Hono<SixtusEnv>();
  app.route("/", sixtusModelRoutes);

  const response = await app.request("/featured");

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    ok: true,
    data: featuredInApp,
  });
});

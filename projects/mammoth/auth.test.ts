import { Hono } from "@hono/hono";
import { errors } from "@jose";
import { assertEquals } from "jsr:@std/assert@1.0.18";

import { createMammothAuthMiddleware, type MammothEnv } from "./auth.ts";

const userID = "1e08432f-7473-4c12-b1a3-8d71178a5a97";

Deno.test("Mammoth auth rejects requests without a bearer token", async () => {
  const app = new Hono<MammothEnv>();
  app.use("*", createMammothAuthMiddleware(async () => ({ id: userID })));
  app.get("/", (c) => c.json({ user_id: c.get("mammothUser").id }));

  const response = await app.request("/");
  const body = await response.json();

  assertEquals(response.status, 401);
  assertEquals(body.error.code, "AUTH_REQUIRED");
});

Deno.test("Mammoth auth exposes the verified Supabase user", async () => {
  const app = new Hono<MammothEnv>();
  app.use(
    "*",
    createMammothAuthMiddleware(async (token) => {
      assertEquals(token, "access-token");
      return { id: userID };
    }),
  );
  app.get("/", (c) => c.json({ user_id: c.get("mammothUser").id }));

  const response = await app.request("/", {
    headers: { Authorization: "Bearer access-token" },
  });

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { user_id: userID });
});

Deno.test("Mammoth auth rejects tokens that fail verification", async () => {
  const app = new Hono<MammothEnv>();
  app.use(
    "*",
    createMammothAuthMiddleware(() =>
      Promise.reject(new errors.JWTInvalid("invalid"))
    ),
  );
  app.get("/", (c) => c.text("unreachable"));

  const response = await app.request("/", {
    headers: { Authorization: "Bearer invalid" },
  });
  const body = await response.json();

  assertEquals(response.status, 401);
  assertEquals(body.error.code, "INVALID_ACCESS_TOKEN");
});

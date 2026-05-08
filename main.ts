import { Hono } from "@hono/hono";
import { cors } from "@hono/hono/cors";

import { examToolkitRoutes } from "./exam-toolkit/routes.ts";

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: [
      "Authorization",
      "Content-Type",
      "X-API-Key",
      "X-Requested-With",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    exposeHeaders: ["Content-Type"],
    credentials: false,
    maxAge: 86400,
  }),
);

app.notFound((c) =>
  c.json(
    {
      ok: false,
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "Route not found",
      },
    },
    404,
  )
);

app.onError((err, c) => {
  console.error("onError:", err);

  return c.json(
    {
      ok: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: err.message || "Unexpected error",
      },
    },
    500,
  );
});

app.get("/", (c) =>
  c.json({
    ok: true,
    data: {
      message: "Hi, welcome to Edu Experiments API!",
    },
  }));

app.get("/health", (c) =>
  c.json({
    ok: true,
    data: {
      status: "ok",
    },
  }));

app.get("/demo", (c) =>
  c.json({
    ok: true,
    data: {
      experiment: "demo",
      timestamp: new Date().toISOString(),
    },
  }));



  
app.route("/exam-toolkit", examToolkitRoutes);





let shuttingDown = false;

function gracefulShutdown() {
  if (shuttingDown) return;

  shuttingDown = true;
  console.warn("Shutting down...");
  Deno.exit(0);
}

Deno.addSignalListener("SIGINT", gracefulShutdown);
Deno.addSignalListener("SIGTERM", gracefulShutdown);

const port = Number(Deno.env.get("PORT") ?? "8000");

Deno.serve({ port }, app.fetch);

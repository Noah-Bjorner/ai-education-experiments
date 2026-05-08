import { Hono } from "@hono/hono";

import { demoExamRequestSchema } from "./schemas.ts";

export const examToolkitRoutes = new Hono();

examToolkitRoutes.get("/", (c) =>
  c.json({
    ok: true,
    data: {
      routes: {
        demo: "POST /exam-toolkit/demo",
      },
    },
  }));

examToolkitRoutes.post("/demo", async (c) => {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        ok: false,
        error: {
          code: "INVALID_JSON",
          message: "Request body must be valid JSON.",
        },
      },
      400,
    );
  }

  const parsed = demoExamRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body did not match the demo exam schema.",
          issues: parsed.error.issues,
        },
      },
      400,
    );
  }

  const request = parsed.data;

  return c.json({
    ok: true,
    data: {
      request,
      demoExam: {
        title: request.examTitle,
        subject: request.subject,
        prompt:
          `Create ${request.questionCount} ${request.difficulty} questions for ${request.subject}.`,
        includeAnswerKey: request.includeAnswerKey,
      },
    },
  });
});

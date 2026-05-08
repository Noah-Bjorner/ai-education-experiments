import { Hono } from "@hono/hono";

import {
  createApiKeyMiddleware,
  validationErrorResponse,
} from "../helper/hono.ts";
import {
  examInputSchema,
  examOutputSchema,
  generateExamInputSchema,
  generateExamOutputSchema,
  replicateExamInputSchema,
  replicateExamOutputSchema,
  resultsExamInputSchema,
  resultsExamOutputSchema,
  submitExamInputSchema,
  submitExamOutputSchema,
} from "./schemas.ts";

export const examToolkitRoutes = new Hono();
examToolkitRoutes.use("*", createApiKeyMiddleware("EXAM_TOOLKIT_API_KEY"));


examToolkitRoutes.post("/generate_exam", async (c) => {
  try {
    const input = generateExamInputSchema.parse(await c.req.json());
    const output = generateExamOutputSchema.parse({
      exam_id: input.course_id,
    });

    return c.json(
      {
        ok: true,
        data: output,
      },
    );
  } catch (error) {
    return validationErrorResponse(c, error);
  }
});

examToolkitRoutes.post("/replicate_exam", async (c) => {
  try {
    const input = replicateExamInputSchema.parse(await c.req.json());
    const output = replicateExamOutputSchema.parse({
      exam_id: input.exam_id,
    });

    return c.json(
      {
        ok: true,
        data: output,
      },
    );
  } catch (error) {
    return validationErrorResponse(c, error);
  }
});

examToolkitRoutes.post("/submit_exam", async (c) => {
  try {
    submitExamInputSchema.parse(await c.req.json());
    const output = submitExamOutputSchema.parse({
      accepted: true,
    });

    return c.json(
      {
        ok: true,
        data: output,
      },
      202,
    );
  } catch (error) {
    return validationErrorResponse(c, error);
  }
});

examToolkitRoutes.get("/exam", (c) => {
  try {
    const input = examInputSchema.parse({
      exam_id: c.req.query("exam_id"),
    });
    const output = examOutputSchema.parse({
      exam_title: `Exam ${input.exam_id}`,
      exam_topic: undefined,
      exam_number_of_questions: 1,
      exam_difficulty_range: undefined,
      exam_questions: [],
    });

    return c.json({
      ok: true,
      data: output,
    });
  } catch (error) {
    return validationErrorResponse(c, error);
  }
});

examToolkitRoutes.get("/results_exam", (c) => {
  try {
    const input = resultsExamInputSchema.parse({
      exam_id: c.req.query("exam_id"),
    });
    const output = resultsExamOutputSchema.parse({
      exam_info: {
        exam_id: input.exam_id,
      },
      exam_questions: [],
    });

    return c.json({
      ok: true,
      data: output,
    });
  } catch (error) {
    return validationErrorResponse(c, error);
  }
});

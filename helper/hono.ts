import type { Context, MiddlewareHandler } from "@hono/hono";
import type { z } from "@zod";

export function validationErrorResponse(c: Context, error: unknown) {
  return c.json(
    {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request input did not match the route schema.",
        issues: error instanceof Error ? error.message : String(error),
      },
    },
    400,
  );
}

export type ZodJsonBodyOptions = {
  code: string;
  message: string;
};

/** Parses JSON + Zod-validates into `c.get("parsedBody")`. Apply per route/schema. */
export function createZodJsonBodyMiddleware<TSchema extends z.ZodType>(
  schema: TSchema,
  options: ZodJsonBodyOptions,
): MiddlewareHandler<{ Variables: { parsedBody: z.infer<TSchema> } }> {
  return async (c, next) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          ok: false,
          error: {
            code: options.code,
            message: "Request body must be valid JSON.",
          },
        },
        400,
      );
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: options.code,
            message: options.message,
            issues: parsed.error.issues,
          },
        },
        400,
      );
    }

    c.set("parsedBody", parsed.data);
    await next();
  };
}

export function createApiKeyMiddleware(
  envVarName: string,
  headerName = "X-API-Key",
): MiddlewareHandler {
  return async (c, next) => {
    const expectedApiKey = Deno.env.get(envVarName);

    if (!expectedApiKey) {
      return c.json(
        {
          ok: false,
          error: {
            code: "SERVER_MISCONFIGURED",
            message: `${envVarName} is not configured on the server.`,
          },
        },
        500,
      );
    }

    const providedApiKey = c.req.header(headerName);

    if (providedApiKey !== expectedApiKey) {
      return c.json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: `Missing or invalid ${headerName} header.`,
          },
        },
        401,
      );
    }

    await next();
  };
}

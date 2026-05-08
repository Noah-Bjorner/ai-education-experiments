import type { Context, MiddlewareHandler } from "@hono/hono";

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

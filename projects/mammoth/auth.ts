import "@std/dotenv/load";

import { createRemoteJWKSet, errors, jwtVerify } from "@jose";
import type { MiddlewareHandler } from "@hono/hono";

export type MammothUser = {
  id: string;
};

export type MammothEnv = {
  Variables: {
    mammothUser: MammothUser;
  };
};

const supabaseURL = requiredEnvironmentVariable("SUPABASE_URL").replace(
  /\/$/,
  "",
);
const issuer = `${supabaseURL}/auth/v1`;
const projectJWKS = createRemoteJWKSet(
  new URL(`${issuer}/.well-known/jwks.json`),
);

type AccessTokenVerifier = (token: string) => Promise<MammothUser>;

export function createMammothAuthMiddleware(
  verifyAccessToken: AccessTokenVerifier = verifySupabaseAccessToken,
): MiddlewareHandler<MammothEnv> {
  return async (c, next) => {
    const token = bearerToken(c.req.header("Authorization"));
    if (!token) {
      return c.json(
        {
          ok: false,
          error: {
            code: "AUTH_REQUIRED",
            message: "A valid Supabase access token is required.",
          },
        },
        401,
      );
    }

    let user: MammothUser;
    try {
      user = await verifyAccessToken(token);
    } catch (error) {
      if (!(error instanceof errors.JOSEError)) {
        console.error("Supabase access-token verification failed", error);
      }

      return c.json(
        {
          ok: false,
          error: {
            code: "INVALID_ACCESS_TOKEN",
            message: "The access token is invalid or expired.",
          },
        },
        401,
      );
    }

    c.set("mammothUser", user);
    await next();
  };
}

export const mammothAuthMiddleware = createMammothAuthMiddleware();

async function verifySupabaseAccessToken(token: string): Promise<MammothUser> {
  const { payload } = await jwtVerify(token, projectJWKS, {
    issuer,
    audience: "authenticated",
    algorithms: ["ES256"],
  });

  if (
    typeof payload.sub !== "string" ||
    !isUUID(payload.sub) ||
    payload.role !== "authenticated" ||
    payload.is_anonymous === true
  ) {
    throw new errors.JWTClaimValidationFailed(
      "The token does not represent an authenticated user.",
      payload,
      "sub",
      "check_failed",
    );
  }

  return { id: payload.sub };
}

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;

  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

function requiredEnvironmentVariable(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

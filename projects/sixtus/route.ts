import { type Context, Hono } from "@hono/hono";
import { createUIMessageStreamResponse } from "@ai";

import { createZodJsonBodyMiddleware } from "../../helper/hono.ts";
import { createRealtimeClientSecret } from "../../lib/openai.ts";
import { sixtusAuthMiddleware, type SixtusEnv } from "./auth.ts";
import { createSixtusUIMessageStream } from "./chat/index.ts";
import { contextLookupRoutes } from "./context-lookup/route.ts";
import { deleteLibraryItem, listLibraryItems } from "./database/index.ts";
import { createLibraryRoutes } from "./library/routes.ts";
import { searchLibrary } from "./library/search.ts";
import { handleLibraryUpload } from "./library/upload.ts";
import { sixtusModelRoutes } from "./models/route.ts";
import {
  type RealtimeClientSecretRequest,
  realtimeClientSecretRequestSchema,
  type SixtusRequest,
  sixtusRequestSchema,
} from "./schema.ts";
import { sixtusSubscriptionMiddleware } from "./subscription.ts";

const libraryRoutes = createLibraryRoutes({
  listLibraryItems,
  searchLibrary,
  handleLibraryUpload,
  deleteLibraryItem,
});

type SixtusChatEnv = {
  Variables: SixtusEnv["Variables"] & {
    parsedBody: SixtusRequest;
  };
};

export const sixtusRoutes = new Hono<SixtusEnv>();

sixtusRoutes.use("*", sixtusAuthMiddleware);

sixtusRoutes.post("/test", (c) => {
  const user = c.get("sixtusUser");
  return c.json({ ok: true, data: { user_id: user.id } });
});

const parseSixtusChatBody = createZodJsonBodyMiddleware(sixtusRequestSchema, {
  code: "INVALID_CHAT_REQUEST",
  message:
    "Expected a JSON body with messages, optional tutor_style, and optional model.",
});

sixtusRoutes.post(
  "/chat",
  sixtusSubscriptionMiddleware,
  parseSixtusChatBody,
  (c: Context<SixtusChatEnv>) => {
    const request = c.get("parsedBody");

    const user = c.get("sixtusUser");
    const stream = createSixtusUIMessageStream(request, {
      userId: user.id,
      onError: (error) => {
        console.error("Sixtus stream failed", error);
        return "Sixtus hit an error while generating the response. Please try again.";
      },
    });

    return createUIMessageStreamResponse({ stream });
  },
);

sixtusRoutes.route("/context-lookup", contextLookupRoutes);
sixtusRoutes.route("/library", libraryRoutes);
sixtusRoutes.route("/models", sixtusModelRoutes);

sixtusRoutes.post(
  "/realtime/client-secret",
  async (c) => {
    const user = c.get("sixtusUser");

    let rawBody: unknown = {};
    const contentType = c.req.header("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        rawBody = await c.req.json();
      } catch {
        return c.json(
          {
            ok: false,
            error: {
              code: "INVALID_CLIENT_SECRET_REQUEST",
              message: "Request body must be valid JSON.",
            },
          },
          400,
        );
      }
    }

    const parsed = realtimeClientSecretRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: {
            code: "INVALID_CLIENT_SECRET_REQUEST",
            message:
              "Expected JSON body with optional type and Realtime call model.",
            issues: parsed.error.issues,
          },
        },
        400,
      );
    }

    try {
      const { type, model }: RealtimeClientSecretRequest = parsed.data;
      const secret = await createRealtimeClientSecret({
        type,
        model,
        safetyIdentifier: await hashSafetyIdentifier(user.id),
      });

      return c.json({
        ok: true,
        data: {
          value: secret.value,
          expires_at: secret.expiresAt,
        },
      });
    } catch (error) {
      console.error("Failed to create Realtime client secret", error);
      return c.json(
        {
          ok: false,
          error: {
            code: "CLIENT_SECRET_CREATE_FAILED",
            message: "Failed to create a Realtime client secret.",
          },
        },
        500,
      );
    }
  },
);

async function hashSafetyIdentifier(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(userId),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

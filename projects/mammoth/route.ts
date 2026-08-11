import { type Context, Hono } from "@hono/hono";
import { createUIMessageStreamResponse } from "@ai";

import { createZodJsonBodyMiddleware } from "../../helper/hono.ts";
import { createRealtimeClientSecret } from "../../lib/openai.ts";
import { mammothAuthMiddleware, type MammothEnv } from "./auth.ts";
import { createMammothUIMessageStream } from "./chat.ts";
import { deleteLibraryItem, listLibraryItems } from "./database/index.ts";
import { createLibraryRoutes } from "./library/routes.ts";
import { searchLibrary } from "./library/search.ts";
import { handleLibraryUpload } from "./library/upload.ts";
import {
  type MammothRequest,
  type RealtimeClientSecretRequest,
  mammothRequestSchema,
  realtimeClientSecretRequestSchema,
} from "./schema.ts";
import { mammothSubscriptionMiddleware } from "./subscription.ts";

const libraryRoutes = createLibraryRoutes({
  listLibraryItems,
  searchLibrary,
  handleLibraryUpload,
  deleteLibraryItem,
});

type MammothChatEnv = {
  Variables: MammothEnv["Variables"] & {
    parsedBody: MammothRequest;
  };
};

export const mammothRoutes = new Hono<MammothEnv>();

mammothRoutes.use("*", mammothAuthMiddleware);

mammothRoutes.post("/test", (c) => {
  const user = c.get("mammothUser");
  return c.json({ ok: true, data: { user_id: user.id } });
});

const parseMammothChatBody = createZodJsonBodyMiddleware(mammothRequestSchema, {
  code: "INVALID_CHAT_REQUEST",
  message:
    "Expected a JSON body with messages, optional tutor_instructions/student_profile/memory, and optional model.",
});

mammothRoutes.post(
  "/chat",
  mammothSubscriptionMiddleware,
  parseMammothChatBody,
  (c: Context<MammothChatEnv>) => {
    const request = c.get("parsedBody");

    const stream = createMammothUIMessageStream(request, {
      onError: (error) => {
        console.error("Mammoth stream failed", error);
        return "Mammoth hit an error while generating the response. Please try again.";
      },
    });

    return createUIMessageStreamResponse({ stream });
  },
);

mammothRoutes.route("/library", libraryRoutes);

mammothRoutes.post(
  "/realtime/client-secret",
  async (c) => {
    const user = c.get("mammothUser");

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

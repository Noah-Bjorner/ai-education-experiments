import { Hono, type Context } from "@hono/hono";
import { createUIMessageStreamResponse } from "@ai";

import { createZodJsonBodyMiddleware } from "../../helper/hono.ts";
import { createRealtimeClientSecret } from "../../lib/openai.ts";
import { mammothAuthMiddleware, type MammothEnv } from "./auth.ts";
import { createMammothUIMessageStream } from "./chat.ts";
import { fileFromUrl } from "../../helper/file.ts";
import { handleLibraryUpload } from "./library/upload.ts";
import {
  mammothRequestSchema,
  realtimeClientSecretRequestSchema,
  type MammothRequest,
} from "./schema.ts";
import { mammothSubscriptionMiddleware } from "./subscription.ts";

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


mammothRoutes.post(
  "/library/upload",
  mammothSubscriptionMiddleware,
  async (c) => {
    const user = c.get("mammothUser");

    let form: Awaited<ReturnType<typeof c.req.parseBody>>;
    try {
      form = await c.req.parseBody();
    } catch {
      return c.json(
        {
          ok: false,
          error: {
            code: "INVALID_LIBRARY_UPLOAD",
            message:
              'Expected multipart/form-data with either a "file" or a "url" field.',
          },
        },
        400,
      );
    }

    const rawFile = form.file;
    const rawUrl = typeof form.url === "string" ? form.url.trim() : "";
    const hasFile = rawFile instanceof File;
    const hasUrl = rawUrl.length > 0;

    if (hasFile === hasUrl) {
      return c.json(
        {
          ok: false,
          error: {
            code: "INVALID_LIBRARY_UPLOAD",
            message:
              'Send exactly one of "file" (multipart file) or "url" (http/https link).',
          },
        },
        400,
      );
    }

    let file: File;
    let sourceUrl: string | undefined;

    if (hasFile) {
      file = rawFile;
    } else {
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new Error("URL must use http or https");
        }
      } catch {
        return c.json(
          {
            ok: false,
            error: {
              code: "INVALID_LIBRARY_UPLOAD",
              message: 'Invalid "url". Expected an absolute http(s) URL.',
            },
          },
          400,
        );
      }

      try {
        file = await fileFromUrl(rawUrl);
        sourceUrl = rawUrl;
      } catch (error) {
        console.error("Library upload URL fetch failed", error);
        return c.json(
          {
            ok: false,
            error: {
              code: "INVALID_LIBRARY_UPLOAD",
              message: "Failed to fetch the provided url.",
            },
          },
          400,
        );
      }
    }

    try {
      const artifact = await handleLibraryUpload({
        userId: user.id,
        file,
        sourceUrl,
      });

      return c.json({ ok: true, data: { url: artifact.url, name: artifact.name, type: artifact.type } });
    } catch (error) {
      console.error("Library upload failed", error);
      return c.json(
        {
          ok: false,
          error: {
            code: "LIBRARY_UPLOAD_FAILED",
            message: "Failed to upload the file to the library.",
          },
        },
        500,
      );
    }
  },
);

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
              'Expected JSON body with optional type: "realtime" | "transcription".',
            issues: parsed.error.issues,
          },
        },
        400,
      );
    }

    try {
      const secret = await createRealtimeClientSecret({
        type: parsed.data.type,
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
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

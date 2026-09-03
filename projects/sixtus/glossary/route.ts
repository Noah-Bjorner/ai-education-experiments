import { type Context, Hono } from "@hono/hono";

import { createZodJsonBodyMiddleware } from "../../../helper/hono.ts";
import type { SixtusEnv } from "../auth.ts";
import { sixtusSubscriptionMiddleware } from "../subscription.ts";
import { generateGlossary } from "./index.ts";
import { type GlossaryRequest, glossaryRequestSchema } from "./schema.ts";

type GlossaryEnv = {
  Variables: SixtusEnv["Variables"] & {
    parsedBody: GlossaryRequest;
  };
};

export const glossaryRoutes = new Hono<SixtusEnv>();

const parseGlossaryBody = createZodJsonBodyMiddleware(glossaryRequestSchema, {
  code: "INVALID_GLOSSARY_REQUEST",
  message: "Expected a JSON body with messages.",
});

glossaryRoutes.post(
  "/",
  sixtusSubscriptionMiddleware,
  parseGlossaryBody,
  async (c: Context<GlossaryEnv>) => {
    const request = c.get("parsedBody");

    try {
      const data = await generateGlossary(request);
      return c.json({ ok: true, data });
    } catch (error) {
      console.error("Sixtus glossary generation failed", error);
      return c.json(
        {
          ok: false,
          error: {
            code: "GLOSSARY_GENERATE_FAILED",
            message: "Failed to generate a glossary from the messages.",
          },
        },
        500,
      );
    }
  },
);

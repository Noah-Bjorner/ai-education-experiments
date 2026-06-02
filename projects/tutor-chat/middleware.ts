import "@std/dotenv/load";

import { createApiKeyMiddleware } from "../../helper/hono.ts";

export const tutorChatApiKeyMiddleware = createApiKeyMiddleware(
  "TUTOR_CHAT_API_KEY",
);

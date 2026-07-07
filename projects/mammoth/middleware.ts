import "@std/dotenv/load";

import { createApiKeyMiddleware } from "../../helper/hono.ts";

export const mammothApiKeyMiddleware = createApiKeyMiddleware("MAMMOTH_API_KEY");

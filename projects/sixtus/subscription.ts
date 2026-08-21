import type { MiddlewareHandler } from "@hono/hono";

import type { SixtusEnv } from "./auth.ts";
import {
  hasActiveSubscription,
  subscriptionEnforcementEnabled,
} from "./entitlements.ts";

export function createSixtusSubscriptionMiddleware(): MiddlewareHandler<
  SixtusEnv
> {
  return async (c, next) => {
    if (!subscriptionEnforcementEnabled()) {
      await next();
      return;
    }

    const user = c.get("sixtusUser");
    if (!(await hasActiveSubscription(user.id))) {
      return c.json(
        {
          ok: false,
          error: {
            code: "ACTIVE_SUBSCRIPTION_REQUIRED",
            message: "An active subscription is required to send messages.",
          },
        },
        403,
      );
    }

    await next();
  };
}

export const sixtusSubscriptionMiddleware =
  createSixtusSubscriptionMiddleware();

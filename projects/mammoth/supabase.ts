import "@std/dotenv/load";

type SubscriptionEntitlement = {
  status: string;
  expires_at: string | null;
};

const supabaseURL = requiredEnvironmentVariable("SUPABASE_URL").replace(
  /\/$/,
  "",
);
const supabaseSecretKey = requiredEnvironmentVariable("SUPABASE_SECRET_KEY");

export function subscriptionEnforcementEnabled(): boolean {
  return Deno.env.get("MAMMOTH_REQUIRE_ACTIVE_SUBSCRIPTION")?.trim()
    .toLowerCase() === "true";
}

export async function hasActiveSubscription(userID: string): Promise<boolean> {
  const response = await supabaseRequest(
    `/rest/v1/subscription_entitlements?user_id=eq.${
      encodeURIComponent(userID)
    }` +
      "&select=status,expires_at&limit=1",
  );
  const entitlements = await response.json() as SubscriptionEntitlement[];
  const entitlement = entitlements[0];

  if (!entitlement) return false;
  if (!["active", "trialing", "grace_period"].includes(entitlement.status)) {
    return false;
  }

  return entitlement.expires_at === null ||
    new Date(entitlement.expires_at).getTime() > Date.now();
}

export async function recordMammothRequest({
  userID,
  method,
  path,
  responseStatus,
}: {
  userID: string;
  method: string;
  path: string;
  responseStatus: number;
}): Promise<void> {
  await supabaseRequest("/rest/v1/request_logs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      user_id: userID,
      method,
      path,
      response_status: responseStatus,
    }),
  });
}

async function supabaseRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("apikey", supabaseSecretKey);

  const response = await fetch(`${supabaseURL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Supabase Data API request failed (${response.status}): ${details}`,
    );
  }

  return response;
}

function requiredEnvironmentVariable(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

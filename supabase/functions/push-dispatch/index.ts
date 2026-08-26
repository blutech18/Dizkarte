// Supabase Edge Function: push-dispatch
//
// Second delivery channel for a notification that was already written in-app by
// the migration 0020/0043/0044 producers. Two invocation modes:
//
//   1. Webhook mode — `{ "record": { ...notifications row... } }`, sent by a
//      Supabase Database Webhook on INSERT into public.notifications.
//   2. Retry mode — `{ "mode": "retry", "limit": 100 }`, called by the scheduler.
//      Picks up pushes that failed transiently (`public.due_push_retries`) and
//      tries them again. Bounded by `push_max_attempts` and exponential backoff,
//      both decided in the database (migration 0044), so two dispatchers cannot
//      disagree about when a notification may be retried.
//
//   * Fails closed: refuses unless invoked with the shared PUSH_DISPATCH_SECRET,
//     and no-ops (ACK 200) when push is not configured, so it never crashes the
//     webhook or blocks the row.
//   * Respects the recipient's per-category `push` preference (default enabled),
//     matching how in-app delivery already respects `in_app`.
//   * Sends through Expo's push service, which needs a device token but no
//     server secret; the Apple/Google credentials live in the EAS build so the
//     app can receive. An optional EXPO_ACCESS_TOKEN is sent as a bearer when set.
//   * Records every outcome through `public.record_push_delivery`, which owns
//     delivery_status, attempt counting, backoff, and the terminal decision.
//
// The pure logic here (token validation, category mapping, message building)
// mirrors `@dizkarte/domain`'s push-delivery module, which is unit-tested; Deno
// cannot import the workspace bundle so it is restated.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_MAX_BATCH = 100;
const RETRY_BATCH_DEFAULT = 100;

function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token.trim());
}

function pushCategoryForType(type: string): string {
  switch (type) {
    case "OFFER_RECEIVED":
    case "OFFER_SELECTED":
      return "offers";
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_FAILED":
      return "payments";
    case "BOOKING_STARTED":
    case "COMPLETION_REQUESTED":
    case "COMPLETION_REMINDER":
    case "BOOKING_COMPLETED":
      return "bookings";
    case "DISPUTE_OPENED":
      return "disputes";
    case "REVIEW_RECEIVED":
    case "REVIEW_REMINDER":
      return "reviews";
    case "MESSAGE_RECEIVED":
      return "messages";
    case "VERIFICATION_DECISION":
      return "verification";
    case "NEARBY_TASK":
      return "nearby";
    default:
      return "system";
  }
}

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data: Record<string, string>;
};

function buildMessages(input: {
  tokens: string[];
  title: string;
  body: string;
  resourceType: string | null;
  resourceId: string | null;
}): ExpoMessage[] {
  const data: Record<string, string> = {};
  if (input.resourceType) data.resourceType = input.resourceType;
  if (input.resourceId) data.resourceId = input.resourceId;
  const seen = new Set<string>();
  const messages: ExpoMessage[] = [];
  for (const raw of input.tokens) {
    const token = raw.trim();
    if (!isExpoPushToken(token) || seen.has(token)) continue;
    seen.add(token);
    messages.push({ to: token, title: input.title, body: input.body, sound: "default", data });
  }
  return messages;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** The notification fields push delivery needs, from either invocation mode. */
type PushTarget = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  resource_type: string | null;
  resource_id: string | null;
};

type DeliveryOutcome = {
  delivered: boolean;
  reason: "delivered" | "muted" | "no_devices" | "provider_error";
  deviceCount: number;
};

// deno-lint-ignore no-explicit-any
type Client = any;

/**
 * Attempt one notification and record the outcome.
 *
 * `no_devices` is recorded as SUPPRESSED, not FAILED: there is nothing to retry
 * until the recipient registers a device, and marking it FAILED would put a
 * permanently undeliverable row into the retry sweep. In-app delivery already
 * happened, so nothing is lost.
 */
async function deliver(
  client: Client,
  target: PushTarget,
  expoAccessToken: string | undefined,
): Promise<DeliveryOutcome> {
  const category = pushCategoryForType(target.type);

  // Category preference: absent row means enabled.
  const { data: prefRow } = await client
    .from("notification_preferences")
    .select("push")
    .eq("user_id", target.user_id)
    .eq("category", category)
    .maybeSingle();
  const pushEnabled = (prefRow as { push?: boolean } | null)?.push !== false;

  if (!pushEnabled) {
    await record(client, target.id, "SUPPRESSED");
    return { delivered: false, reason: "muted", deviceCount: 0 };
  }

  const { data: deviceRows } = await client
    .from("devices")
    .select("token_reference")
    .eq("user_id", target.user_id)
    .eq("enabled", true);
  const tokens = ((deviceRows ?? []) as ReadonlyArray<{ token_reference: string }>).map(
    (row) => row.token_reference,
  );

  const messages = buildMessages({
    tokens,
    title: String(target.title ?? ""),
    body: String(target.body ?? ""),
    resourceType: target.resource_type ?? null,
    resourceId: target.resource_id ?? null,
  });

  if (messages.length === 0) {
    await record(client, target.id, "SUPPRESSED");
    return { delivered: false, reason: "no_devices", deviceCount: 0 };
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (expoAccessToken) headers.authorization = `Bearer ${expoAccessToken}`;

  let allOk = true;
  let lastError = "";
  for (let i = 0; i < messages.length; i += EXPO_PUSH_MAX_BATCH) {
    const batch = messages.slice(i, i + EXPO_PUSH_MAX_BATCH);
    try {
      const res = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        allOk = false;
        // Status only: a provider body can contain tokens, so it is not stored.
        lastError = `expo responded ${res.status}`;
      }
    } catch {
      allOk = false;
      lastError = "expo request failed";
    }
  }

  await record(client, target.id, allOk ? "SENT" : "FAILED", allOk ? null : lastError);
  return {
    delivered: allOk,
    reason: allOk ? "delivered" : "provider_error",
    deviceCount: messages.length,
  };
}

/**
 * Delivery bookkeeping lives in the database (0044): attempts, backoff, and
 * whether a failure is terminal. A direct table update here would bypass it.
 */
async function record(
  client: Client,
  notificationId: string,
  outcome: "SENT" | "FAILED" | "SUPPRESSED",
  error: string | null = null,
): Promise<void> {
  await client.rpc("record_push_delivery", {
    p_notification_id: notificationId,
    p_outcome: outcome,
    p_error: error,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json(405, { success: false, error: { code: "VALIDATION_ERROR", message: "POST only" } });
  }

  const env = Deno.env.get("DIZKARTE_ENV") ?? "development";
  const pushMode = Deno.env.get("PUSH_MODE") ?? "synthetic";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const dispatchSecret = Deno.env.get("PUSH_DISPATCH_SECRET");
  const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN");

  if (!supabaseUrl || !serviceRoleKey) {
    return json(503, {
      success: false,
      error: { code: "CONFIGURATION_ERROR", message: "Server is not configured." },
    });
  }

  // Only a caller holding the shared secret (the Database Webhook or the
  // scheduler) may invoke this.
  if (!dispatchSecret || req.headers.get("x-dispatch-secret") !== dispatchSecret) {
    return json(401, {
      success: false,
      error: { code: "FORBIDDEN", message: "Invalid dispatch credentials." },
    });
  }

  // Push not configured: acknowledge without sending so the webhook is not
  // retried and the notification row is untouched. In-app delivery already
  // happened; push is a best-effort second channel.
  if (env === "production" && pushMode !== "live") {
    return json(200, { success: true, data: { delivered: false, reason: "push_not_live" } });
  }

  let payload: { record?: Record<string, unknown>; mode?: string; limit?: number };
  try {
    payload = JSON.parse(await req.text());
  } catch {
    return json(400, { success: false, error: { code: "VALIDATION_ERROR", message: "Bad body." } });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Retry mode -------------------------------------------------------
  if (payload.mode === "retry") {
    const limit = Number.isFinite(payload.limit) ? Number(payload.limit) : RETRY_BATCH_DEFAULT;
    const { data: dueRows, error } = await client.rpc("due_push_retries", { p_limit: limit });
    if (error) {
      return json(503, {
        success: false,
        error: { code: "PROVIDER_UNAVAILABLE", message: "Retry queue unavailable." },
      });
    }
    const due = (dueRows ?? []) as ReadonlyArray<PushTarget>;
    let delivered = 0;
    let failed = 0;
    for (const target of due) {
      const outcome = await deliver(client, target, expoAccessToken);
      if (outcome.delivered) delivered += 1;
      else if (outcome.reason === "provider_error") failed += 1;
    }
    return json(200, {
      success: true,
      data: { mode: "retry", considered: due.length, delivered, failed },
    });
  }

  // ---- Webhook mode -----------------------------------------------------
  const row = payload.record;
  if (!row || typeof row.id !== "string" || typeof row.user_id !== "string") {
    return json(400, {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Missing notification record." },
    });
  }

  const outcome = await deliver(
    client,
    {
      id: row.id as string,
      user_id: row.user_id as string,
      type: String(row.type ?? ""),
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      resource_type: (row.resource_type as string | null) ?? null,
      resource_id: (row.resource_id as string | null) ?? null,
    },
    expoAccessToken,
  );

  return json(200, {
    success: true,
    data: {
      delivered: outcome.delivered,
      reason: outcome.reason,
      deviceCount: outcome.deviceCount,
    },
  });
});

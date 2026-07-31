// Supabase Edge Function: push-dispatch
//
// Second delivery channel for a notification that was already written in-app by
// the migration 0020 triggers. Intended to be invoked by a Supabase Database
// Webhook on INSERT into public.notifications.
//
//   * Fails closed: refuses unless invoked with the shared PUSH_DISPATCH_SECRET,
//     and no-ops (ACK 200) when push is not configured, so it never crashes the
//     webhook or blocks the row.
//   * Respects the recipient's per-category `push` preference (default enabled),
//     matching how in-app delivery already respects `in_app`.
//   * Sends through Expo's push service, which needs a device token but no
//     server secret; the Apple/Google credentials live in the EAS build so the
//     app can receive. An optional EXPO_ACCESS_TOKEN is sent as a bearer when set.
//   * Records the outcome on notifications.delivery_status (SENT/SUPPRESSED/FAILED)
//     using the service role.
//
// The pure logic here (token validation, category mapping, message building)
// mirrors `@dizkarte/domain`'s push-delivery module, which is unit-tested; Deno
// cannot import the workspace bundle so it is restated.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_MAX_BATCH = 100;

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
    case "BOOKING_COMPLETED":
      return "bookings";
    case "DISPUTE_OPENED":
      return "disputes";
    case "REVIEW_RECEIVED":
      return "reviews";
    case "MESSAGE_RECEIVED":
      return "messages";
    case "VERIFICATION_DECISION":
      return "verification";
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

  // Only the Database Webhook (which holds the shared secret) may invoke this.
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

  let payload: { record?: Record<string, unknown> };
  try {
    payload = JSON.parse(await req.text());
  } catch {
    return json(400, { success: false, error: { code: "VALIDATION_ERROR", message: "Bad body." } });
  }
  const record = payload.record;
  if (!record || typeof record.id !== "string" || typeof record.user_id !== "string") {
    return json(400, {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Missing notification record." },
    });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const notificationId = record.id as string;
  const userId = record.user_id as string;
  const type = String(record.type ?? "");
  const category = pushCategoryForType(type);

  // Category preference: absent row means enabled.
  const { data: prefRow } = await client
    .from("notification_preferences")
    .select("push")
    .eq("user_id", userId)
    .eq("category", category)
    .maybeSingle();
  const pushEnabled = (prefRow as { push?: boolean } | null)?.push !== false;

  async function markStatus(status: string): Promise<void> {
    await client.from("notifications").update({ delivery_status: status }).eq("id", notificationId);
  }

  if (!pushEnabled) {
    await markStatus("SUPPRESSED");
    return json(200, { success: true, data: { delivered: false, reason: "muted" } });
  }

  const { data: deviceRows } = await client
    .from("devices")
    .select("token_reference")
    .eq("user_id", userId)
    .eq("enabled", true);
  const tokens = ((deviceRows ?? []) as ReadonlyArray<{ token_reference: string }>).map(
    (row) => row.token_reference,
  );

  const messages = buildMessages({
    tokens,
    title: String(record.title ?? ""),
    body: String(record.body ?? ""),
    resourceType: (record.resource_type as string | null) ?? null,
    resourceId: (record.resource_id as string | null) ?? null,
  });

  if (messages.length === 0) {
    // No registered device yet; in-app delivery still stands.
    await markStatus("SENT");
    return json(200, { success: true, data: { delivered: false, reason: "no_devices" } });
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (expoAccessToken) headers.authorization = `Bearer ${expoAccessToken}`;

  let allOk = true;
  for (let i = 0; i < messages.length; i += EXPO_PUSH_MAX_BATCH) {
    const batch = messages.slice(i, i + EXPO_PUSH_MAX_BATCH);
    try {
      const res = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
      });
      if (!res.ok) allOk = false;
    } catch {
      allOk = false;
    }
  }

  await markStatus(allOk ? "SENT" : "FAILED");
  return json(200, { success: true, data: { delivered: allOk, deviceCount: messages.length } });
});

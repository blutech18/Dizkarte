/**
 * Push delivery core.
 *
 * The in-app notification is already written by the database triggers (migration
 * 0020). Push is the second delivery channel: a server process reads a
 * committed notification, checks the recipient's `push` preference for that
 * category, and sends to the recipient's registered devices through Expo's push
 * service.
 *
 * Expo's send endpoint accepts an `ExpoPushToken` and needs no server-side
 * secret to send (the Apple/Google credentials live in the EAS build so the app
 * can *receive*). That keeps this layer provider-neutral and testable: the
 * message construction, token validation, category gating, and chunking are all
 * pure and covered here; only the HTTP POST and the database reads live in the
 * edge function.
 */

export const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

/** Expo rejects a batch larger than 100 messages, so sends are chunked. */
export const EXPO_PUSH_MAX_BATCH = 100;

export type ExpoPushMessage = {
  readonly to: string;
  readonly title: string;
  readonly body: string;
  readonly sound: "default";
  readonly data: Record<string, string>;
};

/**
 * An `ExpoPushToken` looks like `ExponentPushToken[...]` or `Expo...`. Validating
 * shape before sending avoids posting garbage rows (a stored token from a
 * different push system, or a truncated value) to Expo.
 */
export function isExpoPushToken(token: string): boolean {
  const trimmed = token.trim();
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(trimmed);
}

/**
 * Map a notification event type to the preference category the user toggles.
 *
 * Mirrors `app.notification_category` in migration 0020 exactly — the two must
 * agree, or a user who muted a category in-app would still get it pushed.
 */
export function pushCategoryForType(type: string): string {
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
    // Listed explicitly even though `system` is the fallback: this mirrors
    // `app.notification_category` (0050), where the same event is spelled out so a
    // later rename cannot silently move it to a different user toggle.
    case "REPORT_RESOLVED":
      return "system";
    default:
      return "system";
  }
}

/**
 * Decide whether to push, given the recipient's stored preference row for the
 * category. A missing row means "not configured", which defaults to enabled —
 * the same default the database applies to in-app delivery.
 */
export function shouldPush(preference: { readonly push: boolean } | null | undefined): boolean {
  return preference?.push !== false;
}

/**
 * Build the Expo messages for one notification across a recipient's devices.
 *
 * Invalid or duplicate tokens are dropped rather than sent, so one stale row
 * cannot fail or duplicate the whole batch. `resourceType`/`resourceId` ride
 * along as string data so tapping the push can deep-link exactly like tapping
 * the in-app row.
 */
export function buildExpoMessages(input: {
  readonly tokens: ReadonlyArray<string>;
  readonly title: string;
  readonly body: string;
  readonly resourceType?: string | null;
  readonly resourceId?: string | null;
}): ExpoPushMessage[] {
  const data: Record<string, string> = {};
  if (input.resourceType) data.resourceType = input.resourceType;
  if (input.resourceId) data.resourceId = input.resourceId;

  const seen = new Set<string>();
  const messages: ExpoPushMessage[] = [];
  for (const token of input.tokens) {
    const trimmed = token.trim();
    if (!isExpoPushToken(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    messages.push({ to: trimmed, title: input.title, body: input.body, sound: "default", data });
  }
  return messages;
}

/** Split messages into Expo-sized batches. */
export function chunkExpoMessages(
  messages: ReadonlyArray<ExpoPushMessage>,
  size = EXPO_PUSH_MAX_BATCH,
): ExpoPushMessage[][] {
  const batches: ExpoPushMessage[][] = [];
  for (let i = 0; i < messages.length; i += size) {
    batches.push(messages.slice(i, i + size));
  }
  return batches;
}

/** Default attempt ceiling; the database setting `push_max_attempts` wins at runtime. */
export const PUSH_MAX_ATTEMPTS_DEFAULT = 3;

/**
 * Backoff for the next push attempt, in minutes: 2, 4, 8, 16, 32, 60, 60 …
 *
 * Mirrors `public.record_push_delivery` in migration 0044 exactly. The database
 * remains the authority (it is what a second dispatcher or a manual replay
 * reads); this exists so the schedule is unit-testable and so a caller can
 * explain "try again in N minutes" without a round trip.
 */
export function pushRetryBackoffMinutes(attempts: number): number {
  const bounded = Math.max(1, Math.min(6, Math.trunc(attempts)));
  return Math.min(60, 2 ** bounded);
}

/**
 * Whether a failed push may be attempted again.
 *
 * A push that has exhausted its attempts is allowed to stay failed: the in-app
 * notification is the durable channel, push is best-effort. Retrying forever
 * would turn one unreachable device into an unbounded background workload.
 */
export function canRetryPush(
  attempts: number,
  maxAttempts: number = PUSH_MAX_ATTEMPTS_DEFAULT,
): boolean {
  return Math.trunc(attempts) < Math.max(1, Math.trunc(maxAttempts));
}

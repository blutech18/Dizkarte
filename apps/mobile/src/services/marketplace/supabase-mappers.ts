import type {
  BookingId,
  BookingStatus,
  DisputeId,
  DisputeStatus,
  OfferId,
  OfferStatus,
  ReviewId,
  ReviewStatus,
  TaskId,
  TaskStatus,
  UserId,
} from "@dizkarte/domain";
import type {
  BookingEventRecord,
  DisputeRecord,
  MessageDeliveryStatus,
  NotificationPreferenceCategory,
  NotificationPreferences,
  NotificationRecord,
  NotificationType,
  ReviewRecord,
  WithdrawalRecord,
  WithdrawalRequestStatus,
} from "./types";

/**
 * Pure row -> DTO projections for the real Supabase marketplace adapter.
 *
 * Every coercion here is deliberately conservative: an enum value the app does
 * not recognize collapses to the most restrictive option rather than being
 * passed through, so a future database value can never widen what the UI
 * believes is allowed.
 */

const TASK_STATUSES: ReadonlyArray<TaskStatus> = [
  "DRAFT",
  "OPEN",
  "BOOKING_PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETION_REQUESTED",
  "COMPLETED",
  "EXPIRED",
  "CANCELLED",
  "DISPUTED",
  "REMOVED",
];

export function toTaskStatus(value: string | null | undefined): TaskStatus {
  return (TASK_STATUSES as ReadonlyArray<string>).includes(value ?? "")
    ? (value as TaskStatus)
    : "DRAFT";
}

const BOOKING_STATUSES: ReadonlyArray<BookingStatus> = [
  "PAYMENT_PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETION_REQUESTED",
  "COMPLETED",
  "PAYMENT_FAILED",
  "CANCELLED",
  "DISPUTED",
  "REFUNDED",
];

export function toBookingStatus(value: string | null | undefined): BookingStatus {
  return (BOOKING_STATUSES as ReadonlyArray<string>).includes(value ?? "")
    ? (value as BookingStatus)
    : "PAYMENT_PENDING";
}

const OFFER_STATUSES: ReadonlyArray<OfferStatus> = [
  "SUBMITTED",
  "SELECTED",
  "WITHDRAWN",
  "REJECTED",
  "EXPIRED",
];

export function toOfferStatus(value: string | null | undefined): OfferStatus {
  return (OFFER_STATUSES as ReadonlyArray<string>).includes(value ?? "")
    ? (value as OfferStatus)
    : "EXPIRED";
}

const DISPUTE_STATUSES: ReadonlyArray<DisputeStatus> = [
  "OPEN",
  "UNDER_REVIEW",
  "RESOLVED",
  "REJECTED",
  "CANCELLED",
];

export function toDisputeStatus(value: string | null | undefined): DisputeStatus {
  return (DISPUTE_STATUSES as ReadonlyArray<string>).includes(value ?? "")
    ? (value as DisputeStatus)
    : "OPEN";
}

const REVIEW_STATUSES: ReadonlyArray<ReviewStatus> = ["HIDDEN", "REVEALED", "MODERATED"];

export function toReviewStatus(value: string | null | undefined): ReviewStatus {
  return (REVIEW_STATUSES as ReadonlyArray<string>).includes(value ?? "")
    ? (value as ReviewStatus)
    : "HIDDEN";
}

const WITHDRAWAL_STATUSES: ReadonlyArray<WithdrawalRequestStatus> = [
  "REQUESTED",
  "RESERVED",
  "PROCESSING",
  "PAID",
  "FAILED",
  "CANCELLED",
];

export function toWithdrawalStatus(value: string | null | undefined): WithdrawalRequestStatus {
  return (WITHDRAWAL_STATUSES as ReadonlyArray<string>).includes(value ?? "")
    ? (value as WithdrawalRequestStatus)
    : "FAILED";
}

/** `booking_events.source` allows 'provider'; the app models that as 'webhook'. */
export function toBookingEventSource(value: string | null | undefined): BookingEventRecord["source"] {
  switch (value) {
    case "client":
    case "tasker":
    case "system":
      return value;
    case "provider":
      return "webhook";
    default:
      return "system";
  }
}

const NOTIFICATION_TYPES: ReadonlyArray<NotificationType> = [
  "OFFER_RECEIVED",
  "OFFER_SELECTED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_FAILED",
  "BOOKING_STARTED",
  "COMPLETION_REQUESTED",
  "BOOKING_COMPLETED",
  "DISPUTE_OPENED",
  "REVIEW_RECEIVED",
  "MESSAGE_RECEIVED",
  "VERIFICATION_DECISION",
];

/**
 * Legacy `notifications.type` values.
 *
 * Migration 0020 standardised the column on the event-type union above, but two
 * inserts predate it: `process_payment_event` and
 * `confirm_completion_and_release` write the coarse preference category instead.
 * Those are long, finance-critical functions that move money through the
 * balanced ledger, so they are left alone until the payment integration touches
 * them; their rows are mapped here instead of being shown as the wrong event.
 */
const LEGACY_NOTIFICATION_TYPES: Readonly<Record<string, NotificationType>> = {
  payments: "PAYMENT_CONFIRMED",
  bookings: "BOOKING_STARTED",
  offers: "OFFER_RECEIVED",
  messages: "MESSAGE_RECEIVED",
  disputes: "DISPUTE_OPENED",
  reviews: "REVIEW_RECEIVED",
  verification: "VERIFICATION_DECISION",
};

export function toNotificationType(value: string | null | undefined): NotificationType {
  if ((NOTIFICATION_TYPES as ReadonlyArray<string>).includes(value ?? "")) {
    return value as NotificationType;
  }
  return LEGACY_NOTIFICATION_TYPES[value ?? ""] ?? "MESSAGE_RECEIVED";
}

const NOTIFICATION_RESOURCE_TYPES = [
  "task",
  "booking",
  "conversation",
  "dispute",
  "review",
] as const;

export function toNotificationResourceType(
  value: string | null | undefined,
): NotificationRecord["resourceType"] {
  return (NOTIFICATION_RESOURCE_TYPES as ReadonlyArray<string>).includes(value ?? "")
    ? (value as NotificationRecord["resourceType"])
    : null;
}

export const NOTIFICATION_CATEGORIES: ReadonlyArray<NotificationPreferenceCategory> = [
  "offers",
  "payments",
  "bookings",
  "messages",
  "disputes",
  "reviews",
];

/**
 * Preferences default to enabled on both channels, matching the table defaults,
 * so a user with no stored row is treated the same as the database would.
 */
export function defaultNotificationPreferences(): NotificationPreferences {
  const entries = NOTIFICATION_CATEGORIES.map((category) => [
    category,
    { inApp: true, push: true },
  ]);
  return Object.fromEntries(entries) as NotificationPreferences;
}

export function mapNotificationPreferences(
  rows: ReadonlyArray<{ category: string; in_app: boolean; push: boolean }>,
): NotificationPreferences {
  const result: Record<string, { inApp: boolean; push: boolean }> = {
    ...defaultNotificationPreferences(),
  };
  for (const row of rows) {
    if (!(NOTIFICATION_CATEGORIES as ReadonlyArray<string>).includes(row.category)) continue;
    result[row.category] = { inApp: row.in_app, push: row.push };
  }
  return result as NotificationPreferences;
}

/**
 * Contact masking. Real contact details are never exposed through the booking
 * projection; the UI only needs a stable indication that a channel exists.
 */
export function maskContact(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) return "Contact shared in chat";
  return `${trimmed.slice(0, 1).toUpperCase()}••• — contact shared in chat`;
}

export type RawOfferRow = {
  readonly id: string;
  readonly task_id: string;
  readonly tasker_id: string;
  readonly amount_centavos: number;
  readonly message: string;
  readonly eta_text: string;
  readonly availability_text: string;
  readonly experience_text: string;
  readonly status: string;
  readonly created_at: string;
};

export type RawBookingRow = {
  readonly id: string;
  readonly task_id: string;
  readonly client_id: string;
  readonly tasker_id: string;
  readonly agreed_centavos: number;
  readonly status: string;
  readonly idempotency_key: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export function mapBookingEvent(row: {
  id: string;
  booking_id: string;
  from_status: string | null;
  to_status: string;
  actor_id: string | null;
  source: string;
  created_at: string;
}): BookingEventRecord {
  return {
    id: row.id,
    bookingId: row.booking_id as BookingId,
    fromStatus: row.from_status ? toBookingStatus(row.from_status) : null,
    toStatus: toBookingStatus(row.to_status),
    actorId: row.actor_id ? (row.actor_id as UserId) : null,
    source: toBookingEventSource(row.source),
    createdAt: row.created_at,
  };
}

export function mapDispute(row: {
  id: string;
  booking_id: string;
  opened_by: string;
  reason: string;
  status: string;
  created_at: string;
}): DisputeRecord {
  return {
    id: row.id as DisputeId,
    bookingId: row.booking_id as BookingId,
    openedBy: row.opened_by as UserId,
    reason: row.reason,
    status: toDisputeStatus(row.status),
    createdAt: row.created_at,
  };
}

export function mapReview(row: {
  id: string;
  booking_id: string;
  reviewer_id: string;
  reviewee_id: string;
  score: number;
  comment: string | null;
  status: string;
  submitted_at: string;
  revealed_at: string | null;
}): ReviewRecord {
  return {
    id: row.id as ReviewId,
    bookingId: row.booking_id as BookingId,
    reviewerId: row.reviewer_id as UserId,
    revieweeId: row.reviewee_id as UserId,
    score: Number(row.score),
    comment: row.comment ?? "",
    status: toReviewStatus(row.status),
    submittedAt: row.submitted_at,
    revealedAt: row.revealed_at,
  };
}

export function mapNotification(row: {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  resource_type: string | null;
  resource_id: string | null;
  read_at: string | null;
  created_at: string;
}): NotificationRecord {
  return {
    id: row.id as NotificationRecord["id"],
    userId: row.user_id as UserId,
    type: toNotificationType(row.type),
    title: row.title,
    body: row.body,
    resourceType: toNotificationResourceType(row.resource_type),
    resourceId: row.resource_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function mapWithdrawal(row: {
  id: string;
  tasker_id: string;
  amount_centavos: number;
  status: string;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}): WithdrawalRecord {
  const status = toWithdrawalStatus(row.status);
  return {
    id: row.id,
    userId: row.tasker_id as UserId,
    amountCentavos: Number(row.amount_centavos),
    status,
    requestedAt: row.created_at,
    // Only a terminal payout state carries a settlement timestamp.
    settledAt: status === "PAID" || status === "FAILED" ? row.updated_at : null,
    failureReason: row.failure_reason,
  };
}

export function mapOfferIds(row: RawOfferRow): {
  readonly id: OfferId;
  readonly taskId: TaskId;
  readonly taskerId: UserId;
} {
  return {
    id: row.id as OfferId,
    taskId: row.task_id as TaskId,
    taskerId: row.tasker_id as UserId,
  };
}

/** PostGIS EWKT literal for a WGS84 point, used when writing task locations. */
export function toPointLiteral(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

/**
 * Message delivery status. The database only stores durable messages, so any
 * row that came back from Supabase has been persisted; "sending"/"failed" are
 * purely client-side transient states.
 */
export function persistedDeliveryStatus(): MessageDeliveryStatus {
  return "sent";
}

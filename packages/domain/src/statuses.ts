/**
 * Domain status unions.
 *
 * Each union is the canonical set of states used by both the database `CHECK`
 * constraints and the TypeScript transition policies. Policy-dependent
 * transitions remain disabled by default until Client approval.
 */

export const VERIFICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "RESUBMISSION_REQUIRED",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const TASKER_APPLICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "RESUBMISSION_REQUIRED",
  "SUSPENDED",
] as const;
export type TaskerApplicationStatus = (typeof TASKER_APPLICATION_STATUSES)[number];

export const TASK_STATUSES = [
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
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const OFFER_STATUSES = [
  "SUBMITTED",
  "SELECTED",
  "WITHDRAWN",
  "REJECTED",
  "EXPIRED",
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const BOOKING_STATUSES = [
  "PAYMENT_PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETION_REQUESTED",
  "COMPLETED",
  "PAYMENT_FAILED",
  "CANCELLED",
  "DISPUTED",
  "REFUNDED",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = ["CREATED", "PENDING", "CONFIRMED", "FAILED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const WITHDRAWAL_STATUSES = [
  "REQUESTED",
  "RESERVED",
  "PROCESSING",
  "PAID",
  "FAILED",
  "CANCELLED",
] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

export const REVIEW_STATUSES = ["HIDDEN", "REVEALED", "MODERATED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const DISPUTE_STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "RESOLVED",
  "REJECTED",
  "CANCELLED",
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const REPORT_STATUSES = ["OPEN", "TRIAGED", "ACTIONED", "DISMISSED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const TICKET_STATUSES = ["OPEN", "PENDING", "RESOLVED", "CLOSED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const MODERATION_STATUSES = ["PENDING", "APPROVED", "REJECTED", "HIDDEN"] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const REFUND_STATUSES = ["REQUESTED", "PROCESSING", "SUCCEEDED", "FAILED"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const PROVIDER_EVENT_STATUSES = [
  "RECEIVED",
  "PROCESSED",
  "DUPLICATE",
  "QUARANTINED",
] as const;
export type ProviderEventStatus = (typeof PROVIDER_EVENT_STATUSES)[number];

export const NOTIFICATION_DELIVERY_STATUSES = ["PENDING", "SENT", "FAILED", "SUPPRESSED"] as const;
export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

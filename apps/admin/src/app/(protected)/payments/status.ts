import type { BadgeTone } from "@/components/ui/StatusBadge";
import type { PaymentIntentStatus } from "@/lib/repository/types";

/**
 * Shared vocabulary for the payments queue.
 *
 * Both tables previously rendered the raw enum, so a finance admin read
 * `PROTECTED` and `QUARANTINED` with no indication of where the money actually
 * sat. The label says the position; the tone only decorates it.
 */

export const PAYMENT_STATUS_OPTIONS: ReadonlyArray<PaymentIntentStatus> = [
  "CREATED",
  "PENDING",
  "CONFIRMED",
  "PROTECTED",
  "RELEASED",
  "REFUNDED",
  "FAILED",
];

export function paymentStatusLabel(status: string): string {
  switch (status) {
    case "CREATED":
      return "Created, not charged";
    case "PENDING":
      return "Charge pending";
    case "CONFIRMED":
      return "Charge confirmed";
    case "PROTECTED":
      return "Held in protection";
    case "RELEASED":
      return "Released to Tasker";
    case "REFUNDED":
      return "Refunded";
    case "FAILED":
      return "Charge failed";
    default:
      return status;
  }
}

export function paymentStatusTone(status: string): BadgeTone {
  switch (status) {
    case "RELEASED":
      return "success";
    case "FAILED":
      return "error";
    case "PROTECTED":
      return "info";
    case "PENDING":
      return "warning";
    case "REFUNDED":
      return "neutral";
    default:
      return "brand";
  }
}

export function providerEventStatusLabel(status: string): string {
  switch (status) {
    case "RECEIVED":
      return "Received";
    case "PROCESSED":
      return "Processed";
    case "DUPLICATE":
      return "Duplicate";
    case "QUARANTINED":
      return "Quarantined";
    default:
      return status;
  }
}

export function providerEventStatusTone(status: string): BadgeTone {
  switch (status) {
    case "PROCESSED":
      return "success";
    case "QUARANTINED":
      return "error";
    case "DUPLICATE":
      return "warning";
    default:
      return "neutral";
  }
}

/** Plain-language reconciliation outcome, shared with the reconciliation queue. */
export function reconciliationStatusLabel(status: string): string {
  switch (status) {
    case "MATCHED":
      return "Matched";
    case "DUPLICATE":
      return "Duplicate event";
    case "QUARANTINED":
      return "Quarantined";
    case "MISMATCH":
      return "Amount mismatch";
    case "UNMATCHED":
      return "No provider event";
    default:
      return status;
  }
}

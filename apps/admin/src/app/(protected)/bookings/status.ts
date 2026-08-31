import type { BadgeTone } from "@/components/ui/StatusBadge";
import type { BookingStatusValue } from "@/lib/repository/types";

/** Every booking status the marketplace can be in, in lifecycle order. */
export const BOOKING_STATUS_OPTIONS: ReadonlyArray<BookingStatusValue> = [
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

/**
 * Badge tone per booking status. Tone is decoration only — `StatusBadge` always
 * renders the literal status text, so the state is never conveyed by colour
 * alone.
 */
export function bookingTone(status: string): BadgeTone {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "DISPUTED":
    case "PAYMENT_FAILED":
      return "error";
    case "CANCELLED":
    case "REFUNDED":
      return "neutral";
    case "PAYMENT_PENDING":
      return "warning";
    default:
      return "brand";
  }
}

/**
 * Plain-language label for a booking status.
 *
 * The filter tabs previously rendered the raw enum, so an agent chose between
 * `COMPLETION_REQUESTED` and `PAYMENT_PENDING`. These say who is waiting on whom,
 * which is the question the agent is actually answering.
 */
export function bookingStatusLabel(status: string): string {
  switch (status) {
    case "PAYMENT_PENDING":
      return "Awaiting payment";
    case "CONFIRMED":
      return "Paid, not started";
    case "IN_PROGRESS":
      return "In progress";
    case "COMPLETION_REQUESTED":
      return "Awaiting client confirmation";
    case "COMPLETED":
      return "Completed work";
    case "PAYMENT_FAILED":
      return "Payment failed";
    case "CANCELLED":
      return "Cancelled";
    case "DISPUTED":
      return "In dispute";
    case "REFUNDED":
      return "Refunded";
    default:
      return status;
  }
}

/**
 * Who or what caused a lifecycle change.
 *
 * The `source` column stores machine tokens (`payments`,
 * `completion_confirmation_timeout`), which told an agent reading the history
 * nothing about accountability. Unknown values are humanised rather than
 * hidden, so a source added later reads as a phrase instead of looking broken.
 */
export function bookingEventSourceLabel(source: string): string {
  switch (source) {
    case "client":
      return "Client action";
    case "tasker":
      return "Tasker action";
    case "admin":
      return "Admin action";
    case "system":
      return "Automatic";
    case "provider":
      return "Payment provider";
    case "payments":
      return "Payment system";
    case "completion_confirmation_timeout":
      return "Confirmation window expired";
    case "freeze":
      return "Support freeze";
    default: {
      const words = source.replace(/[_-]+/g, " ").trim();
      return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Unknown";
    }
  }
}

/**
 * One sentence: who is expected to act, and where the money currently sits.
 *
 * A label alone does not answer the two questions asked on an escalation, and
 * the ledger position is the part an agent must not guess at.
 */
export function bookingStatusMeaning(status: string): string {
  switch (status) {
    case "PAYMENT_PENDING":
      return "Waiting on the Client to pay. No funds are held yet.";
    case "CONFIRMED":
      return "Funds are held in protection. Waiting on the Tasker to start the work.";
    case "IN_PROGRESS":
      return "Work is underway and funds remain held in protection.";
    case "COMPLETION_REQUESTED":
      return "The Tasker submitted completion. Waiting on the Client to confirm and release funds.";
    case "COMPLETED":
      return "Work was confirmed and the funds were released to the Tasker.";
    case "PAYMENT_FAILED":
      return "The charge did not succeed, so no funds are held. The Client can retry.";
    case "CANCELLED":
      return "Closed before completion. Any held funds were returned.";
    case "DISPUTED":
      return "Under support review. Funds stay held until the case is resolved.";
    case "REFUNDED":
      return "Settled by returning the funds to the Client.";
    default:
      return "This booking state is not recognised by the console.";
  }
}

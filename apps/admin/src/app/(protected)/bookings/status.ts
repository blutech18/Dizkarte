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

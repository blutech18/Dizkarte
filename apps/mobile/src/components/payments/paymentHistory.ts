import type { BookingRecord } from "../../services/marketplace/types";

/**
 * Payment-history classification and totals.
 *
 * Deliberately free of any `react-native` import so the money rules are
 * unit-testable under plain Node, like `taskFilterQuery` and `taskWizardSteps`.
 *
 * Every figure here is derived from a real `BookingRecord.agreedCentavos` and
 * the booking's authoritative status. Nothing is estimated: no platform fee and
 * no tax line is computed, because neither is exposed to the mobile client (the
 * configured platform fee lives server-side and the tax model is not yet
 * approved). The screen states that limitation rather than inventing a split.
 */

/** Which side of the account's money the viewer is looking at. */
export type PaymentDirection = "earned" | "outgoing";

/**
 * What has actually happened to the money for one booking.
 *
 * Mirrors the booking lifecycle rather than inventing a parallel payment state:
 * money only exists once the payment provider authoritatively confirms, and it
 * is only the Tasker's to withdraw once the Client confirms completion.
 */
export type SettlementState =
  | "awaiting_payment"
  | "payment_failed"
  | "protected"
  | "released"
  | "on_hold"
  | "refunded"
  | "cancelled";

export function settlementStateFor(status: BookingRecord["status"]): SettlementState {
  switch (status) {
    case "PAYMENT_PENDING":
      return "awaiting_payment";
    case "PAYMENT_FAILED":
      return "payment_failed";
    // Paid and held by the platform: confirmed, being worked, or awaiting the
    // Client's completion confirmation.
    case "CONFIRMED":
    case "IN_PROGRESS":
    case "COMPLETION_REQUESTED":
      return "protected";
    case "COMPLETED":
      return "released";
    case "DISPUTED":
      return "on_hold";
    case "REFUNDED":
      return "refunded";
    case "CANCELLED":
      return "cancelled";
  }
}

/** Whether this booking's money has actually moved (i.e. the payment cleared). */
export function hasClearedPayment(state: SettlementState): boolean {
  return state === "protected" || state === "released" || state === "on_hold";
}

/** Human label for a settlement state, phrased for the given side of the money. */
export function settlementLabel(state: SettlementState, direction: PaymentDirection): string {
  switch (state) {
    case "awaiting_payment":
      return direction === "earned" ? "Awaiting Client payment" : "Awaiting your payment";
    case "payment_failed":
      return "Payment not confirmed";
    case "protected":
      return direction === "earned" ? "Protected until completion" : "Held by the platform";
    case "released":
      return direction === "earned" ? "Released to you" : "Paid out";
    case "on_hold":
      return "On hold — dispute open";
    case "refunded":
      return direction === "earned" ? "Refunded to Client" : "Refunded to you";
    case "cancelled":
      return "Cancelled";
  }
}

/** Badge tone for a settlement state. Matches `BadgeTone` in the UI kit. */
export function settlementTone(
  state: SettlementState,
): "neutral" | "brand" | "success" | "warning" | "error" | "info" {
  switch (state) {
    case "released":
      return "success";
    case "protected":
      return "info";
    case "awaiting_payment":
      return "warning";
    case "payment_failed":
      return "error";
    case "on_hold":
      return "warning";
    case "refunded":
      return "brand";
    case "cancelled":
      return "neutral";
  }
}

/**
 * The bookings that belong to one side of the viewer's money, newest first.
 *
 * `listMyBookings` returns every booking the viewer is a party to — as the
 * Client who paid AND as the Tasker who was hired, because one account can be
 * both — so the direction filter is what separates "money out" from "money in".
 * A booking where the viewer is somehow both parties is excluded from `earned`
 * so a self-booking can never be counted as income.
 */
export function bookingsForDirection(
  bookings: ReadonlyArray<BookingRecord>,
  viewerId: string,
  direction: PaymentDirection,
): ReadonlyArray<BookingRecord> {
  return bookings
    .filter((booking) => {
      if (direction === "earned") {
        return booking.taskerId === viewerId && booking.clientId !== viewerId;
      }
      return booking.clientId === viewerId;
    })
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export type PaymentTotals = {
  /** Money that has fully settled (booking completed). */
  readonly releasedCentavos: number;
  /** Money that has cleared but is still held by the platform. */
  readonly protectedCentavos: number;
};

/**
 * Totals for one side of the money, counting only bookings whose payment
 * actually cleared. Pending, failed, cancelled, and refunded bookings are
 * deliberately excluded from both figures so a total never implies money that
 * did not move.
 */
export function totalsFor(
  bookings: ReadonlyArray<BookingRecord>,
  viewerId: string,
  direction: PaymentDirection,
): PaymentTotals {
  let releasedCentavos = 0;
  let protectedCentavos = 0;
  for (const booking of bookingsForDirection(bookings, viewerId, direction)) {
    const state = settlementStateFor(booking.status);
    if (state === "released") releasedCentavos += booking.agreedCentavos;
    else if (state === "protected" || state === "on_hold") {
      protectedCentavos += booking.agreedCentavos;
    }
  }
  return { releasedCentavos, protectedCentavos };
}

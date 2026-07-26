import type { BookingStatus, PaymentStatus } from "../statuses.js";
import type { ActorContext } from "../roles.js";
import type { TransitionMap } from "./machine.js";

/**
 * Booking lifecycle. A task has at most one active PAYMENT_PENDING/CONFIRMED
 * booking (enforced by a partial unique index in the database).
 */
export const bookingTransitions: TransitionMap<BookingStatus> = {
  PAYMENT_PENDING: ["CONFIRMED", "PAYMENT_FAILED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "DISPUTED", "CANCELLED", "REFUNDED"],
  IN_PROGRESS: ["COMPLETION_REQUESTED", "DISPUTED", "CANCELLED"],
  COMPLETION_REQUESTED: ["COMPLETED", "IN_PROGRESS", "DISPUTED"],
  COMPLETED: ["DISPUTED"],
  PAYMENT_FAILED: [],
  CANCELLED: [],
  DISPUTED: ["IN_PROGRESS", "COMPLETED", "REFUNDED", "CANCELLED"],
  REFUNDED: [],
};

/** Booking states considered "active" for the one-active-booking invariant. */
export const ACTIVE_BOOKING_STATUSES: ReadonlyArray<BookingStatus> = [
  "PAYMENT_PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETION_REQUESTED",
];

export function isActiveBooking(status: BookingStatus): boolean {
  return ACTIVE_BOOKING_STATUSES.includes(status);
}

/** Chat/exact-location gate: only opened once payment is authoritatively confirmed. */
export function isCommunicationUnlocked(status: BookingStatus): boolean {
  const unlocked: ReadonlyArray<BookingStatus> = [
    "CONFIRMED",
    "IN_PROGRESS",
    "COMPLETION_REQUESTED",
    "COMPLETED",
    "DISPUTED",
  ];
  return unlocked.includes(status);
}

/** Only the assigned Tasker may request completion. */
export function canRequestCompletion(
  actor: ActorContext,
  taskerId: string,
  status: BookingStatus,
): boolean {
  return actor.userId === taskerId && status === "IN_PROGRESS";
}

/**
 * Only the Client may confirm ordinary release. Clients cannot self-confirm
 * payment and Taskers cannot release funds (core invariant 4).
 */
export function canConfirmCompletion(
  actor: ActorContext,
  clientId: string,
  status: BookingStatus,
): boolean {
  return actor.userId === clientId && status === "COMPLETION_REQUESTED";
}

/** Either participant may open a dispute while the booking is live. */
export function canOpenDispute(
  actor: ActorContext,
  clientId: string,
  taskerId: string,
  status: BookingStatus,
): boolean {
  const disputable: ReadonlyArray<BookingStatus> = [
    "CONFIRMED",
    "IN_PROGRESS",
    "COMPLETION_REQUESTED",
    "COMPLETED",
  ];
  return (actor.userId === clientId || actor.userId === taskerId) && disputable.includes(status);
}

/**
 * Payment lifecycle. Confirmation is provider-authoritative; a client callback
 * can never move a payment to CONFIRMED.
 */
export const paymentTransitions: TransitionMap<PaymentStatus> = {
  CREATED: ["PENDING", "FAILED"],
  PENDING: ["CONFIRMED", "FAILED"],
  CONFIRMED: [],
  FAILED: [],
};

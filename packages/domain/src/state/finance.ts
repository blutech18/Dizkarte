import type { WithdrawalStatus, ReviewStatus, DisputeStatus } from "../statuses.js";
import type { ActorContext } from "../roles.js";
import { isAdminCapability } from "../roles.js";
import type { TransitionMap } from "./machine.js";

/**
 * Withdrawal lifecycle with exactly-once reservation reversal on failure.
 */
export const withdrawalTransitions: TransitionMap<WithdrawalStatus> = {
  REQUESTED: ["RESERVED", "CANCELLED"],
  RESERVED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["PAID", "FAILED"],
  PAID: [],
  FAILED: [],
  CANCELLED: [],
};

/** Only an approved Tasker may request a withdrawal of cleared funds. */
export function canRequestWithdrawal(
  actor: ActorContext,
  taskerId: string,
  availableCentavos: number,
  amountCentavos: number,
): boolean {
  if (actor.userId !== taskerId) return false;
  if (!actor.taskerApproved || actor.accountStatus !== "active") return false;
  // Withdrawal above cleared balance creates zero provider requests.
  return amountCentavos > 0 && amountCentavos <= availableCentavos;
}

/**
 * Review lifecycle: blind until both reviews exist or an approved reveal event.
 */
export const reviewTransitions: TransitionMap<ReviewStatus> = {
  HIDDEN: ["REVEALED", "MODERATED"],
  REVEALED: ["MODERATED"],
  MODERATED: [],
};

/** Only a booking participant may submit a review after completion. */
export function canSubmitReview(
  actor: ActorContext,
  clientId: string,
  taskerId: string,
  bookingCompleted: boolean,
): boolean {
  return (
    bookingCompleted &&
    (actor.userId === clientId || actor.userId === taskerId) &&
    actor.accountStatus === "active"
  );
}

/**
 * Dispute lifecycle. A dispute freezes affected financial activity without
 * rewriting ledger history.
 */
export const disputeTransitions: TransitionMap<DisputeStatus> = {
  OPEN: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["RESOLVED", "REJECTED"],
  RESOLVED: [],
  REJECTED: [],
  CANCELLED: [],
};

/** Only an active finance/super Admin may resolve a dispute or issue refunds/freezes. */
export function canResolveDispute(actor: ActorContext): boolean {
  if (actor.accountStatus !== "active") return false;
  return actor.capabilities.some(
    (c) => isAdminCapability(c) && (c === "ADMIN_FINANCE" || c === "ADMIN_SUPER"),
  );
}

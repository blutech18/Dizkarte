import type { VerificationStatus } from "../statuses.js";
import type { ActorContext } from "../roles.js";
import { isAdminCapability } from "../roles.js";
import type { TransitionMap } from "./machine.js";

/**
 * Verification lifecycle:
 * DRAFT -> SUBMITTED -> IN_REVIEW -> APPROVED | REJECTED | RESUBMISSION_REQUIRED
 * Resubmission starts a new version and returns to SUBMITTED.
 */
export const verificationTransitions: TransitionMap<VerificationStatus> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["IN_REVIEW"],
  IN_REVIEW: ["APPROVED", "REJECTED", "RESUBMISSION_REQUIRED"],
  RESUBMISSION_REQUIRED: ["SUBMITTED"],
  APPROVED: [],
  REJECTED: [],
};

/** Only the case owner may submit or resubmit. */
export function canSubmitVerification(actor: ActorContext, ownerId: string): boolean {
  return actor.userId === ownerId && actor.accountStatus === "active";
}

/** Only an active verification-capable Admin may decide a case. */
export function canDecideVerification(actor: ActorContext): boolean {
  if (actor.accountStatus !== "active") return false;
  return actor.capabilities.some(
    (c) => isAdminCapability(c) && (c === "ADMIN_SUPPORT" || c === "ADMIN_SUPER"),
  );
}

export const VERIFICATION_DECISION_STATUSES: ReadonlyArray<VerificationStatus> = [
  "APPROVED",
  "REJECTED",
  "RESUBMISSION_REQUIRED",
];

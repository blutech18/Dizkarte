import type { TaskStatus, OfferStatus } from "../statuses.js";
import type { ActorContext } from "../roles.js";
import type { TransitionMap } from "./machine.js";

/**
 * Task lifecycle. Alternatives (EXPIRED/CANCELLED/DISPUTED/REMOVED) are only
 * reachable when actor/policy permits; REMOVED is an Admin moderation target.
 */
export const taskTransitions: TransitionMap<TaskStatus> = {
  DRAFT: ["OPEN", "CANCELLED", "REMOVED"],
  OPEN: ["BOOKING_PENDING", "EXPIRED", "CANCELLED", "REMOVED"],
  BOOKING_PENDING: ["ASSIGNED", "OPEN", "CANCELLED", "REMOVED"],
  ASSIGNED: ["IN_PROGRESS", "DISPUTED", "CANCELLED", "REMOVED"],
  IN_PROGRESS: ["COMPLETION_REQUESTED", "DISPUTED", "CANCELLED", "REMOVED"],
  COMPLETION_REQUESTED: ["COMPLETED", "IN_PROGRESS", "DISPUTED"],
  COMPLETED: [],
  EXPIRED: [],
  CANCELLED: [],
  DISPUTED: ["IN_PROGRESS", "COMPLETED", "CANCELLED", "REMOVED"],
  REMOVED: [],
};

/** States in which a task is publicly discoverable. */
export const PUBLICLY_DISCOVERABLE_TASK_STATUSES: ReadonlyArray<TaskStatus> = ["OPEN"];

export function isPubliclyDiscoverable(status: TaskStatus): boolean {
  return PUBLICLY_DISCOVERABLE_TASK_STATUSES.includes(status);
}

/** States in which a Tasker may submit an offer. */
export function acceptsOffers(status: TaskStatus): boolean {
  return status === "OPEN";
}

/** Only a verified Client who owns the task may publish it. */
export function canPublishTask(actor: ActorContext, ownerId: string): boolean {
  return (
    actor.userId === ownerId &&
    actor.identityVerified &&
    actor.accountStatus === "active" &&
    actor.capabilities.includes("CLIENT")
  );
}

/** Only the task owner may edit an eligible task. */
export function canEditTask(actor: ActorContext, ownerId: string, status: TaskStatus): boolean {
  const editable: ReadonlyArray<TaskStatus> = ["DRAFT", "OPEN"];
  return actor.userId === ownerId && editable.includes(status);
}

/**
 * Offer lifecycle. Edits/replacements remain conservative and server-controlled.
 */
export const offerTransitions: TransitionMap<OfferStatus> = {
  SUBMITTED: ["SELECTED", "WITHDRAWN", "REJECTED", "EXPIRED"],
  SELECTED: ["REJECTED"], // e.g. payment failure releases the selection
  WITHDRAWN: [],
  REJECTED: [],
  EXPIRED: [],
};

/** Only an approved, active, verified Tasker may submit an offer. */
export function canSubmitOffer(actor: ActorContext): boolean {
  return (
    actor.taskerApproved &&
    actor.identityVerified &&
    actor.accountStatus === "active" &&
    actor.capabilities.includes("TASKER")
  );
}

/** Only the task owner may select an offer. */
export function canSelectOffer(actor: ActorContext, taskOwnerId: string): boolean {
  return actor.userId === taskOwnerId && actor.accountStatus === "active";
}

import type { BadgeTone } from "@/components/ui/StatusBadge";

/**
 * Shared vocabulary for Tasker application status, used by both the queue list
 * and the application detail screen so the two never describe the same state
 * differently.
 *
 * Raw enum values (`RESUBMISSION_REQUIRED`) are database vocabulary. A support
 * agent reading the screen needs to know what the state means and who is
 * currently expected to act, which is what `Meaning` provides.
 */

export type TaskerApplicationDecision =
  | "APPROVED"
  | "REJECTED"
  | "RESUBMISSION_REQUIRED"
  | "SUSPENDED";

/**
 * Filterable statuses in queue order: work first, then closed outcomes. DRAFT is
 * excluded because the queue read already omits it — an unsubmitted application
 * is not review work.
 */
export const TASKER_STATUS_OPTIONS = [
  "SUBMITTED",
  "IN_REVIEW",
  "RESUBMISSION_REQUIRED",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
] as const;

export function taskerApplicationStatusTone(status: string): BadgeTone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "REJECTED":
    case "SUSPENDED":
      return "error";
    case "RESUBMISSION_REQUIRED":
      return "warning";
    case "IN_REVIEW":
      return "info";
    default:
      return "neutral";
  }
}

export function taskerApplicationStatusLabel(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Not submitted yet";
    case "SUBMITTED":
      return "Awaiting review";
    case "IN_REVIEW":
      return "In review";
    case "APPROVED":
      return "Approved Tasker";
    case "REJECTED":
      return "Rejected";
    case "RESUBMISSION_REQUIRED":
      return "Resubmission requested";
    case "SUSPENDED":
      return "Suspended";
    default:
      return status;
  }
}

/** One sentence: what the state means and who is expected to act next. */
export function taskerApplicationStatusMeaning(status: string): string {
  switch (status) {
    case "DRAFT":
      return "The applicant started an application but has not submitted it. There is nothing to review yet.";
    case "SUBMITTED":
      return "This applicant is waiting on a decision from your team.";
    case "IN_REVIEW":
      return "Review has started. The applicant is waiting on a decision from your team.";
    case "APPROVED":
      return "This Tasker can submit offers and take paid work.";
    case "REJECTED":
      return "The application was turned down. The applicant can submit a new application.";
    case "RESUBMISSION_REQUIRED":
      return "The applicant was asked to correct their application. Waiting on them, not on you.";
    case "SUSPENDED":
      return "Tasker access is withdrawn. They cannot submit offers or start new paid work until reinstated.";
    default:
      return "";
  }
}

/** True while the applicant is waiting on your team, which is what makes a queue age worth showing. */
export function isAwaitingAdminDecision(status: string): boolean {
  return status === "SUBMITTED" || status === "IN_REVIEW";
}

export type TaskerDecisionOption = {
  readonly decision: TaskerApplicationDecision;
  readonly label: string;
  readonly title: string;
  readonly description: string;
  /**
   * Visual weight of the trigger. Exactly one option per status is `primary`, so
   * the recommended action is obvious and the rest do not compete with it.
   */
  readonly emphasis: "primary" | "secondary" | "destructive";
};

const APPROVE: TaskerDecisionOption = {
  decision: "APPROVED",
  label: "Approve application",
  title: "Approve Tasker application",
  description:
    "The applicant becomes an approved Tasker, is granted the Tasker capability, and can immediately submit offers and take paid work.",
  emphasis: "primary",
};

const REINSTATE: TaskerDecisionOption = {
  decision: "APPROVED",
  label: "Reinstate Tasker",
  title: "Reinstate suspended Tasker",
  description:
    "Clears the suspension and restores the Tasker capability. They can submit offers and take paid work again.",
  emphasis: "primary",
};

const REQUEST_RESUBMISSION: TaskerDecisionOption = {
  decision: "RESUBMISSION_REQUIRED",
  label: "Request changes",
  title: "Request a corrected application",
  description:
    "The applicant sees your reason and can submit a corrected application. Nothing is approved and no access is granted.",
  emphasis: "secondary",
};

const REJECT: TaskerDecisionOption = {
  decision: "REJECTED",
  label: "Reject application",
  title: "Reject Tasker application",
  description:
    "Turns down this application. No Tasker access is granted. The applicant can still submit a new application later.",
  emphasis: "destructive",
};

const SUSPEND: TaskerDecisionOption = {
  decision: "SUSPENDED",
  label: "Suspend Tasker",
  title: "Suspend approved Tasker",
  description:
    "Withdraws the Tasker capability. They cannot submit offers or start new paid work until reinstated. Existing bookings are not cancelled by this.",
  emphasis: "destructive",
};

/**
 * Decisions worth offering from the current status.
 *
 * `decide_tasker_application` accepts any of the four decisions from any status
 * and treats a same-status decision as a no-op, so offering all four everywhere
 * would present buttons that do nothing — for example "Approve" on an already
 * approved Tasker. Each status therefore offers only the decisions that change
 * something.
 *
 * `REJECTED` intentionally returns nothing: rejection is treated as final in the
 * console, and the applicant's route forward is a new application.
 */
export function taskerDecisionsFor(status: string): ReadonlyArray<TaskerDecisionOption> {
  switch (status) {
    case "SUBMITTED":
    case "IN_REVIEW":
      return [APPROVE, REQUEST_RESUBMISSION, REJECT];
    case "RESUBMISSION_REQUIRED":
      // Requesting resubmission again would be a no-op; the applicant already has that ball.
      return [APPROVE, REJECT];
    case "APPROVED":
      return [SUSPEND];
    case "SUSPENDED":
      return [REINSTATE, REJECT];
    default:
      return [];
  }
}

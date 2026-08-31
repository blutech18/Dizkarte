import type { BadgeTone } from "@/components/ui/StatusBadge";

/**
 * Shared vocabulary for task lifecycle status.
 *
 * The queue previously rendered the raw enum in the badge and coloured every
 * live status identically, so a disputed task and a task open for offers looked
 * the same. Tone is mapped per state here so the colour agrees with the label.
 */

export const TASK_STATUS_OPTIONS = [
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

export type TaskStatusValue = (typeof TASK_STATUS_OPTIONS)[number];

export function taskStatusLabel(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "OPEN":
      return "Open for offers";
    case "BOOKING_PENDING":
      return "Payment pending";
    case "ASSIGNED":
      return "Assigned";
    case "IN_PROGRESS":
      return "In progress";
    case "COMPLETION_REQUESTED":
      return "Completion requested";
    case "COMPLETED":
      return "Completed";
    case "EXPIRED":
      return "Expired";
    case "CANCELLED":
      return "Cancelled";
    case "DISPUTED":
      return "Disputed";
    case "REMOVED":
      return "Removed";
    default:
      return status;
  }
}

/**
 * One sentence saying what the state means for the task's visibility and who is
 * expected to act. The detail page states this under the status, where a label
 * alone would leave an agent guessing whether the task is still public.
 */
export function taskStatusMeaning(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Not published. Only the Client who owns it can see it.";
    case "OPEN":
      return "Published and visible in public discovery. Taskers can send offers.";
    case "BOOKING_PENDING":
      return "An offer was accepted. Waiting on the Client to pay before work can start.";
    case "ASSIGNED":
      return "Paid and assigned to a Tasker. Waiting on the work to start.";
    case "IN_PROGRESS":
      return "Work is underway.";
    case "COMPLETION_REQUESTED":
      return "The Tasker submitted completion. Waiting on the Client to confirm.";
    case "COMPLETED":
      return "The work was confirmed as finished.";
    case "EXPIRED":
      return "Closed without being booked. No longer in public discovery.";
    case "CANCELLED":
      return "Closed before completion by a participant.";
    case "DISPUTED":
      return "Under support review. The related booking is on hold.";
    case "REMOVED":
      return "Excluded from public discovery by an Admin decision.";
    default:
      return "This task state is not recognised by the console.";
  }
}

export function taskStatusTone(status: string): BadgeTone {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "DISPUTED":
    case "REMOVED":
      return "error";
    case "BOOKING_PENDING":
    case "COMPLETION_REQUESTED":
      return "warning";
    case "OPEN":
      return "brand";
    case "ASSIGNED":
    case "IN_PROGRESS":
      return "info";
    default:
      // Draft, expired, and cancelled are inert states, not problems.
      return "neutral";
  }
}

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

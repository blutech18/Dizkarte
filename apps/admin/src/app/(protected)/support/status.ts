import type { BadgeTone } from "@/components/ui/StatusBadge";

export function ticketStatusTone(status: string): BadgeTone {
  switch (status) {
    case "RESOLVED":
      return "success";
    case "CLOSED":
      return "neutral";
    case "PENDING":
      return "info";
    default:
      return "warning";
  }
}

/** Every ticket status, in handling order. */
export const TICKET_STATUS_OPTIONS = ["OPEN", "PENDING", "RESOLVED", "CLOSED"] as const;

export function ticketStatusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export const TICKET_STATUS_TRANSITIONS: Record<string, ReadonlyArray<string>> = {
  OPEN: ["PENDING", "RESOLVED", "CLOSED"],
  PENDING: ["OPEN", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
};

export function ticketStatusMeaning(status: string): string {
  switch (status) {
    case "OPEN":
      return "New support request awaiting triage and assignment.";
    case "PENDING":
      return "Active investigation in progress; awaiting response or resolution.";
    case "RESOLVED":
      return "The issue has been resolved and feedback communicated.";
    case "CLOSED":
      return "Support ticket is formally completed and closed.";
    default:
      return "Support ticket is currently in handling.";
  }
}


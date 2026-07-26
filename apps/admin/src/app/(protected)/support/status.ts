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

export function ticketStatusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export const TICKET_STATUS_TRANSITIONS: Record<string, ReadonlyArray<string>> = {
  OPEN: ["PENDING", "RESOLVED", "CLOSED"],
  PENDING: ["OPEN", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
};

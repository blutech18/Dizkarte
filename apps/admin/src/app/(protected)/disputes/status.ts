import type { BadgeTone } from "@/components/ui/StatusBadge";

export function disputeStatusTone(status: string): BadgeTone {
  switch (status) {
    case "RESOLVED":
      return "success";
    case "REJECTED":
    case "CANCELLED":
      return "neutral";
    case "UNDER_REVIEW":
      return "info";
    default:
      return "error";
  }
}

export function disputeStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export const DISPUTE_STATUS_TRANSITIONS: Record<string, ReadonlyArray<string>> = {
  OPEN: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["RESOLVED", "REJECTED"],
  RESOLVED: [],
  REJECTED: [],
  CANCELLED: [],
};

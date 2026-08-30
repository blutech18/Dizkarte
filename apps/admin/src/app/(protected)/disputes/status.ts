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

/** Every dispute status, in lifecycle order. */
export const DISPUTE_STATUS_OPTIONS = [
  "OPEN",
  "UNDER_REVIEW",
  "RESOLVED",
  "REJECTED",
  "CANCELLED",
] as const;

/**
 * Plain-language label.
 *
 * Previously this only replaced underscores, so the console showed
 * `UNDER REVIEW` — shouting the raw enum at a finance admin.
 */
export function disputeStatusLabel(status: string): string {
  switch (status) {
    case "OPEN":
      return "Open";
    case "UNDER_REVIEW":
      return "Under review";
    case "RESOLVED":
      return "Resolved";
    case "REJECTED":
      return "Rejected";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status.replace(/_/g, " ");
  }
}

/** One sentence: who acts next, and whether funds are still held. */
export function disputeStatusMeaning(status: string): string {
  switch (status) {
    case "OPEN":
      return "Filed and waiting to be picked up. Affected funds stay held.";
    case "UNDER_REVIEW":
      return "An Admin is reviewing the case. Affected funds stay held.";
    case "RESOLVED":
      return "Decided in the claimant's favour and settled.";
    case "REJECTED":
      return "Reviewed and turned down. The original booking outcome stands.";
    case "CANCELLED":
      return "Withdrawn before a decision was made.";
    default:
      return "This dispute state is not recognised by the console.";
  }
}

export const DISPUTE_STATUS_TRANSITIONS: Record<string, ReadonlyArray<string>> = {
  OPEN: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["RESOLVED", "REJECTED"],
  RESOLVED: [],
  REJECTED: [],
  CANCELLED: [],
};

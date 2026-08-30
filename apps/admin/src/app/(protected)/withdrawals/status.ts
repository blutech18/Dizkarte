import type { BadgeTone } from "@/components/ui/StatusBadge";

/**
 * Shared vocabulary for the payout queue.
 *
 * `RESERVED` in particular needs words: the funds are already deducted from the
 * Tasker's available balance but not yet sent, which is the state most likely to
 * prompt a support query.
 */

export const WITHDRAWAL_STATUS_OPTIONS = [
  "REQUESTED",
  "RESERVED",
  "PROCESSING",
  "PAID",
  "FAILED",
  "CANCELLED",
] as const;

export function withdrawalStatusLabel(status: string): string {
  switch (status) {
    case "REQUESTED":
      return "Requested";
    case "RESERVED":
      return "Funds reserved";
    case "PROCESSING":
      return "Sending to provider";
    case "PAID":
      return "Paid out";
    case "FAILED":
      return "Payout failed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

export function withdrawalStatusTone(status: string): BadgeTone {
  switch (status) {
    case "PAID":
      return "success";
    case "FAILED":
      return "error";
    case "RESERVED":
    case "PROCESSING":
      return "info";
    case "REQUESTED":
      return "warning";
    default:
      return "neutral";
  }
}

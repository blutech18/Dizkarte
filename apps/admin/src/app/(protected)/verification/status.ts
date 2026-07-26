import type { BadgeTone } from "@/components/ui/StatusBadge";

export function verificationStatusTone(status: string): BadgeTone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "REJECTED":
      return "error";
    case "RESUBMISSION_REQUIRED":
      return "warning";
    case "IN_REVIEW":
      return "info";
    default:
      return "neutral";
  }
}

export function verificationStatusLabel(status: string): string {
  switch (status) {
    case "SUBMITTED":
      return "Submitted";
    case "IN_REVIEW":
      return "In review";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "RESUBMISSION_REQUIRED":
      return "Resubmission required";
    default:
      return status;
  }
}

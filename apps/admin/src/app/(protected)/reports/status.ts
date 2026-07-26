import type { BadgeTone } from "@/components/ui/StatusBadge";

export function reportStatusTone(status: string): BadgeTone {
  switch (status) {
    case "ACTIONED":
      return "success";
    case "DISMISSED":
      return "neutral";
    case "TRIAGED":
      return "info";
    default:
      return "warning";
  }
}

export function reportStatusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export const REPORT_STATUS_TRANSITIONS: Record<string, ReadonlyArray<string>> = {
  OPEN: ["TRIAGED", "DISMISSED"],
  TRIAGED: ["ACTIONED", "DISMISSED"],
  ACTIONED: [],
  DISMISSED: [],
};

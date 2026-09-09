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

/** Every report status, in triage order. */
export const REPORT_STATUS_OPTIONS = ["OPEN", "TRIAGED", "ACTIONED", "DISMISSED"] as const;

export function reportStatusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export const REPORT_STATUS_TRANSITIONS: Record<string, ReadonlyArray<string>> = {
  OPEN: ["TRIAGED", "DISMISSED"],
  TRIAGED: ["ACTIONED", "DISMISSED"],
  ACTIONED: [],
  DISMISSED: [],
};

export function reportStatusMeaning(status: string): string {
  switch (status.toUpperCase()) {
    case "OPEN":
      return "Awaiting assignment and triage by a moderation admin.";
    case "TRIAGED":
      return "Under active investigation by the assigned moderator.";
    case "ACTIONED":
      return "Investigation concluded and moderation sanctions applied.";
    case "DISMISSED":
      return "Investigation concluded without violation or required sanction.";
    default:
      return "Report status recorded in system audit log.";
  }
}


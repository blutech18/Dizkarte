import type { BadgeTone } from "@/components/ui/StatusBadge";

export function reviewStatusTone(status: string): BadgeTone {
  switch (status) {
    case "REVEALED":
      return "success";
    case "MODERATED":
      return "error";
    default:
      // HIDDEN is the normal blind-window state, not a problem.
      return "info";
  }
}

/** Every review moderation state. HIDDEN is the normal pre-reveal state. */
export const REVIEW_STATUS_OPTIONS = ["HIDDEN", "REVEALED", "MODERATED"] as const;

export function reviewStatusLabel(status: string): string {
  switch (status) {
    case "REVEALED":
      return "Published";
    case "MODERATED":
      return "Hidden by moderator";
    case "HIDDEN":
      return "Awaiting reveal";
    default:
      return status.replace(/_/g, " ");
  }
}

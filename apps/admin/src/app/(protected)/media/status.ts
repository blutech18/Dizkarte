import type { BadgeTone } from "@/components/ui/StatusBadge";
import type { MediaModerationStatus } from "@/lib/repository/types";

export const MEDIA_STATUS_OPTIONS: ReadonlyArray<MediaModerationStatus> = [
  "PENDING",
  "APPROVED",
  "HIDDEN",
  "REJECTED",
];

export function mediaStatusTone(status: string): BadgeTone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "HIDDEN":
    case "REJECTED":
      return "error";
    default:
      return "warning";
  }
}

/**
 * Plain-language status labels.
 *
 * The raw enum values leak database vocabulary into a screen a support agent
 * reads all day; "PENDING" in particular does not say what is expected of them.
 */
export function mediaStatusLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return "Needs review";
    case "APPROVED":
      return "Approved";
    case "HIDDEN":
      return "Hidden";
    case "REJECTED":
      return "Rejected";
    default:
      return status;
  }
}

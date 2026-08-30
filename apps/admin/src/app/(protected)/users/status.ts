import type { BadgeTone } from "@/components/ui/StatusBadge";

/**
 * Shared vocabulary for account status, used by both the user directory and the
 * user detail page so the two never describe the same state differently.
 *
 * The stored values are lowercase database enums (`active`, `banned`). Rendering
 * them raw put database vocabulary in front of a support agent, and read as a
 * typo next to every other capitalised label in the console.
 */

export const USER_STATUS_OPTIONS = ["active", "suspended", "banned", "deactivated"] as const;

export type UserAccountStatus = (typeof USER_STATUS_OPTIONS)[number];

export function userStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "suspended":
      return "Suspended";
    case "banned":
      return "Banned";
    case "deactivated":
      return "Deactivated";
    default:
      return status;
  }
}

export function userStatusTone(status: string): BadgeTone {
  switch (status) {
    case "active":
      return "success";
    case "suspended":
      return "warning";
    case "banned":
      return "error";
    default:
      return "neutral";
  }
}

/**
 * One line naming who is currently blocked by this state.
 *
 * A status alone does not tell an agent whether the person can sign in, which is
 * the question that actually gets asked on a support call.
 */
export function userStatusMeaning(status: string): string {
  switch (status) {
    case "active":
      return "Can sign in and use every capability granted to this account.";
    case "suspended":
      return "Cannot sign in or take marketplace actions until reinstated. Capability grants are kept.";
    case "banned":
      return "Permanently locked out unless reversed by a Super Admin. Capability grants are kept.";
    case "deactivated":
      return "The account holder closed this account.";
    default:
      return "This account state is not recognised by the console.";
  }
}

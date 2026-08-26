import type { BookingStatus } from "@dizkarte/domain";
import type { IconName } from "../ui/Icon";

/**
 * Pure, exhaustive presentation map for the participant booking page.
 *
 * This module holds *only data* — no React, no theme, no react-native imports —
 * so it can be unit-tested under plain Node and reasoned about in isolation.
 * `BookingStatusWorkspace` maps the returned `tone` to concrete theme colors and
 * turns `primaryAction` into the correct button/callback; the route/controller
 * owns the actual repository mutations, navigation, and the authoritative
 * `isCommunicationUnlocked` gate.
 *
 * Invariants intentionally encoded here (do not weaken):
 * - Only the Client is ever offered a payment action (`continue-payment`,
 *   `retry-payment`) — a Tasker never pays.
 * - Only the Tasker is offered `start-work` / `request-completion`.
 * - Only the Client is offered `confirm-release`; release stays manual and
 *   Client-confirmed.
 * - Terminal / off-path statuses (`PAYMENT_FAILED`, `CANCELLED`, `DISPUTED`,
 *   `REFUNDED`) never offer a lifecycle action and never carry a progress index,
 *   so the UI cannot render a misleading progress rail for them.
 * - `canDispute` mirrors the domain `canOpenDispute` disputable set exactly.
 */

/** The two authoritative participant roles the shared route can resolve. */
export type BookingRole = "client" | "tasker";

/**
 * Semantic tone for a status. Members match `BadgeTone` exactly so the value can
 * flow straight into `StatusBadge`, and the workspace maps each to a
 * solid/soft/on-soft theme triple.
 */
export type BookingStatusTone = "neutral" | "brand" | "success" | "warning" | "error" | "info";

/**
 * Whether the status sits on the normal booking lifecycle (a progress rail is
 * meaningful) or is a terminal/off-path outcome (a closure/exception summary is
 * shown instead). `active` ⇔ `progressIndex !== null`.
 */
export type BookingLifecycleGroup = "active" | "terminal";

/** The single role-appropriate lifecycle action a page may offer, if any. */
export type BookingPrimaryAction =
  | "continue-payment"
  | "retry-payment"
  | "start-work"
  | "request-completion"
  | "confirm-release"
  | "leave-review"
  | "none";

/** One concise labelled fact tile shown in the status hero. */
export type BookingStatusFact = {
  readonly label: string;
  readonly value: string;
};

/** Fully-resolved presentation for one (status, role) pair. */
export type BookingStatusPresentation = {
  readonly status: BookingStatus;
  readonly role: BookingRole;
  readonly tone: BookingStatusTone;
  readonly lifecycleGroup: BookingLifecycleGroup;
  /** Short human status label, e.g. "Payment pending". */
  readonly statusLabel: string;
  /** Semantic status glyph (never an emoji). */
  readonly icon: IconName;
  /** Uppercase-style hero eyebrow, e.g. "Payment checkpoint". */
  readonly eyebrow: string;
  /** Role-aware headline describing what is happening / what to do. */
  readonly title: string;
  /** Role-aware explanation shown under the headline. */
  readonly description: string;
  /** Role-aware short state label for the hero pill, e.g. "Action needed". */
  readonly stateLabel: string;
  /** Role-aware guidance shown in the primary panel. */
  readonly roleNote: string;
  /** Exactly two fact tiles for the hero. */
  readonly facts: readonly [BookingStatusFact, BookingStatusFact];
  /** Happy-path step index (0..3) or `null` for terminal/off-path statuses. */
  readonly progressIndex: number | null;
  /** The one role-appropriate lifecycle action, or `none`. */
  readonly primaryAction: BookingPrimaryAction;
  /** Whether "open a dispute" is a valid support action for this status. */
  readonly canDispute: boolean;
};

/**
 * The happy-path timeline. Step names and status mapping are lifecycle
 * invariants shared with the progress rail.
 */
export const PROGRESS_STEPS = ["Payment", "In progress", "Completion", "Released"] as const;

/** Per-status facts that do not vary by role, plus the status-level metadata. */
type StatusMeta = {
  readonly tone: BookingStatusTone;
  readonly icon: IconName;
  readonly statusLabel: string;
  readonly eyebrow: string;
  readonly progressIndex: number | null;
  readonly canDispute: boolean;
};

/** The role-varying half of a presentation. */
type RoleContent = {
  readonly stateLabel: string;
  readonly title: string;
  readonly description: string;
  readonly roleNote: string;
  readonly facts: readonly [BookingStatusFact, BookingStatusFact];
  readonly primaryAction: BookingPrimaryAction;
};

const STATUS_META: Record<BookingStatus, StatusMeta> = {
  PAYMENT_PENDING: {
    tone: "warning",
    icon: "wallet",
    statusLabel: "Payment pending",
    eyebrow: "Payment checkpoint",
    progressIndex: 0,
    canDispute: false,
  },
  PAYMENT_FAILED: {
    tone: "error",
    icon: "alert-circle",
    statusLabel: "Payment failed",
    eyebrow: "Payment checkpoint",
    progressIndex: null,
    canDispute: false,
  },
  CONFIRMED: {
    tone: "info",
    icon: "check-circle",
    statusLabel: "Confirmed",
    eyebrow: "Coordination checkpoint",
    progressIndex: 1,
    canDispute: true,
  },
  IN_PROGRESS: {
    tone: "brand",
    icon: "briefcase",
    statusLabel: "In progress",
    eyebrow: "Work in progress",
    progressIndex: 1,
    canDispute: true,
  },
  COMPLETION_REQUESTED: {
    tone: "warning",
    icon: "note",
    statusLabel: "Completion requested",
    eyebrow: "Completion checkpoint",
    progressIndex: 2,
    canDispute: true,
  },
  COMPLETED: {
    tone: "success",
    icon: "check-circle",
    statusLabel: "Completed",
    eyebrow: "Booking complete",
    progressIndex: 3,
    canDispute: true,
  },
  CANCELLED: {
    tone: "neutral",
    icon: "close",
    statusLabel: "Cancelled",
    eyebrow: "Booking closed",
    progressIndex: null,
    canDispute: false,
  },
  DISPUTED: {
    tone: "error",
    icon: "shield",
    statusLabel: "Disputed",
    eyebrow: "Case checkpoint",
    progressIndex: null,
    canDispute: false,
  },
  REFUNDED: {
    tone: "info",
    icon: "bank",
    statusLabel: "Refunded",
    eyebrow: "Refund resolved",
    progressIndex: null,
    canDispute: false,
  },
};

const ROLE_CONTENT: Record<BookingStatus, Record<BookingRole, RoleContent>> = {
  PAYMENT_PENDING: {
    client: {
      stateLabel: "Action needed",
      title: "Complete payment to activate this booking",
      description:
        "The booking activates only after the payment provider confirms your payment. Until then, work, chat, and private details stay locked.",
      roleNote:
        "You selected this Tasker. Continue to the payment provider to protect the funds and unlock coordination.",
      facts: [
        { label: "Booking state", value: "Not active yet" },
        { label: "Chat & details", value: "Locked" },
      ],
      primaryAction: "continue-payment",
    },
    tasker: {
      stateLabel: "Awaiting Client",
      title: "Waiting for the Client to pay",
      description:
        "The Client must complete payment before this booking becomes active. Wait for provider confirmation before starting work; chat and private details remain locked.",
      roleNote:
        "No action is needed from you yet. You will be notified when payment is confirmed and the booking unlocks.",
      facts: [
        { label: "Booking state", value: "Not active yet" },
        { label: "Chat & details", value: "Locked" },
      ],
      primaryAction: "none",
    },
  },
  PAYMENT_FAILED: {
    client: {
      stateLabel: "Retry available",
      title: "Payment was not confirmed",
      description:
        "The provider did not confirm this payment attempt. The booking is still inactive; retry payment to continue.",
      roleNote:
        "Retrying opens the payment provider again. Work, chat, and private details stay locked until a payment is confirmed.",
      facts: [
        { label: "Booking state", value: "Not active" },
        { label: "Work & chat", value: "Locked" },
      ],
      primaryAction: "retry-payment",
    },
    tasker: {
      stateLabel: "Awaiting Client",
      title: "The Client's payment did not go through",
      description:
        "This booking is still inactive because the payment provider did not confirm payment. The Client can retry; do not start work until it is confirmed, and chat and private details stay locked.",
      roleNote:
        "There is nothing to pay or fix on your side. You will be notified if a payment is confirmed and the booking activates.",
      facts: [
        { label: "Booking state", value: "Not active" },
        { label: "Work & chat", value: "Locked" },
      ],
      primaryAction: "none",
    },
  },
  CONFIRMED: {
    client: {
      stateLabel: "Awaiting Tasker",
      title: "Booking confirmed — coordinate with your Tasker",
      description:
        "Payment is confirmed and coordination is unlocked. The Tasker will start the work; use chat and the shared details to align on timing and access.",
      roleNote:
        "No action is needed to release funds yet. You will review completion once the Tasker submits the work.",
      facts: [
        { label: "Funds", value: "Protected" },
        { label: "Next step", value: "Tasker starts work" },
      ],
      primaryAction: "none",
    },
    tasker: {
      stateLabel: "Ready to start",
      title: "Payment is confirmed — start when ready",
      description:
        "Funds are protected and coordination is unlocked. Review the location and contact details, then mark the work in progress when you begin.",
      roleNote:
        "Start work once you are ready to begin. Use chat and the shared details to coordinate arrival.",
      facts: [
        { label: "Funds", value: "Protected" },
        { label: "Next step", value: "Start the work" },
      ],
      primaryAction: "start-work",
    },
  },
  IN_PROGRESS: {
    client: {
      stateLabel: "Work underway",
      title: "Your Tasker is working on this",
      description:
        "The booking is active and coordination is open. The Tasker will submit completion for your review; funds stay protected until you release them.",
      roleNote:
        "No action is needed yet. You will review evidence and release funds when the Tasker requests completion.",
      facts: [
        { label: "Booking state", value: "Active" },
        { label: "Funds", value: "Protected" },
      ],
      primaryAction: "none",
    },
    tasker: {
      stateLabel: "Work underway",
      title: "Work is in progress",
      description:
        "The booking is active and coordination is open. When the work is done, submit completion with any evidence so the Client can review and release funds.",
      roleNote:
        "Keep the Client updated through chat. Request completion once the work is finished.",
      facts: [
        { label: "Booking state", value: "Active" },
        { label: "Next step", value: "Request completion" },
      ],
      primaryAction: "request-completion",
    },
  },
  COMPLETION_REQUESTED: {
    client: {
      stateLabel: "Review needed",
      title: "Review the work and release funds",
      description:
        "The Tasker submitted the work as complete. Review the evidence below, then confirm to release the protected funds. Release is manual and only you can confirm it.",
      roleNote:
        "Confirming releases funds to the Tasker. If something is wrong, use support or open a dispute instead of confirming.",
      facts: [
        { label: "Funds", value: "Awaiting your release" },
        { label: "Next step", value: "Confirm & release" },
      ],
      primaryAction: "confirm-release",
    },
    tasker: {
      stateLabel: "Awaiting Client",
      title: "Waiting for the Client to confirm",
      description:
        "You submitted the work as complete. The Client is reviewing your evidence and will release the funds. No further action is needed from you right now.",
      roleNote:
        "Funds are released only after the Client confirms. You will be notified when that happens.",
      facts: [
        { label: "Funds", value: "Awaiting Client release" },
        { label: "Your submission", value: "Sent for review" },
      ],
      primaryAction: "none",
    },
  },
  COMPLETED: {
    client: {
      stateLabel: "Funds released",
      title: "Booking complete",
      description:
        "You confirmed completion and the funds were released. Share private feedback about your experience to help the community.",
      roleNote:
        "Leaving a review is optional and stays hidden until both sides submit or the review window closes.",
      facts: [
        { label: "Funds", value: "Released" },
        { label: "Next step", value: "Leave a review" },
      ],
      primaryAction: "leave-review",
    },
    tasker: {
      stateLabel: "Funds released",
      title: "Booking complete",
      description:
        "The Client confirmed completion and the funds were released to your balance. Share private feedback about working with this Client.",
      roleNote:
        "Leaving a review is optional and stays hidden until both sides submit or the review window closes.",
      facts: [
        { label: "Funds", value: "Released" },
        { label: "Next step", value: "Leave a review" },
      ],
      primaryAction: "leave-review",
    },
  },
  CANCELLED: {
    client: {
      stateLabel: "Closed",
      title: "This booking was cancelled",
      description:
        "This booking is closed and no longer active. There is no work to coordinate and private coordination details are not available. Your receipt and support remain accessible.",
      roleNote:
        "If you still need this task done, you can post it again from your tasks. Contact support with any questions about this cancellation.",
      facts: [
        { label: "Booking state", value: "Cancelled" },
        { label: "Coordination", value: "Closed" },
      ],
      primaryAction: "none",
    },
    tasker: {
      stateLabel: "Closed",
      title: "This booking was cancelled",
      description:
        "This booking is closed and no longer active. There is no work to perform and private coordination details are not available. Your receipt and support remain accessible.",
      roleNote:
        "No further action is needed. Contact support if you have questions about this cancellation.",
      facts: [
        { label: "Booking state", value: "Cancelled" },
        { label: "Coordination", value: "Closed" },
      ],
      primaryAction: "none",
    },
  },
  DISPUTED: {
    client: {
      stateLabel: "Under review",
      title: "This booking is under dispute",
      description:
        "Financial activity is paused while support reviews the case. Funds remain frozen and the full booking and ledger history are preserved. No release or refund happens automatically.",
      roleNote:
        "Support may contact you for details. Use the support channel below to add information to the case.",
      facts: [
        { label: "Funds", value: "Frozen" },
        { label: "Case history", value: "Preserved" },
      ],
      primaryAction: "none",
    },
    tasker: {
      stateLabel: "Under review",
      title: "This booking is under dispute",
      description:
        "Financial activity is paused while support reviews the case. Funds remain frozen and the full booking and ledger history are preserved. No release or refund happens automatically.",
      roleNote:
        "Support may contact you for details. Use the support channel below to add information to the case.",
      facts: [
        { label: "Funds", value: "Frozen" },
        { label: "Case history", value: "Preserved" },
      ],
      primaryAction: "none",
    },
  },
  REFUNDED: {
    client: {
      stateLabel: "Refunded",
      title: "This booking was refunded",
      description:
        "The protected funds were returned and the booking is closed. There is no active work or coordination. Your receipt shows the final settlement.",
      roleNote:
        "Refund timing to your original payment method depends on your provider. Contact support with any questions.",
      facts: [
        { label: "Funds", value: "Returned to Client" },
        { label: "Booking state", value: "Closed" },
      ],
      primaryAction: "none",
    },
    tasker: {
      stateLabel: "Refunded",
      title: "This booking was refunded",
      description:
        "The protected funds were returned to the Client and the booking is closed. There is no active work or coordination. The receipt records the final settlement.",
      roleNote:
        "No payout results from a refunded booking. Contact support if you have questions about this outcome.",
      facts: [
        { label: "Funds", value: "Returned to Client" },
        { label: "Booking state", value: "Closed" },
      ],
      primaryAction: "none",
    },
  },
};

/**
 * Resolve the complete, role-aware presentation for a booking status.
 *
 * Total over every `BookingStatus` and both `BookingRole`s — the backing maps
 * are `Record<BookingStatus, ...>`, so a new status cannot be added to the
 * domain without a compile error here.
 */
export function statusPresentationFor(
  status: BookingStatus,
  role: BookingRole,
): BookingStatusPresentation {
  const meta = STATUS_META[status];
  const content = ROLE_CONTENT[status][role];
  return {
    status,
    role,
    tone: meta.tone,
    lifecycleGroup: meta.progressIndex === null ? "terminal" : "active",
    statusLabel: meta.statusLabel,
    icon: meta.icon,
    eyebrow: meta.eyebrow,
    title: content.title,
    description: content.description,
    stateLabel: content.stateLabel,
    roleNote: content.roleNote,
    facts: content.facts,
    progressIndex: meta.progressIndex,
    primaryAction: content.primaryAction,
    canDispute: meta.canDispute,
  };
}

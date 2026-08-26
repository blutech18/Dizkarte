import { describe, expect, it } from "vitest";
import {
  BOOKING_STATUSES,
  canConfirmCompletion,
  canOpenDispute,
  canRequestCompletion,
  type ActorContext,
  type BookingStatus,
  type UserId,
} from "@dizkarte/domain";
import {
  PROGRESS_STEPS,
  statusPresentationFor,
  type BookingPrimaryAction,
  type BookingRole,
} from "./bookingStatusPresentation";

const ROLES: readonly BookingRole[] = ["client", "tasker"];
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const TASKER_ID = "22222222-2222-4222-8222-222222222222";

/** A minimal but complete participant actor; the booking rules only read `userId`. */
function actor(userId: string): ActorContext {
  return {
    userId: userId as UserId,
    capabilities: [],
    accountStatus: "active",
    identityVerified: true,
    taskerApproved: true,
  };
}

/** The five happy-path statuses that participate in the lifecycle rail. */
const ACTIVE_STATUSES: readonly BookingStatus[] = [
  "PAYMENT_PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETION_REQUESTED",
  "COMPLETED",
];

const PAYMENT_ACTIONS: readonly BookingPrimaryAction[] = ["continue-payment", "retry-payment"];
const TASKER_ONLY_ACTIONS: readonly BookingPrimaryAction[] = ["start-work", "request-completion"];

describe("statusPresentationFor", () => {
  it("returns a fully-populated presentation for every status and both roles", () => {
    for (const status of BOOKING_STATUSES) {
      for (const role of ROLES) {
        const p = statusPresentationFor(status, role);

        expect(p.status).toBe(status);
        expect(p.role).toBe(role);
        // Every human-facing string is present and non-empty.
        expect(p.statusLabel.trim().length).toBeGreaterThan(0);
        expect(p.eyebrow.trim().length).toBeGreaterThan(0);
        expect(p.title.trim().length).toBeGreaterThan(0);
        expect(p.description.trim().length).toBeGreaterThan(0);
        expect(p.stateLabel.trim().length).toBeGreaterThan(0);
        expect(p.roleNote.trim().length).toBeGreaterThan(0);
        expect(p.icon.trim().length).toBeGreaterThan(0);
        // Exactly two non-empty fact tiles.
        expect(p.facts).toHaveLength(2);
        for (const fact of p.facts) {
          expect(fact.label.trim().length).toBeGreaterThan(0);
          expect(fact.value.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("uses the designed semantic tone for each status (role-independent)", () => {
    const expectedTone: Record<BookingStatus, string> = {
      PAYMENT_PENDING: "warning",
      PAYMENT_FAILED: "error",
      CONFIRMED: "info",
      IN_PROGRESS: "brand",
      COMPLETION_REQUESTED: "warning",
      COMPLETED: "success",
      CANCELLED: "neutral",
      DISPUTED: "error",
      REFUNDED: "info",
    };
    for (const status of BOOKING_STATUSES) {
      for (const role of ROLES) {
        expect(statusPresentationFor(status, role).tone).toBe(expectedTone[status]);
      }
    }
  });

  it("uses a stable status label per status regardless of role", () => {
    const expectedLabel: Record<BookingStatus, string> = {
      PAYMENT_PENDING: "Payment pending",
      PAYMENT_FAILED: "Payment failed",
      CONFIRMED: "Confirmed",
      IN_PROGRESS: "In progress",
      COMPLETION_REQUESTED: "Completion requested",
      COMPLETED: "Completed",
      CANCELLED: "Cancelled",
      DISPUTED: "Disputed",
      REFUNDED: "Refunded",
    };
    for (const status of BOOKING_STATUSES) {
      expect(statusPresentationFor(status, "client").statusLabel).toBe(expectedLabel[status]);
      expect(statusPresentationFor(status, "tasker").statusLabel).toBe(expectedLabel[status]);
    }
  });
});

describe("lifecycle progress participation", () => {
  it("gives every active happy-path status a valid in-range progress index", () => {
    for (const status of ACTIVE_STATUSES) {
      for (const role of ROLES) {
        const p = statusPresentationFor(status, role);
        expect(p.lifecycleGroup).toBe("active");
        expect(p.progressIndex).not.toBeNull();
        expect(p.progressIndex).toBeGreaterThanOrEqual(0);
        expect(p.progressIndex).toBeLessThan(PROGRESS_STEPS.length);
      }
    }
  });

  it("never shows a progress rail for terminal / off-path statuses", () => {
    const terminal = BOOKING_STATUSES.filter((s) => !ACTIVE_STATUSES.includes(s));
    // Explicitly the four off-path outcomes.
    expect([...terminal].sort()).toEqual(
      ["CANCELLED", "DISPUTED", "PAYMENT_FAILED", "REFUNDED"].sort(),
    );
    for (const status of terminal) {
      for (const role of ROLES) {
        const p = statusPresentationFor(status, role);
        expect(p.lifecycleGroup).toBe("terminal");
        expect(p.progressIndex).toBeNull();
      }
    }
  });

  it("maps each active status to the expected step", () => {
    expect(statusPresentationFor("PAYMENT_PENDING", "client").progressIndex).toBe(0);
    expect(statusPresentationFor("CONFIRMED", "tasker").progressIndex).toBe(1);
    expect(statusPresentationFor("IN_PROGRESS", "tasker").progressIndex).toBe(1);
    expect(statusPresentationFor("COMPLETION_REQUESTED", "client").progressIndex).toBe(2);
    expect(statusPresentationFor("COMPLETED", "client").progressIndex).toBe(3);
  });
});

describe("role-appropriate primary actions (requirements 2.1–2.7)", () => {
  it("PAYMENT_PENDING: Client continues payment; Tasker waits", () => {
    expect(statusPresentationFor("PAYMENT_PENDING", "client").primaryAction).toBe(
      "continue-payment",
    );
    expect(statusPresentationFor("PAYMENT_PENDING", "tasker").primaryAction).toBe("none");
  });

  it("PAYMENT_FAILED: Client retries payment; Tasker has no payment action", () => {
    expect(statusPresentationFor("PAYMENT_FAILED", "client").primaryAction).toBe("retry-payment");
    expect(statusPresentationFor("PAYMENT_FAILED", "tasker").primaryAction).toBe("none");
  });

  it("CONFIRMED: Tasker starts work; Client waits", () => {
    expect(statusPresentationFor("CONFIRMED", "tasker").primaryAction).toBe("start-work");
    expect(statusPresentationFor("CONFIRMED", "client").primaryAction).toBe("none");
  });

  it("IN_PROGRESS: Tasker requests completion; Client waits", () => {
    expect(statusPresentationFor("IN_PROGRESS", "tasker").primaryAction).toBe("request-completion");
    expect(statusPresentationFor("IN_PROGRESS", "client").primaryAction).toBe("none");
  });

  it("COMPLETION_REQUESTED: Client confirms & releases; Tasker waits", () => {
    expect(statusPresentationFor("COMPLETION_REQUESTED", "client").primaryAction).toBe(
      "confirm-release",
    );
    expect(statusPresentationFor("COMPLETION_REQUESTED", "tasker").primaryAction).toBe("none");
  });

  it("COMPLETED: either participant can leave a review", () => {
    expect(statusPresentationFor("COMPLETED", "client").primaryAction).toBe("leave-review");
    expect(statusPresentationFor("COMPLETED", "tasker").primaryAction).toBe("leave-review");
  });

  it("CANCELLED, DISPUTED, REFUNDED: no lifecycle action for either role", () => {
    for (const status of ["CANCELLED", "DISPUTED", "REFUNDED"] as const) {
      expect(statusPresentationFor(status, "client").primaryAction).toBe("none");
      expect(statusPresentationFor(status, "tasker").primaryAction).toBe("none");
    }
  });

  it("never offers a Tasker a payment action, and never offers a Client start/request actions", () => {
    for (const status of BOOKING_STATUSES) {
      const taskerAction = statusPresentationFor(status, "tasker").primaryAction;
      const clientAction = statusPresentationFor(status, "client").primaryAction;
      expect(PAYMENT_ACTIONS).not.toContain(taskerAction);
      // Client can never confirm-release-by-starting-work etc.
      expect(TASKER_ONLY_ACTIONS).not.toContain(clientAction);
    }
  });
});

describe("actions and dispute availability stay consistent with domain rules", () => {
  const clientActor: ActorContext = actor(CLIENT_ID);
  const taskerActor: ActorContext = actor(TASKER_ID);

  it("request-completion is offered exactly when the domain allows the Tasker to request it", () => {
    for (const status of BOOKING_STATUSES) {
      const offered =
        statusPresentationFor(status, "tasker").primaryAction === "request-completion";
      expect(offered).toBe(canRequestCompletion(taskerActor, TASKER_ID, status));
    }
  });

  it("confirm-release is offered exactly when the domain allows the Client to confirm", () => {
    for (const status of BOOKING_STATUSES) {
      const offered = statusPresentationFor(status, "client").primaryAction === "confirm-release";
      expect(offered).toBe(canConfirmCompletion(clientActor, CLIENT_ID, status));
    }
  });

  it("canDispute mirrors the domain canOpenDispute set for a participant", () => {
    for (const status of BOOKING_STATUSES) {
      const domainDisputable = canOpenDispute(clientActor, CLIENT_ID, TASKER_ID, status);
      for (const role of ROLES) {
        expect(statusPresentationFor(status, role).canDispute).toBe(domainDisputable);
      }
    }
  });
});

describe("privacy and financial-safety copy is preserved (requirement 3)", () => {
  it("payment-pending and payment-failed explain that work/chat/details stay locked", () => {
    for (const status of ["PAYMENT_PENDING", "PAYMENT_FAILED"] as const) {
      for (const role of ROLES) {
        const p = statusPresentationFor(status, role);
        const factText = p.facts.map((f) => `${f.label} ${f.value}`).join(" ");
        const haystack = `${p.description} ${p.roleNote} ${factText}`.toLowerCase();
        expect(haystack).toContain("lock");
      }
    }
  });

  it("completion release copy stays manual and Client-confirmed", () => {
    const client = statusPresentationFor("COMPLETION_REQUESTED", "client");
    expect(client.description.toLowerCase()).toContain("manual");
    expect(client.roleNote.toLowerCase()).toContain("release");
  });

  it("disputed pages explain frozen funds and preserved history", () => {
    for (const role of ROLES) {
      const p = statusPresentationFor("DISPUTED", role);
      const haystack =
        `${p.description} ${p.facts.map((f) => `${f.label} ${f.value}`).join(" ")}`.toLowerCase();
      expect(haystack).toContain("frozen");
      expect(haystack).toContain("preserved");
    }
  });

  it("cancelled and refunded pages do not imply an active, unlocked booking", () => {
    for (const status of ["CANCELLED", "REFUNDED"] as const) {
      for (const role of ROLES) {
        const p = statusPresentationFor(status, role);
        expect(p.lifecycleGroup).toBe("terminal");
        const closed = `${p.facts.map((f) => f.value).join(" ")}`.toLowerCase();
        expect(closed).toMatch(/closed|cancelled|returned/);
      }
    }
  });
});

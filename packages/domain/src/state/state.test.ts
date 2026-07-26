import { describe, expect, it } from "vitest";
import {
  ACTIVE_BOOKING_STATUSES,
  DomainError,
  assertTransition,
  bookingTransitions,
  canConfirmCompletion,
  canDecideVerification,
  canOpenDispute,
  canPublishTask,
  canRequestCompletion,
  canRequestWithdrawal,
  canSelectOffer,
  canSubmitOffer,
  isCommunicationUnlocked,
  isPubliclyDiscoverable,
  paymentTransitions,
  taskTransitions,
  verificationTransitions,
  type ActorContext,
  type UserId,
} from "../index.js";

const uid = (n: number): UserId => `00000000-0000-4000-8000-00000000000${n}` as UserId;

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: uid(1),
    capabilities: [],
    accountStatus: "active",
    identityVerified: false,
    taskerApproved: false,
    ...overrides,
  };
}

describe("transition maps", () => {
  it("allows valid verification transitions and rejects invalid ones", () => {
    expect(() =>
      assertTransition("Verification", verificationTransitions, "SUBMITTED", "IN_REVIEW"),
    ).not.toThrow();
    expect(() =>
      assertTransition("Verification", verificationTransitions, "APPROVED", "REJECTED"),
    ).toThrow(DomainError);
  });

  it("keeps payment CONFIRMED terminal (provider-authoritative)", () => {
    expect(paymentTransitions.CONFIRMED).toEqual([]);
    expect(() => assertTransition("Payment", paymentTransitions, "CONFIRMED", "FAILED")).toThrow(
      DomainError,
    );
  });

  it("only lets a booking confirm from PAYMENT_PENDING", () => {
    expect(bookingTransitions.PAYMENT_PENDING).toContain("CONFIRMED");
    expect(bookingTransitions.COMPLETED).not.toContain("PAYMENT_PENDING");
  });
});

describe("task discovery predicates", () => {
  it("only OPEN tasks are publicly discoverable", () => {
    expect(isPubliclyDiscoverable("OPEN")).toBe(true);
    for (const s of ["DRAFT", "ASSIGNED", "COMPLETED", "REMOVED", "CANCELLED"] as const) {
      expect(isPubliclyDiscoverable(s)).toBe(false);
    }
  });
});

describe("communication gate (invariant 2)", () => {
  it("stays locked before authoritative payment confirmation", () => {
    expect(isCommunicationUnlocked("PAYMENT_PENDING")).toBe(false);
    expect(isCommunicationUnlocked("PAYMENT_FAILED")).toBe(false);
  });
  it("unlocks once confirmed", () => {
    expect(isCommunicationUnlocked("CONFIRMED")).toBe(true);
    expect(isCommunicationUnlocked("IN_PROGRESS")).toBe(true);
  });
});

describe("actor gates", () => {
  it("only a verified Client owner may publish a task", () => {
    const owner = actor({ userId: uid(1), identityVerified: true, capabilities: ["CLIENT"] });
    expect(canPublishTask(owner, uid(1))).toBe(true);
    expect(canPublishTask(owner, uid(2))).toBe(false);
    const unverified = actor({ userId: uid(1), capabilities: ["CLIENT"] });
    expect(canPublishTask(unverified, uid(1))).toBe(false);
  });

  it("only an approved verified active Tasker may submit an offer", () => {
    const t = actor({ taskerApproved: true, identityVerified: true, capabilities: ["TASKER"] });
    expect(canSubmitOffer(t)).toBe(true);
    expect(canSubmitOffer(actor({ taskerApproved: false }))).toBe(false);
    expect(
      canSubmitOffer(
        actor({ taskerApproved: true, identityVerified: true, accountStatus: "suspended" }),
      ),
    ).toBe(false);
  });

  it("only the task owner may select an offer", () => {
    expect(canSelectOffer(actor({ userId: uid(1) }), uid(1))).toBe(true);
    expect(canSelectOffer(actor({ userId: uid(2) }), uid(1))).toBe(false);
  });

  it("only the assigned Tasker requests completion; only the Client confirms", () => {
    const tasker = actor({ userId: uid(3) });
    const client = actor({ userId: uid(4) });
    expect(canRequestCompletion(tasker, uid(3), "IN_PROGRESS")).toBe(true);
    expect(canRequestCompletion(client, uid(3), "IN_PROGRESS")).toBe(false);
    expect(canConfirmCompletion(client, uid(4), "COMPLETION_REQUESTED")).toBe(true);
    // Tasker cannot release funds (invariant 4).
    expect(canConfirmCompletion(tasker, uid(4), "COMPLETION_REQUESTED")).toBe(false);
  });

  it("either participant may open a dispute on a live booking", () => {
    const client = actor({ userId: uid(4) });
    const stranger = actor({ userId: uid(9) });
    expect(canOpenDispute(client, uid(4), uid(3), "IN_PROGRESS")).toBe(true);
    expect(canOpenDispute(stranger, uid(4), uid(3), "IN_PROGRESS")).toBe(false);
  });

  it("blocks withdrawals above cleared balance", () => {
    const t = actor({ userId: uid(3), taskerApproved: true });
    expect(canRequestWithdrawal(t, uid(3), 10000, 10000)).toBe(true);
    expect(canRequestWithdrawal(t, uid(3), 10000, 10001)).toBe(false);
    expect(canRequestWithdrawal(t, uid(3), 10000, 0)).toBe(false);
  });

  it("only verification-capable Admins may decide cases", () => {
    expect(canDecideVerification(actor({ capabilities: ["ADMIN_SUPPORT"] }))).toBe(true);
    expect(canDecideVerification(actor({ capabilities: ["ADMIN_FINANCE"] }))).toBe(false);
    expect(canDecideVerification(actor({ capabilities: ["CLIENT"] }))).toBe(false);
  });
});

describe("active booking statuses", () => {
  it("captures the one-active-booking set", () => {
    expect(ACTIVE_BOOKING_STATUSES).toContain("PAYMENT_PENDING");
    expect(ACTIVE_BOOKING_STATUSES).toContain("CONFIRMED");
    expect(ACTIVE_BOOKING_STATUSES).not.toContain("CANCELLED");
    expect(taskTransitions.OPEN).toContain("BOOKING_PENDING");
  });
});

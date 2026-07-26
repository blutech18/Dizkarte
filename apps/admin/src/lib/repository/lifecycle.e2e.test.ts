import { describe, expect, it, vi } from "vitest";

import { PROVIDER_UNAVAILABLE } from "./types";

// The Admin repository module is `server-only`; stub it for the test runner.
vi.mock("server-only", () => ({}));

// Seeded Admin actors (conspicuously fake `*.invalid` accounts) and their
// least-privilege capabilities.
const SUPPORT = "support-admin@dev.dizkarte.invalid";
const FINANCE = "finance-admin@dev.dizkarte.invalid";

/**
 * Admin-side end-to-end resolution leg.
 *
 * Complements the mobile lifecycle test with the operator journey that runs in
 * the Admin app's own synthetic store: verification approval, assignment-gated
 * case handling with validated status transitions (report, ticket, dispute),
 * and fail-closed finance (refund/payout return PROVIDER_UNAVAILABLE before any
 * mutation because no approved provider/policy is configured). Each fresh
 * instance owns an isolated cloned state, so the flow is fully deterministic.
 */
describe("Dizkarte Admin end-to-end resolution", () => {
  it("approves verification, assigns + transitions cases, and fails closed on finance", async () => {
    const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
    const repo = new SyntheticAdminRepository();

    // --- 1. Verification approval (support capability) ------------------------
    const decision = await repo.decideVerificationCase({
      caseId: "ver-0001",
      decision: "APPROVED",
      reason: "Government ID and selfie match; details are legible.",
      actor: SUPPORT,
    });
    expect(decision.ok).toBe(true);

    const verCase = await repo.getVerificationCase("ver-0001");
    expect(verCase?.status).toBe("APPROVED");
    expect(verCase?.history.at(-1)?.actor).toBe(SUPPORT);
    expect(verCase?.history.at(-1)?.reason).toBe(
      "Government ID and selfie match; details are legible.",
    );

    // A finalized case cannot be silently re-decided.
    const reDecide = await repo.decideVerificationCase({
      caseId: "ver-0001",
      decision: "REJECTED",
      reason: "Changed my mind.",
      actor: SUPPORT,
    });
    expect(reDecide.ok).toBe(false);

    // --- 2. Report: assign to self, then a validated OPEN->TRIAGED->ACTIONED --
    const assignReport = await repo.assignCase({
      resourceType: "report",
      resourceId: "rpt-3001",
      assignee: SUPPORT,
      actor: SUPPORT,
      capability: "ADMIN_SUPPORT",
    });
    expect(assignReport.ok).toBe(true);
    expect((await repo.getReport({ reportId: "rpt-3001", actor: SUPPORT }))?.assignee).toBe(
      SUPPORT,
    );

    const triage = await repo.transitionCaseStatus({
      resourceType: "report",
      resourceId: "rpt-3001",
      toStatus: "TRIAGED",
      reason: "Confirmed duplicate cross-posting; routing to enforcement.",
      actor: SUPPORT,
      capability: "ADMIN_SUPPORT",
    });
    expect(triage.ok).toBe(true);

    const action = await repo.transitionCaseStatus({
      resourceType: "report",
      resourceId: "rpt-3001",
      toStatus: "ACTIONED",
      reason: "Listing removed and reporter notified.",
      actor: SUPPORT,
      capability: "ADMIN_SUPPORT",
    });
    expect(action.ok).toBe(true);
    expect((await repo.getReport({ reportId: "rpt-3001", actor: SUPPORT }))?.status).toBe(
      "ACTIONED",
    );

    // A disallowed transition out of a terminal status is rejected.
    const illegal = await repo.transitionCaseStatus({
      resourceType: "report",
      resourceId: "rpt-3001",
      toStatus: "OPEN",
      reason: "Should not be allowed.",
      actor: SUPPORT,
      capability: "ADMIN_SUPPORT",
    });
    expect(illegal.ok).toBe(false);

    // --- 3. Ticket: assign, then OPEN->RESOLVED->CLOSED ----------------------
    const assignTicket = await repo.assignCase({
      resourceType: "ticket",
      resourceId: "tkt-6001",
      assignee: SUPPORT,
      actor: SUPPORT,
      capability: "ADMIN_SUPPORT",
    });
    expect(assignTicket.ok).toBe(true);

    expect(
      (
        await repo.transitionCaseStatus({
          resourceType: "ticket",
          resourceId: "tkt-6001",
          toStatus: "RESOLVED",
          reason: "Provided upload workaround; user confirmed it worked.",
          actor: SUPPORT,
          capability: "ADMIN_SUPPORT",
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await repo.transitionCaseStatus({
          resourceType: "ticket",
          resourceId: "tkt-6001",
          toStatus: "CLOSED",
          reason: "No further response needed.",
          actor: SUPPORT,
          capability: "ADMIN_SUPPORT",
        })
      ).ok,
    ).toBe(true);

    // --- 4. Dispute: finance assignment, OPEN->UNDER_REVIEW->RESOLVED --------
    const assignDispute = await repo.assignCase({
      resourceType: "dispute",
      resourceId: "dsp-4001",
      assignee: FINANCE,
      actor: FINANCE,
      capability: "ADMIN_FINANCE",
    });
    expect(assignDispute.ok).toBe(true);

    expect(
      (
        await repo.transitionCaseStatus({
          resourceType: "dispute",
          resourceId: "dsp-4001",
          toStatus: "UNDER_REVIEW",
          reason: "Comparing before/after evidence against agreed scope.",
          actor: FINANCE,
          capability: "ADMIN_FINANCE",
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await repo.transitionCaseStatus({
          resourceType: "dispute",
          resourceId: "dsp-4001",
          toStatus: "RESOLVED",
          reason: "Partial refund agreed by both parties.",
          actor: FINANCE,
          capability: "ADMIN_FINANCE",
        })
      ).ok,
    ).toBe(true);
    expect((await repo.getDispute({ disputeId: "dsp-4001", actor: FINANCE }))?.status).toBe(
      "RESOLVED",
    );

    // --- 5. Fail-closed finance: refund + payout reject before any mutation --
    const intents = await repo.listPaymentIntents({ page: 1, pageSize: 1 });
    expect(intents.items.length).toBeGreaterThan(0);
    const refund = await repo.requestRefund({
      paymentIntentId: intents.items[0]!.id,
      reason: "Attempted refund with no approved provider configured.",
      actor: FINANCE,
      idempotencyKey: "e2e-refund-1",
    });
    expect(refund.ok).toBe(false);
    expect(refund.code).toBe(PROVIDER_UNAVAILABLE);

    const withdrawals = await repo.listWithdrawals({ page: 1, pageSize: 1 });
    expect(withdrawals.items.length).toBeGreaterThan(0);
    const payout = await repo.approveWithdrawal({
      withdrawalId: withdrawals.items[0]!.id,
      reason: "Attempted payout approval with no approved provider configured.",
      actor: FINANCE,
    });
    expect(payout.ok).toBe(false);
    expect(payout.code).toBe(PROVIDER_UNAVAILABLE);

    // --- 6. The actions above are audited ------------------------------------
    const audit = await repo.listAuditLogs({ page: 1, pageSize: 50 });
    expect(audit.items.length).toBeGreaterThan(0);
  });
});

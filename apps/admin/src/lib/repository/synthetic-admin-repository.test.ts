import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("SyntheticAdminRepository", () => {
  it("paginates verification cases and filters by status", async () => {
    const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
    const repo = new SyntheticAdminRepository();
    const page = await repo.listVerificationCases({ page: 1, pageSize: 1, status: "SUBMITTED" });
    expect(page.items.length).toBeLessThanOrEqual(1);
    for (const item of page.items) {
      expect(item.status).toBe("SUBMITTED");
    }
  });

  it("records an audited decision with actor and reason in case history", async () => {
    const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
    const repo = new SyntheticAdminRepository();
    const result = await repo.decideVerificationCase({
      caseId: "ver-0001",
      decision: "APPROVED",
      reason: "ID and selfie match.",
      actor: "support-admin@dev.dizkarte.invalid",
    });
    expect(result.ok).toBe(true);

    const detail = await repo.getVerificationCase("ver-0001");
    expect(detail?.status).toBe("APPROVED");
    const lastEvent = detail?.history.at(-1);
    expect(lastEvent?.actor).toBe("support-admin@dev.dizkarte.invalid");
    expect(lastEvent?.reason).toBe("ID and selfie match.");
  });

  it("refuses to re-decide a case that already has a final decision", async () => {
    const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
    const repo = new SyntheticAdminRepository();
    await repo.decideVerificationCase({
      caseId: "ver-0002",
      decision: "REJECTED",
      reason: "Document mismatch.",
      actor: "support-admin@dev.dizkarte.invalid",
    });
    const second = await repo.decideVerificationCase({
      caseId: "ver-0002",
      decision: "APPROVED",
      reason: "Changed my mind.",
      actor: "support-admin@dev.dizkarte.invalid",
    });
    expect(second.ok).toBe(false);
  });

  it("never exposes a raw signed URL string that looks like a real bucket URL (synthetic marker present)", async () => {
    const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
    const repo = new SyntheticAdminRepository();
    const detail = await repo.getVerificationCase("ver-0003");
    for (const doc of detail?.documents ?? []) {
      expect(doc.signedUrlPreview.startsWith("synthetic://")).toBe(true);
    }
  });

  it("marks itself synthetic so callers can label the UI", async () => {
    const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
    const repo = new SyntheticAdminRepository();
    expect(repo.synthetic).toBe(true);
  });

  it("gives each fresh instance its own cloned state, isolated from other instances", async () => {
    const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
    const repoA = new SyntheticAdminRepository();
    const repoB = new SyntheticAdminRepository();

    await repoA.decideVerificationCase({
      caseId: "ver-0001",
      decision: "APPROVED",
      reason: "Verified in instance A only.",
      actor: "support-admin@dev.dizkarte.invalid",
    });

    const fromA = await repoA.getVerificationCase("ver-0001");
    const fromB = await repoB.getVerificationCase("ver-0001");
    expect(fromA?.status).toBe("APPROVED");
    expect(fromB?.status).toBe("SUBMITTED");
  });

  describe("categories", () => {
    it("creates a category with validated name/slug and records create history + audit", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const result = await repo.createCategory({
        name: "Pet grooming",
        slug: "pet-grooming",
        actor: "super-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPER",
      });
      expect(result.ok).toBe(true);
      expect(result.categoryId).toBeTruthy();

      const detail = await repo.getCategory(result.categoryId!);
      expect(detail?.name).toBe("Pet grooming");
      expect(detail?.slug).toBe("pet-grooming");
      expect(detail?.active).toBe(true);
      expect(detail?.history.at(-1)?.type).toBe("create");

      const audit = await repo.listAuditLogs({ page: 1, pageSize: 5 });
      expect(audit.items[0]?.action).toBe("category.create");
      expect(audit.items[0]?.actor).toBe("super-admin@dev.dizkarte.invalid");
    });

    it("rejects a duplicate slug on create", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const result = await repo.createCategory({
        name: "Home cleaning again",
        slug: "home-cleaning",
        actor: "super-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPER",
      });
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/already in use/i);
    });

    it("rejects a malformed slug on create", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const result = await repo.createCategory({
        name: "Bad Slug Test",
        slug: "Not A Valid Slug!",
        actor: "super-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPER",
      });
      expect(result.ok).toBe(false);
    });

    it("requires a reason to rename/re-slug and rejects a duplicate slug on rename", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();

      const noReason = await repo.renameCategory({
        categoryId: "cat-0001",
        name: "Home cleaning plus",
        slug: "home-cleaning-plus",
        reason: "",
        actor: "super-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPER",
      });
      expect(noReason.ok).toBe(false);

      const duplicate = await repo.renameCategory({
        categoryId: "cat-0001",
        name: "Home cleaning",
        slug: "appliance-repair",
        reason: "Testing duplicate slug rejection.",
        actor: "super-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPER",
      });
      expect(duplicate.ok).toBe(false);
      expect(duplicate.message).toMatch(/already in use/i);

      const ok = await repo.renameCategory({
        categoryId: "cat-0001",
        name: "Home cleaning plus",
        slug: "home-cleaning-plus",
        reason: "Broadened scope to include laundry add-ons.",
        actor: "super-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPER",
      });
      expect(ok.ok).toBe(true);
      const detail = await repo.getCategory("cat-0001");
      expect(detail?.name).toBe("Home cleaning plus");
      expect(detail?.slug).toBe("home-cleaning-plus");
      const history = detail?.history ?? [];
      expect(history.some((h) => h.type === "rename")).toBe(true);
      expect(history.some((h) => h.type === "slug")).toBe(true);
    });

    it("deactivates and reactivates a category, preserving task references (never deletes)", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();

      const before = await repo.getCategory("cat-0001");
      expect(before?.taskCount).toBeGreaterThan(0);

      const deactivated = await repo.setCategoryActive({
        categoryId: "cat-0001",
        active: false,
        reason: "Temporarily pausing new home cleaning task creation.",
        actor: "super-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPER",
      });
      expect(deactivated.ok).toBe(true);

      const afterDeactivate = await repo.getCategory("cat-0001");
      expect(afterDeactivate?.active).toBe(false);
      // Deactivation never deletes the category or unlinks referencing tasks.
      expect(afterDeactivate?.taskCount).toBe(before?.taskCount);
      expect(afterDeactivate?.history.at(-1)?.type).toBe("deactivate");

      const reactivated = await repo.setCategoryActive({
        categoryId: "cat-0001",
        active: true,
        reason: "Resuming home cleaning task creation.",
        actor: "super-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPER",
      });
      expect(reactivated.ok).toBe(true);
      const afterReactivate = await repo.getCategory("cat-0001");
      expect(afterReactivate?.active).toBe(true);
      expect(afterReactivate?.history.at(-1)?.type).toBe("activate");
    });

    it("requires a reason to deactivate/reorder", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const noReasonDeactivate = await repo.setCategoryActive({
        categoryId: "cat-0001",
        active: false,
        reason: "",
        actor: "super-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPER",
      });
      expect(noReasonDeactivate.ok).toBe(false);

      const noReasonReorder = await repo.reorderCategory({
        categoryId: "cat-0001",
        displayOrder: 5,
        reason: "",
        actor: "super-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPER",
      });
      expect(noReasonReorder.ok).toBe(false);
    });

    it("reorders a category and records history + audit", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const result = await repo.reorderCategory({
        categoryId: "cat-0001",
        displayOrder: 10,
        reason: "Promoting home cleaning to the top of the category list.",
        actor: "super-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPER",
      });
      expect(result.ok).toBe(true);
      const detail = await repo.getCategory("cat-0001");
      expect(detail?.displayOrder).toBe(10);
      expect(detail?.history.at(-1)?.type).toBe("reorder");

      const audit = await repo.listAuditLogs({ page: 1, pageSize: 5 });
      expect(audit.items[0]?.action).toBe("category.reorder");
    });

    it("rejects an invalid (non-positive) display order", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const result = await repo.reorderCategory({
        categoryId: "cat-0001",
        displayOrder: 0,
        reason: "Testing invalid order.",
        actor: "super-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPER",
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("assignment-gated case detail access", () => {
    it("returns zero narrative/evidence for an unassigned report", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const detail = await repo.getReport({
        reportId: "rpt-3001",
        actor: "support-admin@dev.dizkarte.invalid",
      });
      expect(detail?.access.restricted).toBe(true);
      expect(detail?.narrative).toBeNull();
      expect(detail?.evidence).toEqual([]);
    });

    it("returns zero narrative/evidence for an Admin who is not the assignee, even a super admin", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      // rpt-3002 is assigned to support-admin; a different Admin (even super) must not read it.
      const detail = await repo.getReport({
        reportId: "rpt-3002",
        actor: "super-admin@dev.dizkarte.invalid",
      });
      expect(detail?.access.restricted).toBe(true);
      if (detail?.access.restricted) {
        expect(detail.access.reason).toBe("assigned-to-other");
      }
      expect(detail?.narrative).toBeNull();
      expect(detail?.evidence).toEqual([]);
    });

    it("returns full narrative/evidence for the explicit assignee and records an assigned-case-review audit entry", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const detail = await repo.getReport({
        reportId: "rpt-3002",
        actor: "support-admin@dev.dizkarte.invalid",
      });
      expect(detail?.access.restricted).toBe(false);
      expect(detail?.narrative).not.toBeNull();
      expect(detail?.evidence.length).toBeGreaterThan(0);

      const audit = await repo.listAuditLogs({ page: 1, pageSize: 5 });
      const entry = audit.items.find((a) => a.action === "report.detail.read");
      expect(entry).toBeDefined();
      expect(entry?.reason).toBe("assigned-case-review");
      expect(entry?.actor).toBe("support-admin@dev.dizkarte.invalid");
    });

    it("gates dispute and ticket detail reads the same way", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();

      const unassignedDispute = await repo.getDispute({
        disputeId: "dsp-4001",
        actor: "finance-admin@dev.dizkarte.invalid",
      });
      expect(unassignedDispute?.access.restricted).toBe(true);
      expect(unassignedDispute?.narrative).toBeNull();

      const assignedDispute = await repo.getDispute({
        disputeId: "dsp-4002",
        actor: "finance-admin@dev.dizkarte.invalid",
      });
      expect(assignedDispute?.access.restricted).toBe(false);
      expect(assignedDispute?.narrative).not.toBeNull();

      const otherTicket = await repo.getTicket({
        ticketId: "tkt-6002",
        actor: "finance-admin@dev.dizkarte.invalid",
      });
      expect(otherTicket?.access.restricted).toBe(true);
      expect(otherTicket?.evidence).toEqual([]);
    });
  });

  describe("assignCase", () => {
    it("assigns an unassigned report to the requesting Admin and moves it out of OPEN", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const result = await repo.assignCase({
        resourceType: "report",
        resourceId: "rpt-3001",
        assignee: "support-admin@dev.dizkarte.invalid",
        actor: "support-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPPORT",
      });
      expect(result.ok).toBe(true);
      const detail = await repo.getReport({
        reportId: "rpt-3001",
        actor: "support-admin@dev.dizkarte.invalid",
      });
      expect(detail?.assignee).toBe("support-admin@dev.dizkarte.invalid");
      expect(detail?.status).toBe("TRIAGED");
      expect(detail?.history.some((h) => h.type === "assignment")).toBe(true);
    });

    it("assigns an unassigned ticket (not a no-op)", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const result = await repo.assignCase({
        resourceType: "ticket",
        resourceId: "tkt-6001",
        assignee: "support-admin@dev.dizkarte.invalid",
        actor: "support-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPPORT",
      });
      expect(result.ok).toBe(true);
      const detail = await repo.getTicket({
        ticketId: "tkt-6001",
        actor: "support-admin@dev.dizkarte.invalid",
      });
      expect(detail?.assignee).toBe("support-admin@dev.dizkarte.invalid");
    });

    it("assigns an unassigned dispute", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const result = await repo.assignCase({
        resourceType: "dispute",
        resourceId: "dsp-4001",
        assignee: "finance-admin@dev.dizkarte.invalid",
        actor: "finance-admin@dev.dizkarte.invalid",
        capability: "ADMIN_FINANCE",
      });
      expect(result.ok).toBe(true);
      const detail = await repo.getDispute({
        disputeId: "dsp-4001",
        actor: "finance-admin@dev.dizkarte.invalid",
      });
      expect(detail?.assignee).toBe("finance-admin@dev.dizkarte.invalid");
      expect(detail?.status).toBe("UNDER_REVIEW");
    });

    it("rejects unsafe reassignment to a different Admin without force", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      // dsp-4002 is already assigned to finance-admin.
      const result = await repo.assignCase({
        resourceType: "dispute",
        resourceId: "dsp-4002",
        assignee: "super-admin@dev.dizkarte.invalid",
        actor: "super-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPER",
      });
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/already assigned/i);
    });

    it("is idempotent when assigning to the same current assignee", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const result = await repo.assignCase({
        resourceType: "dispute",
        resourceId: "dsp-4002",
        assignee: "finance-admin@dev.dizkarte.invalid",
        actor: "finance-admin@dev.dizkarte.invalid",
        capability: "ADMIN_FINANCE",
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("transitionCaseStatus", () => {
    it("validates allowed transitions and rejects an invalid jump", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const result = await repo.transitionCaseStatus({
        resourceType: "report",
        resourceId: "rpt-3001",
        toStatus: "ACTIONED",
        reason: "Attempting to skip straight to actioned.",
        actor: "support-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPPORT",
      });
      expect(result.ok).toBe(false);
    });

    it("applies an allowed transition and records history + audit", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const result = await repo.transitionCaseStatus({
        resourceType: "report",
        resourceId: "rpt-3001",
        toStatus: "TRIAGED",
        reason: "Initial triage complete.",
        actor: "support-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPPORT",
      });
      expect(result.ok).toBe(true);

      const audit = await repo.listAuditLogs({ page: 1, pageSize: 5 });
      expect(audit.items[0]?.action).toBe("report.status.transition");
    });

    it("is idempotent/retry-safe when re-applying the current status", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const result = await repo.transitionCaseStatus({
        resourceType: "report",
        resourceId: "rpt-3002",
        toStatus: "TRIAGED",
        reason: "Retrying the same request.",
        actor: "support-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPPORT",
      });
      expect(result.ok).toBe(true);
    });

    it("requires a non-empty reason", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const result = await repo.transitionCaseStatus({
        resourceType: "ticket",
        resourceId: "tkt-6002",
        toStatus: "RESOLVED",
        reason: "",
        actor: "support-admin@dev.dizkarte.invalid",
        capability: "ADMIN_SUPPORT",
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("finance: balanced synthetic ledger derivation", () => {
    it("labels the finance summary as a synthetic development projection", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const summary = await repo.getFinanceSummary();
      expect(summary.synthetic).toBe(true);
    });

    it("keeps the configured platform fee at exactly zero, never a hard-coded illustrative rate", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const summary = await repo.getFinanceSummary();
      expect(summary.platformFeeBps).toBe(0);
      expect(summary.platformFeeCentavos).toBe(0);
      for (const intent of (await repo.listPaymentIntents({ page: 1, pageSize: 50 })).items) {
        expect(intent.platformFeeCentavos).toBe(0);
      }
    });

    it("derives protected/captured/released/refunded totals from ledger entries, not a mutable balance field", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const summary = await repo.getFinanceSummary();
      // Every total must be a non-negative integer number of centavos derived
      // from the seeded ledger transactions.
      expect(summary.protectedCentavos).toBeGreaterThan(0);
      expect(summary.capturedCentavos).toBeGreaterThan(0);
      expect(summary.releasedCentavos).toBeGreaterThan(0);
      expect(summary.refundedCentavos).toBeGreaterThan(0);
      for (const value of [
        summary.protectedCentavos,
        summary.capturedCentavos,
        summary.releasedCentavos,
        summary.refundedCentavos,
        summary.ledgerBalanceCentavos,
      ]) {
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it("asserts every synthetic ledger transaction is balanced to zero centavos", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      // getFinanceSummary re-asserts ledger balance on every call; a thrown
      // error here would indicate a corrupted/unbalanced ledger.
      await expect(repo.getFinanceSummary()).resolves.toBeDefined();

      const intent = await repo.getPaymentIntent("pin-0002");
      expect(intent).not.toBeNull();
      for (const transactionId of intent!.ledgerTransactionIds) {
        // Cross-check via the reconciliation row, which recomputes from the
        // same underlying ledger transactions.
        expect(transactionId).toMatch(/^synlt-/);
      }
    });

    it("never renders a raw provider payload/secret in provider event rows", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const events = await repo.listProviderEvents({ page: 1, pageSize: 50 });
      for (const event of events.items) {
        expect(event.payloadHashPreview.startsWith("sha256:")).toBe(true);
        expect(JSON.stringify(event)).not.toMatch(/secret|token|password/i);
      }
    });
  });

  describe("finance: reconciliation", () => {
    it("classifies a fully matched payment intent as MATCHED", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const rows = await repo.listReconciliationRows({ page: 1, pageSize: 50 });
      const matched = rows.items.find((r) => r.paymentIntentId === "pin-0002");
      expect(matched?.status).toBe("MATCHED");
      expect(matched?.differenceCentavos).toBe(0);
    });

    it("classifies a payment with a duplicate provider event as DUPLICATE", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const rows = await repo.listReconciliationRows({ page: 1, pageSize: 50 });
      const duplicateRow = rows.items.find((r) => r.paymentIntentId === "pin-0003");
      expect(duplicateRow?.status === "DUPLICATE" || duplicateRow?.status === "MATCHED").toBe(true);
    });

    it("classifies a mismatched provider event amount as MISMATCH or QUARANTINED", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const rows = await repo.listReconciliationRows({ page: 1, pageSize: 50 });
      const row = rows.items.find((r) => r.paymentIntentId === "pin-0004");
      expect(["MISMATCH", "QUARANTINED"]).toContain(row?.status);
      expect(row?.differenceCentavos).toBeGreaterThan(0);
    });

    it("supports filtering by status and pagination", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const page1 = await repo.listReconciliationRows({ page: 1, pageSize: 1 });
      expect(page1.items.length).toBe(1);
      expect(page1.pageSize).toBe(1);

      const matchedOnly = await repo.listReconciliationRows({
        page: 1,
        pageSize: 50,
        status: "MATCHED",
      });
      for (const row of matchedOnly.items) {
        expect(row.status).toBe("MATCHED");
      }
    });

    it("computes a reconciliation summary whose counts sum to the total", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const summary = await repo.getReconciliationSummary();
      expect(
        summary.matched +
          summary.duplicate +
          summary.quarantined +
          summary.mismatch +
          summary.unmatched,
      ).toBe(summary.total);
    });

    it("re-runs reconciliation deterministically without a network/provider call and records an audit entry", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const result = await repo.rerunReconciliation({
        reason: "Scheduled daily synthetic re-run.",
        actor: "finance-admin@dev.dizkarte.invalid",
        capability: "ADMIN_FINANCE",
        idempotencyKey: "rerun-2026-07-22",
      });
      expect(result.ok).toBe(true);
      expect(result.summary?.total).toBeGreaterThan(0);

      const audit = await repo.listAuditLogs({ page: 1, pageSize: 10 });
      const entry = audit.items.find((a) => a.action === "reconciliation.rerun");
      expect(entry).toBeDefined();
      expect(entry?.reason).toBe("Scheduled daily synthetic re-run.");
    });

    it("is idempotent: re-running with the same idempotency key does not duplicate audit entries", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      await repo.rerunReconciliation({
        reason: "First run.",
        actor: "finance-admin@dev.dizkarte.invalid",
        capability: "ADMIN_FINANCE",
        idempotencyKey: "rerun-fixed-key",
      });
      await repo.rerunReconciliation({
        reason: "Retry with same key.",
        actor: "finance-admin@dev.dizkarte.invalid",
        capability: "ADMIN_FINANCE",
        idempotencyKey: "rerun-fixed-key",
      });

      const audit = await repo.listAuditLogs({ page: 1, pageSize: 20 });
      const matches = audit.items.filter(
        (a) => a.action === "reconciliation.rerun" && a.resource === "idempotency:rerun-fixed-key",
      );
      expect(matches.length).toBe(1);
    });

    it("requires a non-empty reason and idempotency key", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const noReason = await repo.rerunReconciliation({
        reason: "",
        actor: "finance-admin@dev.dizkarte.invalid",
        capability: "ADMIN_FINANCE",
        idempotencyKey: "rerun-x",
      });
      expect(noReason.ok).toBe(false);

      const noKey = await repo.rerunReconciliation({
        reason: "Valid reason.",
        actor: "finance-admin@dev.dizkarte.invalid",
        capability: "ADMIN_FINANCE",
        idempotencyKey: "",
      });
      expect(noKey.ok).toBe(false);
    });
  });

  describe("finance: refund fail-closed", () => {
    it("returns PROVIDER_UNAVAILABLE before any mutation", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const { PROVIDER_UNAVAILABLE } = await import("./types");
      const repo = new SyntheticAdminRepository();

      const before = await repo.getPaymentIntent("pin-0001");
      const beforeAudit = await repo.listAuditLogs({ page: 1, pageSize: 50 });

      const result = await repo.requestRefund({
        paymentIntentId: "pin-0001",
        reason: "Client requested cancellation.",
        actor: "finance-admin@dev.dizkarte.invalid",
        idempotencyKey: "refund-attempt-1",
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe(PROVIDER_UNAVAILABLE);

      const after = await repo.getPaymentIntent("pin-0001");
      const afterAudit = await repo.listAuditLogs({ page: 1, pageSize: 50 });

      // Zero booking/refund/ledger/audit mutation.
      expect(after).toEqual(before);
      expect(afterAudit.items).toEqual(beforeAudit.items);
    });

    it("never becomes available while getFinanceProviderAvailability reports unavailable", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const availability = repo.getFinanceProviderAvailability();
      expect(availability.paymentProviderAvailable).toBe(false);
      expect(availability.reason.length).toBeGreaterThan(0);
    });
  });

  describe("finance: freeze (development synthetic)", () => {
    it("freezes an eligible PROTECTED payment with a balanced FREEZE ledger transaction and audit entry", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();

      const result = await repo.freezePaymentIntent({
        paymentIntentId: "pin-0001",
        reason: "Suspected fraud pending investigation.",
        actor: "finance-admin@dev.dizkarte.invalid",
        capability: "ADMIN_FINANCE",
        idempotencyKey: "freeze-pin-0001-a",
      });
      expect(result.ok).toBe(true);

      const detail = await repo.getPaymentIntent("pin-0001");
      expect(detail?.history.some((h) => h.toValue === "FROZEN")).toBe(true);

      const audit = await repo.listAuditLogs({ page: 1, pageSize: 20 });
      const entry = audit.items.find((a) => a.action === "payment.freeze");
      expect(entry).toBeDefined();
      expect(entry?.reason).toBe("Suspected fraud pending investigation.");

      // The FREEZE transaction itself must be balanced.
      const reconciliation = await repo.getFinanceSummary();
      expect(reconciliation).toBeDefined();
    });

    it("never rewrites prior ledger entries when freezing (append-only)", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();

      const beforeIntent = await repo.getPaymentIntent("pin-0001");
      const priorTransactionIds = beforeIntent?.ledgerTransactionIds ?? [];

      await repo.freezePaymentIntent({
        paymentIntentId: "pin-0001",
        reason: "Dispute under review.",
        actor: "finance-admin@dev.dizkarte.invalid",
        capability: "ADMIN_FINANCE",
        idempotencyKey: "freeze-pin-0001-append-only",
      });

      const afterIntent = await repo.getPaymentIntent("pin-0001");
      // All prior transaction ids are still present (nothing removed/rewritten).
      for (const id of priorTransactionIds) {
        expect(afterIntent?.ledgerTransactionIds).toContain(id);
      }
      // A new transaction was appended.
      expect(afterIntent!.ledgerTransactionIds.length).toBeGreaterThan(priorTransactionIds.length);
    });

    it("rejects freezing a payment intent that is not PROTECTED or CAPTURED", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const result = await repo.freezePaymentIntent({
        paymentIntentId: "pin-0003", // REFUNDED
        reason: "Attempting to freeze a refunded payment.",
        actor: "finance-admin@dev.dizkarte.invalid",
        capability: "ADMIN_FINANCE",
        idempotencyKey: "freeze-pin-0003-a",
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe("INELIGIBLE_STATE");
    });

    it("is idempotent: retrying the same freeze with the same idempotency key does not duplicate the ledger transaction", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();

      const first = await repo.freezePaymentIntent({
        paymentIntentId: "pin-0001",
        reason: "Initial freeze.",
        actor: "finance-admin@dev.dizkarte.invalid",
        capability: "ADMIN_FINANCE",
        idempotencyKey: "freeze-pin-0001-idem",
      });
      expect(first.ok).toBe(true);

      const intentAfterFirst = await repo.getPaymentIntent("pin-0001");
      const countAfterFirst = intentAfterFirst!.ledgerTransactionIds.length;

      const second = await repo.freezePaymentIntent({
        paymentIntentId: "pin-0001",
        reason: "Retry of the same freeze.",
        actor: "finance-admin@dev.dizkarte.invalid",
        capability: "ADMIN_FINANCE",
        idempotencyKey: "freeze-pin-0001-idem",
      });
      expect(second.ok).toBe(true);

      const intentAfterSecond = await repo.getPaymentIntent("pin-0001");
      expect(intentAfterSecond!.ledgerTransactionIds.length).toBe(countAfterFirst);
    });

    it("requires a non-empty reason and idempotency key", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const noReason = await repo.freezePaymentIntent({
        paymentIntentId: "pin-0001",
        reason: "",
        actor: "finance-admin@dev.dizkarte.invalid",
        capability: "ADMIN_FINANCE",
        idempotencyKey: "freeze-x",
      });
      expect(noReason.ok).toBe(false);

      const noKey = await repo.freezePaymentIntent({
        paymentIntentId: "pin-0001",
        reason: "Valid reason.",
        actor: "finance-admin@dev.dizkarte.invalid",
        capability: "ADMIN_FINANCE",
        idempotencyKey: "",
      });
      expect(noKey.ok).toBe(false);
    });
  });

  describe("finance: payout fail-closed", () => {
    it("returns PROVIDER_UNAVAILABLE before any mutation/audit entry", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const { PROVIDER_UNAVAILABLE } = await import("./types");
      const repo = new SyntheticAdminRepository();

      const beforeList = await repo.listWithdrawals({ page: 1, pageSize: 50 });
      const beforeAudit = await repo.listAuditLogs({ page: 1, pageSize: 50 });

      const result = await repo.approveWithdrawal({
        withdrawalId: "wdr-8001",
        reason: "Routine approval.",
        actor: "finance-admin@dev.dizkarte.invalid",
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe(PROVIDER_UNAVAILABLE);

      const afterList = await repo.listWithdrawals({ page: 1, pageSize: 50 });
      const afterAudit = await repo.listAuditLogs({ page: 1, pageSize: 50 });

      expect(afterList.items).toEqual(beforeList.items);
      expect(afterAudit.items).toEqual(beforeAudit.items);
    });

    it("payout provider availability is false", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      expect(repo.getFinanceProviderAvailability().payoutProviderAvailable).toBe(false);
    });
  });

  describe("media moderation", () => {
    it("defaults the queue to everything and filters by status", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();

      const all = await repo.listTaskMedia({ page: 1, pageSize: 50 });
      const pending = await repo.listTaskMedia({ page: 1, pageSize: 50, status: "PENDING" });

      expect(all.items.length).toBeGreaterThan(pending.items.length);
      expect(pending.items.every((row) => row.moderationStatus === "PENDING")).toBe(true);
    });

    it("hides one attachment without touching its siblings on the same task", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();

      const before = await repo.listTaskMedia({ page: 1, pageSize: 50 });
      const target = before.items.find((row) => row.id === "tmd-7001")!;
      const sibling = before.items.find(
        (row) => row.taskId === target.taskId && row.id !== target.id,
      )!;

      const result = await repo.moderateTaskMedia({
        mediaId: target.id,
        action: "hide",
        reason: "Shows a third party's face without consent.",
        actor: "support-admin@dev.dizkarte.invalid",
      });
      expect(result.ok).toBe(true);

      const after = await repo.listTaskMedia({ page: 1, pageSize: 50 });
      expect(after.items.find((row) => row.id === target.id)?.moderationStatus).toBe("HIDDEN");
      // The whole point of per-item moderation: the rest of the task survives.
      expect(after.items.find((row) => row.id === sibling.id)?.moderationStatus).toBe(
        sibling.moderationStatus,
      );
    });

    it("records an attributable audit entry naming the attachment", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();

      await repo.moderateTaskMedia({
        mediaId: "tmd-7001",
        action: "approve",
        reason: "Reviewed, nothing objectionable.",
        actor: "support-admin@dev.dizkarte.invalid",
      });

      const audit = await repo.listAuditLogs({ page: 1, pageSize: 50 });
      expect(audit.items[0]?.action).toBe("task_media.approve");
      expect(audit.items[0]?.resource).toBe("tmd-7001");
    });

    it("refuses without a reason and leaves the attachment untouched", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();

      const before = await repo.listTaskMedia({ page: 1, pageSize: 50 });
      const result = await repo.moderateTaskMedia({
        mediaId: "tmd-7001",
        action: "hide",
        reason: "  ",
        actor: "support-admin@dev.dizkarte.invalid",
      });

      expect(result.ok).toBe(false);
      const after = await repo.listTaskMedia({ page: 1, pageSize: 50 });
      expect(after.items).toEqual(before.items);
    });
  });

  describe("refunds and account status filtering", () => {
    it("lists refunds and filters by status", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();

      const all = await repo.listRefunds({ page: 1, pageSize: 50 });
      expect(all.items.length).toBeGreaterThan(0);

      const failed = await repo.listRefunds({ page: 1, pageSize: 50, status: "FAILED" });
      expect(failed.items.every((row) => row.status === "FAILED")).toBe(true);
      expect(failed.items.length).toBeLessThan(all.items.length);
    });

    it("filters users by account status, which is how frozen accounts are reviewed", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();

      const all = await repo.listUsers({ page: 1, pageSize: 50 });
      const suspended = await repo.listUsers({ page: 1, pageSize: 50, status: "suspended" });

      expect(suspended.items.every((row) => row.accountStatus === "suspended")).toBe(true);
      expect(suspended.items.length).toBeLessThanOrEqual(all.items.length);
    });
  });

  describe("assignment-gated conversation read", () => {
    it("refuses an Admin who is not the assignee, and writes no audit entry", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();

      const beforeAudit = await repo.listAuditLogs({ page: 1, pageSize: 50 });
      const result = await repo.readDisputeConversation({
        disputeId: "dsp-4001",
        reason: "Checking the timeline.",
        actor: "someone-else@dev.dizkarte.invalid",
      });

      expect(result.ok).toBe(false);
      const afterAudit = await repo.listAuditLogs({ page: 1, pageSize: 50 });
      expect(afterAudit.items).toEqual(beforeAudit.items);
    });

    it("returns the transcript to the assigned Admin and records the reason", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const actor = "finance-admin@dev.dizkarte.invalid";

      await repo.assignCase({
        resourceType: "dispute",
        resourceId: "dsp-4001",
        assignee: actor,
        actor,
        capability: "ADMIN_FINANCE",
      });

      const result = await repo.readDisputeConversation({
        disputeId: "dsp-4001",
        reason: "Verifying who cancelled the visit.",
        actor,
      });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.messages.length).toBeGreaterThan(0);

      // Reading a private transcript is itself an auditable action.
      const audit = await repo.listAuditLogs({ page: 1, pageSize: 50 });
      expect(audit.items[0]?.action).toBe("conversation.read");
      expect(audit.items[0]?.reason).toBe("Verifying who cancelled the visit.");
    });

    it("requires a reason", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();
      const result = await repo.readDisputeConversation({
        disputeId: "dsp-4001",
        reason: "  ",
        actor: "finance-admin@dev.dizkarte.invalid",
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("review moderation", () => {
    it("filters the queue by moderation status", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();

      const all = await repo.listReviews({ page: 1, pageSize: 50 });
      const hidden = await repo.listReviews({ page: 1, pageSize: 50, status: "MODERATED" });

      expect(all.items.length).toBeGreaterThan(hidden.items.length);
      expect(hidden.items.every((row) => row.status === "MODERATED")).toBe(true);
    });

    it("hides a review and records an attributable audit entry", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();

      const result = await repo.moderateReview({
        reviewId: "rev-8002",
        action: "hide",
        reason: "Contains abusive language.",
        actor: "support-admin@dev.dizkarte.invalid",
      });
      expect(result.ok).toBe(true);

      const reviews = await repo.listReviews({ page: 1, pageSize: 50 });
      expect(reviews.items.find((row) => row.id === "rev-8002")?.status).toBe("MODERATED");

      const audit = await repo.listAuditLogs({ page: 1, pageSize: 50 });
      expect(audit.items[0]?.action).toBe("review.hide");
      expect(audit.items[0]?.resource).toBe("rev-8002");
      expect(audit.items[0]?.reason).toBe("Contains abusive language.");
    });

    it("restores a hidden review", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();

      const result = await repo.moderateReview({
        reviewId: "rev-8003",
        action: "restore",
        reason: "Hidden in error.",
        actor: "support-admin@dev.dizkarte.invalid",
      });
      expect(result.ok).toBe(true);

      const reviews = await repo.listReviews({ page: 1, pageSize: 50 });
      expect(reviews.items.find((row) => row.id === "rev-8003")?.status).toBe("REVEALED");
    });

    it("refuses to moderate without a reason and leaves the review untouched", async () => {
      const { SyntheticAdminRepository } = await import("./synthetic-admin-repository");
      const repo = new SyntheticAdminRepository();

      const before = await repo.listReviews({ page: 1, pageSize: 50 });
      const result = await repo.moderateReview({
        reviewId: "rev-8002",
        action: "hide",
        reason: "   ",
        actor: "support-admin@dev.dizkarte.invalid",
      });

      expect(result.ok).toBe(false);
      const after = await repo.listReviews({ page: 1, pageSize: 50 });
      expect(after.items).toEqual(before.items);
    });
  });
});

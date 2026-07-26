import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SyntheticAdminRepository } from "./synthetic-admin-repository";
import type { AdminRepository } from "./types";

/**
 * Covers the Admin oversight surfaces added for the marketplace domains: the
 * user detail record, task list filtering, the booking queue, and the dashboard
 * attention count. These run against the deterministic in-memory adapter so the
 * contract is asserted without a database.
 */
describe("Admin marketplace oversight", () => {
  let repo: AdminRepository;

  beforeEach(() => {
    repo = new SyntheticAdminRepository();
  });

  describe("user detail", () => {
    it("returns a consolidated record for a known user", async () => {
      const list = await repo.listUsers({ page: 1, pageSize: 5 });
      const first = list.items[0]!;
      const detail = await repo.getUser(first.id);

      expect(detail).not.toBeNull();
      expect(detail!.id).toBe(first.id);
      expect(detail!.displayName).toBe(first.displayName);
      expect(detail!.accountStatus).toBe(first.accountStatus);
      expect(Array.isArray(detail!.capabilities)).toBe(true);
      expect(Array.isArray(detail!.moderationHistory)).toBe(true);
    });

    it("reports a verification status consistent with the list projection", async () => {
      const list = await repo.listUsers({ page: 1, pageSize: 20 });
      for (const row of list.items) {
        const detail = await repo.getUser(row.id);
        // The detail page must never contradict the list column.
        expect(detail!.identityVerified).toBe(row.identityVerified);
        if (row.identityVerified) expect(detail!.verificationStatus).toBe("APPROVED");
      }
    });

    it("reports the same email projection as the list, never a second source", async () => {
      const list = await repo.listUsers({ page: 1, pageSize: 1 });
      const row = list.items[0]!;
      const detail = await repo.getUser(row.id);
      // The synthetic dataset uses non-deliverable `.invalid` addresses; the real
      // Supabase adapter reports "(not exposed)" because auth.users is not
      // readable with the anon key. Either way the detail page must not surface a
      // different value from the list.
      expect(detail!.email).toBe(row.email);
    });

    it("returns null for an unknown user", async () => {
      expect(await repo.getUser("00000000-0000-4000-8000-00000000dead")).toBeNull();
    });

    it("reflects an account status change", async () => {
      const list = await repo.listUsers({ page: 1, pageSize: 5 });
      const target = list.items.find((row) => row.accountStatus === "active")!;
      const result = await repo.setUserAccountStatus({
        userId: target.id,
        status: "suspended",
        reason: "Investigating repeated reports against this account.",
        actor: "admin",
      });
      expect(result.ok).toBe(true);
      const detail = await repo.getUser(target.id);
      expect(detail!.accountStatus).toBe("suspended");
    });
  });

  describe("task list filtering", () => {
    it("filters by status", async () => {
      const all = await repo.listTasks({ page: 1, pageSize: 50 });
      const status = all.items[0]!.status;
      const filtered = await repo.listTasks({ page: 1, pageSize: 50, status });
      expect(filtered.items.length).toBeGreaterThan(0);
      expect(filtered.items.every((row) => row.status === status)).toBe(true);
    });

    it("filters by keyword against the title", async () => {
      const all = await repo.listTasks({ page: 1, pageSize: 50 });
      const word = all.items[0]!.title.split(/\s+/)[0]!;
      const filtered = await repo.listTasks({ page: 1, pageSize: 50, query: word });
      expect(filtered.items.length).toBeGreaterThan(0);
      expect(
        filtered.items.every((row) => row.title.toLowerCase().includes(word.toLowerCase())),
      ).toBe(true);
    });

    it("filters by city code", async () => {
      const all = await repo.listTasks({ page: 1, pageSize: 50 });
      const cityCode = all.items[0]!.cityCode;
      const filtered = await repo.listTasks({ page: 1, pageSize: 50, cityCode });
      expect(filtered.items.every((row) => row.cityCode === cityCode)).toBe(true);
    });

    it("returns nothing for a keyword that matches no task", async () => {
      const filtered = await repo.listTasks({
        page: 1,
        pageSize: 50,
        query: "zzz-no-such-task-zzz",
      });
      expect(filtered.items).toHaveLength(0);
    });
  });

  describe("booking queue", () => {
    it("paginates and exposes only workflow-safe fields", async () => {
      const page = await repo.listBookings({ page: 1, pageSize: 10 });
      expect(page.page).toBe(1);
      for (const row of page.items) {
        expect(row.agreedCentavos).toBeGreaterThanOrEqual(0);
        expect(row.clientDisplayName).toBeTruthy();
        expect(row.taskerDisplayName).toBeTruthy();
        // No contact details or exact location may appear on the queue row.
        expect(Object.keys(row)).not.toContain("exactAddress");
        expect(Object.keys(row)).not.toContain("clientContact");
      }
    });

    it("returns a detail record with a lifecycle timeline", async () => {
      const page = await repo.listBookings({ page: 1, pageSize: 1 });
      if (page.items.length === 0) return;
      const detail = await repo.getBooking(page.items[0]!.id);
      expect(detail).not.toBeNull();
      expect(detail!.timeline.length).toBeGreaterThan(0);
      expect(detail!.currency).toBe("PHP");
    });

    it("returns null for an unknown booking", async () => {
      expect(await repo.getBooking("00000000-0000-4000-8000-00000000dead")).toBeNull();
    });
  });

  describe("dashboard", () => {
    it("includes a bookings-needing-attention count", async () => {
      const snapshot = await repo.getDashboardSnapshot();
      expect(snapshot.attentionBookingCount).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(snapshot.attentionBookingCount)).toBe(true);
    });
  });
});

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

  describe("verification queue search", () => {
    it("narrows the queue by subject display name, case-insensitively", async () => {
      const all = await repo.listVerificationCases({ page: 1, pageSize: 50 });
      const target = all.items[0]!;
      const term = target.userDisplayName.slice(0, 3).toLowerCase();

      const result = await repo.listVerificationCases({ page: 1, pageSize: 50, query: term });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.length).toBeLessThanOrEqual(all.items.length);
      for (const item of result.items) {
        expect(item.userDisplayName.toLowerCase()).toContain(term);
      }
    });

    it("returns an empty page rather than the whole queue when nothing matches", async () => {
      const result = await repo.listVerificationCases({
        page: 1,
        pageSize: 50,
        query: "zzz-no-such-person",
      });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("applies the search and the status filter together", async () => {
      const all = await repo.listVerificationCases({ page: 1, pageSize: 50 });
      const target = all.items[0]!;

      const result = await repo.listVerificationCases({
        page: 1,
        pageSize: 50,
        query: target.userDisplayName,
        status: target.status,
      });

      expect(result.items.length).toBeGreaterThan(0);
      for (const item of result.items) {
        expect(item.status).toBe(target.status);
        expect(item.userDisplayName).toBe(target.userDisplayName);
      }

      // A status the matched case is not in must not fall back to name-only.
      const otherStatus = target.status === "APPROVED" ? "REJECTED" : "APPROVED";
      const mismatched = await repo.listVerificationCases({
        page: 1,
        pageSize: 50,
        query: target.userDisplayName,
        status: otherStatus,
      });
      expect(mismatched.items.every((item) => item.status === otherStatus)).toBe(true);
    });
  });

  describe("task media queue search", () => {
    it("narrows the queue by task title, case-insensitively", async () => {
      const all = await repo.listTaskMedia({ page: 1, pageSize: 50 });
      const target = all.items[0]!;
      const term = target.taskTitle.slice(0, 4).toLowerCase();

      const result = await repo.listTaskMedia({ page: 1, pageSize: 50, query: term });

      expect(result.items.length).toBeGreaterThan(0);
      for (const item of result.items) {
        expect(item.taskTitle.toLowerCase()).toContain(term);
      }
    });

    it("returns an empty page rather than the whole queue when nothing matches", async () => {
      const result = await repo.listTaskMedia({
        page: 1,
        pageSize: 50,
        query: "zzz-no-such-task",
      });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("applies the search and the status filter together", async () => {
      const all = await repo.listTaskMedia({ page: 1, pageSize: 50 });
      const target = all.items[0]!;

      const result = await repo.listTaskMedia({
        page: 1,
        pageSize: 50,
        query: target.taskTitle,
        status: target.moderationStatus,
      });

      for (const item of result.items) {
        expect(item.moderationStatus).toBe(target.moderationStatus);
        expect(item.taskTitle).toBe(target.taskTitle);
      }
    });
  });

  describe("task detail", () => {
    it("returns null for a task that does not exist", async () => {
      expect(await repo.getTask("tsk-does-not-exist")).toBeNull();
    });

    it("carries the list fields plus the detail-only fields", async () => {
      const list = await repo.listTasks({ page: 1, pageSize: 50 });
      const row = list.items[0]!;

      const task = await repo.getTask(row.id);

      expect(task).not.toBeNull();
      // The detail must agree with the row the queue showed.
      expect(task!.id).toBe(row.id);
      expect(task!.title).toBe(row.title);
      expect(task!.status).toBe(row.status);
      expect(task!.budgetCentavos).toBe(row.budgetCentavos);
      expect(task!.flagged).toBe(row.flagged);
      // Detail-only fields the list does not carry.
      expect(task!.description.length).toBeGreaterThan(0);
      expect(task!.currency).toBe("PHP");
      expect(task!.clientDisplayName.length).toBeGreaterThan(0);
    });

    it("lists the task's own attachments and no others", async () => {
      const media = await repo.listTaskMedia({ page: 1, pageSize: 50 });
      const withMedia = media.items[0]!;

      const task = await repo.getTask(withMedia.taskId);

      expect(task).not.toBeNull();
      const ids = task!.attachments.map((attachment) => attachment.id);
      expect(ids).toContain(withMedia.id);
      const expected = media.items
        .filter((item) => item.taskId === withMedia.taskId)
        .map((item) => item.id);
      expect([...ids].sort()).toEqual([...expected].sort());
    });

    it("keeps every media row pointing at a task that can actually be opened", async () => {
      // The media queue links each card to /tasks/<id>; an orphan row would 404.
      const media = await repo.listTaskMedia({ page: 1, pageSize: 100 });
      expect(media.items.length).toBeGreaterThan(0);

      for (const item of media.items) {
        const task = await repo.getTask(item.taskId);
        expect(task, `media ${item.id} points at missing task ${item.taskId}`).not.toBeNull();
      }
    });

    it("agrees with the media queue about the task title", async () => {
      const media = await repo.listTaskMedia({ page: 1, pageSize: 100 });

      for (const item of media.items) {
        const task = await repo.getTask(item.taskId);
        expect(task!.title).toBe(item.taskTitle);
      }
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

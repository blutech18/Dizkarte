import { describe, it, expect } from "vitest";
import { formatReferenceId } from "./format-id";

describe("formatReferenceId", () => {
  const bookingId = "e167d9fa-9115-4e10-948c-1cb9e0cbcbb4";
  const taskId = "c21fe6c4-48d0-4458-80f8-1d1e807736d5";
  const paymentId = "33333333-3333-4333-8333-333333333333";
  const createdAt = "2026-08-20T02:00:00.000Z";

  it("formats standard entity codes (Option 1) without date", () => {
    expect(formatReferenceId(bookingId, "BK")).toBe("BK-E167D9FA");
    expect(formatReferenceId(taskId, "TSK")).toBe("TSK-C21FE6C4");
    expect(formatReferenceId(paymentId, "PAY")).toBe("PAY-33333333");
  });

  it("formats date-based reference codes (Option A) with createdAt timestamp", () => {
    // 2026-08-20T02:00:00.000Z in Asia/Manila (UTC+8) is Aug 20, 2026 10:00 AM
    expect(formatReferenceId(bookingId, "BK", createdAt)).toBe("BK-20260820-E167");
    expect(formatReferenceId(taskId, "TSK", { date: createdAt })).toBe("TSK-20260820-C21F");
  });

  it("formats compact date reference codes (Option B) with compactDate flag", () => {
    expect(formatReferenceId(bookingId, "BK", { date: createdAt, compactDate: true })).toBe(
      "BK-260820-E167",
    );
  });

  it("falls back to standard entity code if date is invalid", () => {
    expect(formatReferenceId(bookingId, "BK", "invalid-date")).toBe("BK-E167D9FA");
    expect(formatReferenceId(bookingId, "BK", { date: null })).toBe("BK-E167D9FA");
  });

  it("handles pre-prefixed IDs gracefully", () => {
    expect(formatReferenceId("tsk-2003", "TSK")).toBe("TSK-2003");
    expect(formatReferenceId("bkg-6001", "BK")).toBe("BK-6001");
  });

  it("handles edge cases cleanly", () => {
    expect(formatReferenceId("", "BK")).toBe("");
    expect(formatReferenceId("abc", "BK")).toBe("BK-ABC");
  });
});

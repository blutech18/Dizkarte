import { describe, expect, it } from "vitest";
import { formatReferenceId, formatDateSegment } from "./reference-id";

describe("formatReferenceId", () => {
  const taskId = "c21fe6c4-48d0-4458-80f8-1d1e807736d5";
  const bookingId = "e167d9fa-9115-4e10-948c-1cb9e0cbcbb4";
  const paymentId = "33333333-3333-4333-8333-333333333333";
  const createdAt = "2026-08-20T14:30:00.000Z";

  it("formats standard entity codes", () => {
    expect(formatReferenceId(bookingId, "BK")).toBe("BK-E167D9FA");
    expect(formatReferenceId(taskId, "TSK")).toBe("TSK-C21FE6C4");
    expect(formatReferenceId(paymentId, "PAY")).toBe("PAY-33333333");
  });

  it("formats date-based entity codes", () => {
    expect(formatReferenceId(bookingId, "BK", createdAt)).toBe("BK-20260820-E167");
    expect(formatReferenceId(taskId, "TSK", { date: createdAt })).toBe("TSK-20260820-C21F");
  });

  it("handles synthetic ids cleanly", () => {
    expect(formatReferenceId("tsk-2003", "TSK")).toBe("TSK-2003");
    expect(formatReferenceId("bkg-6001", "BK")).toBe("BK-6001");
  });
});

import { describe, expect, it } from "vitest";
import {
  bookingOutcome,
  buildDashboardTrends,
  manilaDayKey,
  percentChange,
} from "./dashboard-trends";

const now = new Date("2026-08-29T04:00:00.000Z"); // 12:00 PM in Manila

describe("manilaDayKey", () => {
  it("groups a late-UTC instant into the following Manila day", () => {
    expect(manilaDayKey("2026-08-28T17:30:00.000Z")).toBe("2026-08-29");
    expect(manilaDayKey("2026-08-28T15:59:00.000Z")).toBe("2026-08-28");
  });

  it("returns null for an unparseable timestamp", () => {
    expect(manilaDayKey("not-a-date")).toBeNull();
  });
});

describe("bookingOutcome", () => {
  it("treats every unhappy ending as one failed signal", () => {
    expect(bookingOutcome("COMPLETED")).toBe("completed");
    expect(bookingOutcome("CANCELLED")).toBe("failed");
    expect(bookingOutcome("PAYMENT_FAILED")).toBe("failed");
    expect(bookingOutcome("DISPUTED")).toBe("failed");
    expect(bookingOutcome("REFUNDED")).toBe("failed");
    expect(bookingOutcome("IN_PROGRESS")).toBe("active");
  });
});

describe("buildDashboardTrends", () => {
  it("returns one zero-filled bucket per day, oldest first", () => {
    const trends = buildDashboardTrends({ fees: [], bookings: [], days: 7, now });

    expect(trends.days).toHaveLength(7);
    expect(trends.days[0]!.date).toBe("2026-08-23");
    expect(trends.days[6]!.date).toBe("2026-08-29");
    expect(trends.days.every((day) => day.bookingsCreated === 0)).toBe(true);
    expect(trends.windowDays).toBe(7);
  });

  it("sums fees and classifies bookings into the correct Manila day", () => {
    const trends = buildDashboardTrends({
      fees: [
        { at: "2026-08-29T01:00:00.000Z", amountCentavos: 5000 },
        { at: "2026-08-29T02:00:00.000Z", amountCentavos: 2500 },
        { at: "2026-08-27T01:00:00.000Z", amountCentavos: 1000 },
      ],
      bookings: [
        { at: "2026-08-29T01:00:00.000Z", status: "COMPLETED", amountCentavos: 100_000 },
        { at: "2026-08-29T03:00:00.000Z", status: "DISPUTED", amountCentavos: 50_000 },
        { at: "2026-08-29T03:30:00.000Z", status: "IN_PROGRESS", amountCentavos: 25_000 },
      ],
      days: 7,
      now,
    });

    const today = trends.days.at(-1)!;
    expect(today.platformFeeCentavos).toBe(7500);
    expect(today.bookingsCreated).toBe(3);
    expect(today.bookingsCompleted).toBe(1);
    expect(today.bookingsFailed).toBe(1);
    expect(today.bookingsActive).toBe(1);
    expect(today.grossBookedCentavos).toBe(175_000);
    expect(trends.current.platformFeeCentavos).toBe(8500);
  });

  it("attributes the preceding window to the comparison totals, not to a bucket", () => {
    const trends = buildDashboardTrends({
      fees: [{ at: "2026-08-20T01:00:00.000Z", amountCentavos: 9000 }],
      bookings: [{ at: "2026-08-20T01:00:00.000Z", status: "COMPLETED", amountCentavos: 400_000 }],
      days: 7,
      now,
    });

    expect(trends.current.platformFeeCentavos).toBe(0);
    expect(trends.previous.platformFeeCentavos).toBe(9000);
    expect(trends.previous.bookingsCompleted).toBe(1);
    expect(trends.days.every((day) => day.platformFeeCentavos === 0)).toBe(true);
  });

  it("ignores rows older than both windows", () => {
    const trends = buildDashboardTrends({
      fees: [{ at: "2025-01-01T00:00:00.000Z", amountCentavos: 100_000 }],
      bookings: [],
      days: 7,
      now,
    });

    expect(trends.current.platformFeeCentavos).toBe(0);
    expect(trends.previous.platformFeeCentavos).toBe(0);
  });
});

describe("percentChange", () => {
  it("computes a signed percentage against the previous period", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
  });

  it("returns null when there is no baseline to compare against", () => {
    // A fabricated "+100%" from a zero baseline would misinform the owner.
    expect(percentChange(120, 0)).toBeNull();
  });
});

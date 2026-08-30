import { describe, expect, it } from "vitest";
import type { BookingRecord } from "../../services/marketplace/types";
import {
  DEFAULT_BOOKING_FILTERS,
  activeBookingFilterCount,
  bookingNeedsAttention,
  countBookingsByStage,
  describeBookingFilters,
  matchesBookingFilters,
  sortBookings,
  type BookingFilterContext,
} from "./bookingFilters";

const VIEWER = "usr-viewer";

function booking(overrides: {
  id: string;
  status?: BookingRecord["status"];
  clientId?: string;
  taskerId?: string;
  agreedCentavos?: number;
  createdAt?: string;
  updatedAt?: string;
  taskTitle?: string;
  taskerDisplayName?: string;
  clientDisplayName?: string;
}): BookingRecord {
  return {
    id: overrides.id as BookingRecord["id"],
    taskId: "task-1" as BookingRecord["taskId"],
    taskTitle: overrides.taskTitle ?? "Deep clean condo",
    clientId: (overrides.clientId ?? VIEWER) as BookingRecord["clientId"],
    clientDisplayName: overrides.clientDisplayName ?? "Client Ann",
    taskerId: (overrides.taskerId ?? "usr-tasker") as BookingRecord["taskerId"],
    taskerDisplayName: overrides.taskerDisplayName ?? "Tasker Ben",
    agreedCentavos: overrides.agreedCentavos ?? 150_000,
    status: overrides.status ?? "CONFIRMED",
    idempotencyKey: "key",
    createdAt: overrides.createdAt ?? "2026-08-10T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-08-12T00:00:00.000Z",
    paymentIntentId: null,
    exactAddress: null,
    exactLat: null,
    exactLng: null,
    clientContactMasked: "•••",
    taskerContactMasked: "•••",
    completionEvidence: [],
    disputeId: null,
  };
}

const context: BookingFilterContext = { viewerId: VIEWER, unreadCount: () => 0 };

describe("bookingNeedsAttention", () => {
  it("blames the side that actually has to act", () => {
    expect(bookingNeedsAttention("PAYMENT_PENDING", true)).toBe(true);
    expect(bookingNeedsAttention("PAYMENT_PENDING", false)).toBe(false);
    // Confirmed work waits on the Tasker to start.
    expect(bookingNeedsAttention("CONFIRMED", false)).toBe(true);
    expect(bookingNeedsAttention("CONFIRMED", true)).toBe(false);
    expect(bookingNeedsAttention("COMPLETED", true)).toBe(false);
  });
});

describe("matchesBookingFilters", () => {
  it("separates the work you hired from the work you did", () => {
    const asClient = booking({ id: "b1", clientId: VIEWER });
    const asTasker = booking({ id: "b2", clientId: "usr-other", taskerId: VIEWER });

    expect(
      matchesBookingFilters(asClient, { ...DEFAULT_BOOKING_FILTERS, role: "client" }, context),
    ).toBe(true);
    expect(
      matchesBookingFilters(asTasker, { ...DEFAULT_BOOKING_FILTERS, role: "client" }, context),
    ).toBe(false);
    expect(
      matchesBookingFilters(asTasker, { ...DEFAULT_BOOKING_FILTERS, role: "tasker" }, context),
    ).toBe(true);
    expect(matchesBookingFilters(asTasker, DEFAULT_BOOKING_FILTERS, context)).toBe(true);
  });

  it("filters by agreed amount inclusively", () => {
    const subject = booking({ id: "b1", agreedCentavos: 200_000 });
    expect(
      matchesBookingFilters(
        subject,
        { ...DEFAULT_BOOKING_FILTERS, minAmountCentavos: 200_000 },
        context,
      ),
    ).toBe(true);
    expect(
      matchesBookingFilters(
        subject,
        { ...DEFAULT_BOOKING_FILTERS, maxAmountCentavos: 199_999 },
        context,
      ),
    ).toBe(false);
  });

  it("filters by the booked date range", () => {
    const subject = booking({ id: "b1", createdAt: "2026-08-10T00:00:00.000Z" });
    expect(
      matchesBookingFilters(
        subject,
        { ...DEFAULT_BOOKING_FILTERS, bookedFrom: "2026-08-01T00:00:00.000Z" },
        context,
      ),
    ).toBe(true);
    expect(
      matchesBookingFilters(
        subject,
        { ...DEFAULT_BOOKING_FILTERS, bookedTo: "2026-08-09T23:59:59.999Z" },
        context,
      ),
    ).toBe(false);
  });

  it("only keeps bookings with unread messages when asked", () => {
    const unread = booking({ id: "b1" });
    const read = booking({ id: "b2" });
    const withUnread: BookingFilterContext = {
      viewerId: VIEWER,
      unreadCount: (item) => (item.id === unread.id ? 3 : 0),
    };
    const filters = { ...DEFAULT_BOOKING_FILTERS, unreadOnly: true };
    expect(matchesBookingFilters(unread, filters, withUnread)).toBe(true);
    expect(matchesBookingFilters(read, filters, withUnread)).toBe(false);
  });

  it("searches the task title, the counterpart, and the status label", () => {
    const subject = booking({
      id: "b1",
      taskTitle: "Move a sofa",
      taskerDisplayName: "Tasker Ben",
      status: "REFUNDED",
    });
    const withLabels: BookingFilterContext = { ...context, statusLabel: () => "Refunded" };
    expect(matchesBookingFilters(subject, DEFAULT_BOOKING_FILTERS, withLabels, "sofa")).toBe(true);
    expect(matchesBookingFilters(subject, DEFAULT_BOOKING_FILTERS, withLabels, "ben")).toBe(true);
    expect(matchesBookingFilters(subject, DEFAULT_BOOKING_FILTERS, withLabels, "refunded")).toBe(
      true,
    );
    expect(matchesBookingFilters(subject, DEFAULT_BOOKING_FILTERS, withLabels, "garden")).toBe(
      false,
    );
  });
});

describe("countBookingsByStage", () => {
  it("counts each stage against the other applied filters", () => {
    const bookings = [
      booking({ id: "b1", status: "COMPLETED", clientId: VIEWER }),
      booking({ id: "b2", status: "COMPLETED", clientId: "usr-other", taskerId: VIEWER }),
      booking({ id: "b3", status: "DISPUTED", clientId: VIEWER }),
    ];

    const counts = countBookingsByStage(
      bookings,
      { ...DEFAULT_BOOKING_FILTERS, role: "client" },
      context,
    );

    // Only the two bookings the viewer hired for are counted.
    expect(counts.all).toBe(2);
    expect(counts.completed).toBe(1);
    expect(counts.issues).toBe(1);
  });
});

describe("sortBookings", () => {
  it("orders by recency, age, and amount", () => {
    const items = [
      booking({ id: "old", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", agreedCentavos: 500_000 }),
      booking({ id: "new", createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z", agreedCentavos: 100_000 }),
    ];
    expect(sortBookings(items, "recent")[0]!.id).toBe("new");
    expect(sortBookings(items, "oldest")[0]!.id).toBe("old");
    expect(sortBookings(items, "highest_amount")[0]!.id).toBe("old");
  });
});

describe("activeBookingFilterCount and describeBookingFilters", () => {
  it("reports nothing applied for the defaults", () => {
    expect(activeBookingFilterCount(DEFAULT_BOOKING_FILTERS)).toBe(0);
    expect(describeBookingFilters(DEFAULT_BOOKING_FILTERS)).toEqual([]);
  });

  it("counts and labels each applied filter", () => {
    const filters = {
      ...DEFAULT_BOOKING_FILTERS,
      stage: "attention" as const,
      role: "tasker" as const,
      unreadOnly: true,
      sort: "highest_amount" as const,
    };
    expect(activeBookingFilterCount(filters)).toBe(4);
    const chips = describeBookingFilters(filters);
    expect(chips).toContain("Needs action");
    expect(chips).toContain("I worked");
    expect(chips).toContain("Unread messages");
    expect(chips).toContain("Highest amount");
  });
});

import { describe, expect, it } from "vitest";
import type { BookingId, TaskId, UserId } from "@dizkarte/domain";
import {
  bookingsForDirection,
  hasClearedPayment,
  settlementLabel,
  settlementStateFor,
  settlementTone,
  totalsFor,
} from "./paymentHistory";
import type { BookingRecord } from "../../services/marketplace/types";

/** Ids in the domain are branded, so tests mint them explicitly. */
const uid = (value: string): UserId => value as UserId;
const bid = (value: string): BookingId => value as BookingId;

const CLIENT = uid("client-1");
const TASKER = uid("tasker-1");

/** A booking record with only the fields the payment rules actually read. */
function booking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: bid("b-1"),
    taskId: "t-1" as TaskId,
    taskTitle: "Move a sofa",
    clientId: CLIENT,
    clientDisplayName: "Client One",
    taskerId: TASKER,
    taskerDisplayName: "Tasker One",
    agreedCentavos: 150_000,
    status: "COMPLETED",
    idempotencyKey: "k-1",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    paymentIntentId: "pay-1",
    exactAddress: null,
    exactLat: null,
    exactLng: null,
    clientContactMasked: "•••",
    taskerContactMasked: "•••",
    completionEvidence: [],
    disputeId: null,
    ...overrides,
  };
}

describe("settlement state", () => {
  it("only treats confirmed-or-later money as cleared", () => {
    expect(hasClearedPayment(settlementStateFor("PAYMENT_PENDING"))).toBe(false);
    expect(hasClearedPayment(settlementStateFor("PAYMENT_FAILED"))).toBe(false);
    expect(hasClearedPayment(settlementStateFor("CANCELLED"))).toBe(false);
    expect(hasClearedPayment(settlementStateFor("CONFIRMED"))).toBe(true);
    expect(hasClearedPayment(settlementStateFor("IN_PROGRESS"))).toBe(true);
    expect(hasClearedPayment(settlementStateFor("COMPLETION_REQUESTED"))).toBe(true);
    expect(hasClearedPayment(settlementStateFor("COMPLETED"))).toBe(true);
    expect(hasClearedPayment(settlementStateFor("DISPUTED"))).toBe(true);
  });

  it("maps each booking status to a distinct money state", () => {
    expect(settlementStateFor("PAYMENT_PENDING")).toBe("awaiting_payment");
    expect(settlementStateFor("PAYMENT_FAILED")).toBe("payment_failed");
    expect(settlementStateFor("CONFIRMED")).toBe("protected");
    expect(settlementStateFor("COMPLETED")).toBe("released");
    expect(settlementStateFor("DISPUTED")).toBe("on_hold");
    expect(settlementStateFor("REFUNDED")).toBe("refunded");
    expect(settlementStateFor("CANCELLED")).toBe("cancelled");
  });

  it("phrases the same state differently for each side of the money", () => {
    expect(settlementLabel("released", "earned")).toBe("Released to you");
    expect(settlementLabel("released", "outgoing")).toBe("Paid out");
    expect(settlementLabel("refunded", "earned")).toBe("Refunded to Client");
    expect(settlementLabel("refunded", "outgoing")).toBe("Refunded to you");
  });

  it("never renders a cleared payment as an error tone", () => {
    expect(settlementTone("released")).toBe("success");
    expect(settlementTone("protected")).toBe("info");
    expect(settlementTone("payment_failed")).toBe("error");
  });
});

describe("direction filtering", () => {
  const bookings = [
    booking({ id: bid("as-client"), clientId: CLIENT, taskerId: uid("someone-else") }),
    booking({ id: bid("as-tasker"), clientId: uid("another-client"), taskerId: TASKER }),
  ];

  it("puts bookings the viewer paid for under outgoing", () => {
    const rows = bookingsForDirection(bookings, CLIENT, "outgoing");
    expect(rows.map((b) => b.id)).toEqual(["as-client"]);
  });

  it("puts bookings the viewer worked under earned", () => {
    const rows = bookingsForDirection(bookings, TASKER, "earned");
    expect(rows.map((b) => b.id)).toEqual(["as-tasker"]);
  });

  it("never counts a self-booking as income", () => {
    const self = [booking({ id: bid("self"), clientId: CLIENT, taskerId: CLIENT })];
    expect(bookingsForDirection(self, CLIENT, "earned")).toEqual([]);
    // It is still money that left the account, so it remains visible as outgoing.
    expect(bookingsForDirection(self, CLIENT, "outgoing").map((b) => b.id)).toEqual(["self"]);
  });

  it("orders newest first", () => {
    const rows = bookingsForDirection(
      [
        booking({ id: bid("older"), createdAt: "2026-01-01T00:00:00.000Z" }),
        booking({ id: bid("newer"), createdAt: "2026-06-01T00:00:00.000Z" }),
      ],
      CLIENT,
      "outgoing",
    );
    expect(rows.map((b) => b.id)).toEqual(["newer", "older"]);
  });
});

describe("totals", () => {
  it("counts completed bookings as released and in-flight ones as protected", () => {
    const totals = totalsFor(
      [
        booking({ id: bid("done"), status: "COMPLETED", agreedCentavos: 100_00 }),
        booking({ id: bid("working"), status: "IN_PROGRESS", agreedCentavos: 200_00 }),
      ],
      CLIENT,
      "outgoing",
    );
    expect(totals.releasedCentavos).toBe(100_00);
    expect(totals.protectedCentavos).toBe(200_00);
  });

  it("excludes money that never moved, so a total never overstates", () => {
    const totals = totalsFor(
      [
        booking({ id: bid("pending"), status: "PAYMENT_PENDING", agreedCentavos: 500_00 }),
        booking({ id: bid("failed"), status: "PAYMENT_FAILED", agreedCentavos: 600_00 }),
        booking({ id: bid("cancelled"), status: "CANCELLED", agreedCentavos: 700_00 }),
        booking({ id: bid("refunded"), status: "REFUNDED", agreedCentavos: 800_00 }),
      ],
      CLIENT,
      "outgoing",
    );
    expect(totals.releasedCentavos).toBe(0);
    expect(totals.protectedCentavos).toBe(0);
  });

  it("treats disputed money as still held, not released", () => {
    const totals = totalsFor(
      [booking({ id: bid("fight"), status: "DISPUTED", agreedCentavos: 900_00 })],
      CLIENT,
      "outgoing",
    );
    expect(totals.releasedCentavos).toBe(0);
    expect(totals.protectedCentavos).toBe(900_00);
  });

  it("keeps the two sides of the account separate", () => {
    const mixed = [
      booking({
        id: bid("paid"),
        clientId: CLIENT,
        taskerId: uid("x"),
        status: "COMPLETED",
        agreedCentavos: 111,
      }),
      booking({
        id: bid("earned"),
        clientId: uid("y"),
        taskerId: CLIENT,
        status: "COMPLETED",
        agreedCentavos: 222,
      }),
    ];
    expect(totalsFor(mixed, CLIENT, "outgoing").releasedCentavos).toBe(111);
    expect(totalsFor(mixed, CLIENT, "earned").releasedCentavos).toBe(222);
  });
});

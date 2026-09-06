import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateNumeric,
  formatDateTime,
  formatElapsed,
  formatTime,
  formatTimeNumeric,
} from "./datetime";

describe("formatDateTime", () => {
  it("renders a fixed Philippine-time label regardless of runtime zone", () => {
    // 24 Jul 2026 12:59 UTC is 20:59 in Asia/Manila (UTC+8), so the 8:59 PM
    // here is what proves the zone is pinned rather than taken from the runtime.
    expect(formatDateTime("2026-07-24T12:59:44.000Z")).toBe("Jul 24, 2026, 8:59 PM");
  });

  it("keeps a date that crosses midnight in Manila on the local day", () => {
    // 23:30 UTC is already 07:30 the next morning in Manila.
    expect(formatDateTime("2026-07-24T23:30:00.000Z")).toBe("Jul 25, 2026, 7:30 AM");
  });

  it("never renders an Invalid Date string", () => {
    expect(formatDateTime("not-a-date")).toBe("Unknown");
  });
});

describe("formatDate", () => {
  it("drops the time for dense layouts but keeps the Manila day", () => {
    expect(formatDate("2026-07-24T12:59:44.000Z")).toBe("Jul 24, 2026");
    // 23:30 UTC is already the next morning in Manila.
    expect(formatDate("2026-07-24T23:30:00.000Z")).toBe("Jul 25, 2026");
  });

  it("never renders an Invalid Date string", () => {
    expect(formatDate("not-a-date")).toBe("Unknown");
  });
});

describe("formatElapsed", () => {
  const now = new Date("2026-07-24T12:00:00.000Z");

  it("uses coarse units that match how a queue is triaged", () => {
    expect(formatElapsed("2026-07-24T11:59:30.000Z", now)).toBe("Just now");
    expect(formatElapsed("2026-07-24T11:59:00.000Z", now)).toBe("1 minute");
    expect(formatElapsed("2026-07-24T11:30:00.000Z", now)).toBe("30 minutes");
    expect(formatElapsed("2026-07-24T11:00:00.000Z", now)).toBe("1 hour");
    expect(formatElapsed("2026-07-24T02:00:00.000Z", now)).toBe("10 hours");
    expect(formatElapsed("2026-07-23T12:00:00.000Z", now)).toBe("1 day");
    expect(formatElapsed("2026-07-18T12:00:00.000Z", now)).toBe("6 days");
  });

  it("does not report negative elapsed time for a future timestamp", () => {
    expect(formatElapsed("2026-07-25T12:00:00.000Z", now)).toBe("Not yet due");
  });

  it("never renders an Invalid Date string", () => {
    expect(formatElapsed("not-a-date", now)).toBe("Unknown");
  });
});


describe("formatTime", () => {
  it("renders the time in Philippine time", () => {
    expect(formatTime("2026-07-24T12:59:44.000Z")).toBe("8:59 PM");
    expect(formatTime("2026-07-24T23:30:00.000Z")).toBe("7:30 AM");
  });

  it("returns empty string on invalid date", () => {
    expect(formatTime("not-a-date")).toBe("");
  });
});

describe("formatDateNumeric", () => {
  it("renders numeric date in YYYY-MM-DD format in Philippine time", () => {
    expect(formatDateNumeric("2026-07-24T12:59:44.000Z")).toBe("2026-07-24");
    // Crosses midnight in Manila
    expect(formatDateNumeric("2026-07-24T23:30:00.000Z")).toBe("2026-07-25");
  });

  it("never renders an Invalid Date string", () => {
    expect(formatDateNumeric("not-a-date")).toBe("Unknown");
  });
});

describe("formatTimeNumeric", () => {
  it("renders 24-hour numeric time in Philippine time", () => {
    expect(formatTimeNumeric("2026-07-24T12:59:44.000Z")).toBe("20:59");
    expect(formatTimeNumeric("2026-07-24T23:30:00.000Z")).toBe("07:30");
  });

  it("returns empty string on invalid date", () => {
    expect(formatTimeNumeric("not-a-date")).toBe("");
  });
});

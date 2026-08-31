import { describe, expect, it } from "vitest";
import {
  BOOKING_STATUS_OPTIONS,
  bookingEventSourceLabel,
  bookingStatusLabel,
  bookingStatusMeaning,
} from "./status";

describe("booking vocabulary", () => {
  it("gives every status a plain-language label, never the raw enum", () => {
    for (const status of BOOKING_STATUS_OPTIONS) {
      const label = bookingStatusLabel(status);
      expect(label).not.toBe(status);
      expect(label).not.toMatch(/_/);
    }
  });

  it("gives every status a sentence saying where the money sits", () => {
    for (const status of BOOKING_STATUS_OPTIONS) {
      const meaning = bookingStatusMeaning(status);
      expect(meaning.length).toBeGreaterThan(0);
      expect(meaning).not.toContain("not recognised");
    }
  });
});

describe("bookingEventSourceLabel", () => {
  it("names each known source in terms of who is accountable", () => {
    expect(bookingEventSourceLabel("client")).toBe("Client action");
    expect(bookingEventSourceLabel("tasker")).toBe("Tasker action");
    expect(bookingEventSourceLabel("admin")).toBe("Admin action");
    expect(bookingEventSourceLabel("provider")).toBe("Payment provider");
    expect(bookingEventSourceLabel("payments")).toBe("Payment system");
    expect(bookingEventSourceLabel("system")).toBe("Automatic");
  });

  it("reads the timeout source as the reason rather than the token", () => {
    expect(bookingEventSourceLabel("completion_confirmation_timeout")).toBe(
      "Confirmation window expired",
    );
  });

  it("humanises a source it has not been taught", () => {
    expect(bookingEventSourceLabel("some_new_source")).toBe("Some new source");
    expect(bookingEventSourceLabel("")).toBe("Unknown");
  });

  it("never leaks an underscore token to the screen", () => {
    for (const source of [
      "client",
      "tasker",
      "admin",
      "system",
      "provider",
      "payments",
      "completion_confirmation_timeout",
      "freeze",
      "anything_else_entirely",
    ]) {
      expect(bookingEventSourceLabel(source)).not.toMatch(/_/);
    }
  });
});

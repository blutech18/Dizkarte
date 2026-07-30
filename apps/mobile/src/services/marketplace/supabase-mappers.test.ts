import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_CATEGORIES,
  defaultNotificationPreferences,
  mapNotificationPreferences,
  toNotificationResourceType,
  toNotificationType,
} from "./supabase-mappers";

describe("toNotificationType", () => {
  it("passes through the event types written by migration 0020 triggers", () => {
    expect(toNotificationType("OFFER_RECEIVED")).toBe("OFFER_RECEIVED");
    expect(toNotificationType("VERIFICATION_DECISION")).toBe("VERIFICATION_DECISION");
  });

  it("maps the legacy category strings written by the payment RPCs", () => {
    // process_payment_event / confirm_completion_and_release insert the coarse
    // preference category. Those rows must not be mislabelled in the inbox.
    expect(toNotificationType("payments")).toBe("PAYMENT_CONFIRMED");
    expect(toNotificationType("bookings")).toBe("BOOKING_STARTED");
    expect(toNotificationType("offers")).toBe("OFFER_RECEIVED");
    expect(toNotificationType("disputes")).toBe("DISPUTE_OPENED");
    expect(toNotificationType("reviews")).toBe("REVIEW_RECEIVED");
    expect(toNotificationType("verification")).toBe("VERIFICATION_DECISION");
    expect(toNotificationType("messages")).toBe("MESSAGE_RECEIVED");
  });

  it("falls back rather than leaking an unknown value into the UI", () => {
    expect(toNotificationType("SOMETHING_NEW")).toBe("MESSAGE_RECEIVED");
    expect(toNotificationType(null)).toBe("MESSAGE_RECEIVED");
    expect(toNotificationType(undefined)).toBe("MESSAGE_RECEIVED");
  });
});

describe("toNotificationResourceType", () => {
  it("accepts the resource types the triggers attach", () => {
    for (const value of ["task", "booking", "conversation", "dispute", "review"]) {
      expect(toNotificationResourceType(value)).toBe(value);
    }
  });

  it("treats an absent or unknown resource as unlinked", () => {
    expect(toNotificationResourceType(null)).toBeNull();
    expect(toNotificationResourceType("ledger_entry")).toBeNull();
  });
});

describe("notification preferences", () => {
  it("defaults every category to enabled on both channels", () => {
    const defaults = defaultNotificationPreferences();
    expect(Object.keys(defaults).sort()).toEqual([...NOTIFICATION_CATEGORIES].sort());
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(defaults[category]).toEqual({ inApp: true, push: true });
    }
  });

  it("includes reviews, which migration 0020 also allows in the database", () => {
    expect(NOTIFICATION_CATEGORIES).toContain("reviews");
  });

  it("overlays stored rows and ignores categories the app does not render", () => {
    const result = mapNotificationPreferences([
      { category: "offers", in_app: false, push: true },
      { category: "reviews", in_app: true, push: false },
      { category: "system", in_app: false, push: false },
    ]);
    expect(result.offers).toEqual({ inApp: false, push: true });
    expect(result.reviews).toEqual({ inApp: true, push: false });
    expect(result.bookings).toEqual({ inApp: true, push: true });
    expect(result).not.toHaveProperty("system");
  });
});

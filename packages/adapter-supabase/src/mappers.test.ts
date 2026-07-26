import { describe, it, expect } from "vitest";
import { FORBIDDEN_PUBLIC_TASK_FIELDS, FORBIDDEN_PUBLIC_TASKER_FIELDS } from "@dizkarte/domain";
import {
  toNumber,
  sanitizeKeyword,
  mapTaskFeedRow,
  mapTaskerProfileRow,
  mapBookingRow,
  mapDerivedBalancesRow,
  type RawTaskFeedRow,
  type RawTaskerProfileRow,
  type RawBookingRow,
} from "./mappers.js";

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const CATEGORY_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const TASKER_ID = "44444444-4444-4444-8444-444444444444";
const BOOKING_ID = "55555555-5555-4555-8555-555555555555";

function taskRow(overrides: Partial<RawTaskFeedRow> = {}): RawTaskFeedRow {
  return {
    id: TASK_ID,
    category_id: CATEGORY_ID,
    title: "Fix a leaky faucet",
    description: "Kitchen tap drips continuously and needs a washer replaced.",
    budget_centavos: "150000",
    currency: "PHP",
    status: "OPEN",
    same_day: false,
    scheduled_for: null,
    published_at: "2026-07-01T08:00:00.000Z",
    city_code: "PH-137404",
    barangay_code: "PH-137404001",
    landmark: "Near the barangay hall",
    approximate_lat: "14.676",
    approximate_lng: "121.043",
    offer_count: 3,
    ...overrides,
  };
}

describe("toNumber", () => {
  it("passes finite numbers through", () => {
    expect(toNumber(150000)).toBe(150000);
    expect(toNumber(0)).toBe(0);
  });

  it("coerces PostgREST numeric/bigint strings", () => {
    expect(toNumber("150000")).toBe(150000);
    expect(toNumber("14.676")).toBeCloseTo(14.676);
  });

  it("treats null/undefined as zero", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
  });

  it("throws on non-finite input rather than silently returning NaN", () => {
    expect(() => toNumber("not-a-number")).toThrow(/finite numeric/);
  });
});

describe("sanitizeKeyword", () => {
  it("keeps a plain keyword intact", () => {
    expect(sanitizeKeyword("plumbing")).toBe("plumbing");
    expect(sanitizeKeyword("leaky faucet")).toBe("leaky faucet");
  });

  it("strips PostgREST filter-grammar characters to prevent filter injection", () => {
    // Attempt to break out of the ilike clause into another filter.
    const malicious = "x*,budget_centavos.gte.0)";
    const cleaned = sanitizeKeyword(malicious);
    expect(cleaned).not.toMatch(/[,()*:.%\\]/);
    expect(cleaned).toBe("x budget_centavos gte 0");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeKeyword("  a...b   c  ")).toBe("a b c");
  });
});

describe("mapTaskFeedRow", () => {
  it("maps a feed row to the public DTO with coerced numbers", () => {
    const item = mapTaskFeedRow(taskRow());
    expect(item.id).toBe(TASK_ID);
    expect(item.categoryId).toBe(CATEGORY_ID);
    expect(item.budgetCentavos).toBe(150000);
    expect(item.offerCount).toBe(3);
    expect(item.approximateLat).toBeCloseTo(14.676);
    expect(item.currency).toBe("PHP");
    expect(item.status).toBe("OPEN");
  });

  it("defaults a null landmark to an empty string", () => {
    expect(mapTaskFeedRow(taskRow({ landmark: null })).landmark).toBe("");
  });

  it("never exposes a forbidden private field", () => {
    const item = mapTaskFeedRow(taskRow()) as unknown as Record<string, unknown>;
    for (const field of FORBIDDEN_PUBLIC_TASK_FIELDS) {
      expect(field in item).toBe(false);
    }
  });

  it("rejects an invalid task id at the trust boundary", () => {
    expect(() => mapTaskFeedRow(taskRow({ id: "not-a-uuid" }))).toThrow(/Invalid UUID/);
  });
});

describe("mapTaskerProfileRow", () => {
  function profileRow(overrides: Partial<RawTaskerProfileRow> = {}): RawTaskerProfileRow {
    return {
      user_id: TASKER_ID,
      display_name: "Ana R.",
      avatar_path: null,
      public_bio: null,
      public_experience: "5 years of home repair",
      completion_count: "12",
      rating_average: "4.75",
      rating_count: "8",
      suspended: false,
      verified_identity: true,
      ...overrides,
    };
  }

  it("maps the trust profile including separately-fetched arrays", () => {
    const profile = mapTaskerProfileRow(profileRow(), ["plumbing", "electrical"], ["PH-137404"]);
    expect(profile.userId).toBe(TASKER_ID);
    expect(profile.completionCount).toBe(12);
    expect(profile.ratingAverage).toBeCloseTo(4.75);
    expect(profile.ratingCount).toBe(8);
    expect(profile.specialties).toEqual(["plumbing", "electrical"]);
    expect(profile.serviceCityCodes).toEqual(["PH-137404"]);
    expect(profile.verifiedIdentity).toBe(true);
  });

  it("maps a null rating average (no ratings yet) to null", () => {
    expect(
      mapTaskerProfileRow(profileRow({ rating_average: null }), [], []).ratingAverage,
    ).toBeNull();
  });

  it("defaults null bio/experience to empty strings", () => {
    const profile = mapTaskerProfileRow(
      profileRow({ public_bio: null, public_experience: null }),
      [],
      [],
    );
    expect(profile.publicBio).toBe("");
    expect(profile.publicExperience).toBe("");
  });

  it("never exposes a forbidden private field", () => {
    const profile = mapTaskerProfileRow(profileRow(), [], []) as unknown as Record<string, unknown>;
    for (const field of FORBIDDEN_PUBLIC_TASKER_FIELDS) {
      expect(field in profile).toBe(false);
    }
  });
});

describe("mapBookingRow", () => {
  it("maps a booking row to the domain record", () => {
    const row: RawBookingRow = {
      id: BOOKING_ID,
      task_id: TASK_ID,
      client_id: USER_ID,
      tasker_id: TASKER_ID,
      agreed_centavos: "150000",
      status: "CONFIRMED",
    };
    const booking = mapBookingRow(row);
    expect(booking.id).toBe(BOOKING_ID);
    expect(booking.taskId).toBe(TASK_ID);
    expect(booking.clientId).toBe(USER_ID);
    expect(booking.taskerId).toBe(TASKER_ID);
    expect(booking.agreedCentavos).toBe(150000);
    expect(booking.status).toBe("CONFIRMED");
  });
});

describe("mapDerivedBalancesRow", () => {
  it("coerces every balance field", () => {
    const balances = mapDerivedBalancesRow({
      pending_centavos: "1000",
      protected_centavos: 2000,
      available_centavos: "3000",
      reserved_centavos: null,
      withdrawn_centavos: "500",
    });
    expect(balances).toEqual({
      pendingCentavos: 1000,
      protectedCentavos: 2000,
      availableCentavos: 3000,
      reservedCentavos: 0,
      withdrawnCentavos: 500,
    });
  });

  it("returns all-zero balances when the RPC yields no row", () => {
    expect(mapDerivedBalancesRow(null)).toEqual({
      pendingCentavos: 0,
      protectedCentavos: 0,
      availableCentavos: 0,
      reservedCentavos: 0,
      withdrawnCentavos: 0,
    });
  });
});

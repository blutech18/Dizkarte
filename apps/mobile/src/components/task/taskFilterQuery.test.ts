import { describe, expect, it } from "vitest";
import {
  buildTaskSearchQuery,
  DEFAULT_TASK_FILTERS,
  describeActiveFilters,
  SORT_OPTIONS,
  validateTaskFilterDraft,
  type TaskFilterState,
} from "./taskFilterQuery";

const EMPTY_DRAFT = {
  minBudget: "",
  maxBudget: "",
  scheduledFrom: "",
  scheduledTo: "",
} as const;

describe("validateTaskFilterDraft", () => {
  it("accepts an empty draft", () => {
    expect(validateTaskFilterDraft(EMPTY_DRAFT).ok).toBe(true);
  });

  it("rejects a minimum budget greater than the maximum", () => {
    const result = validateTaskFilterDraft({
      ...EMPTY_DRAFT,
      minBudget: "1000",
      maxBudget: "500",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.maxBudget).toBeTruthy();
  });

  it("accepts a minimum budget equal to the maximum", () => {
    expect(validateTaskFilterDraft({ ...EMPTY_DRAFT, minBudget: "500", maxBudget: "500" }).ok).toBe(
      true,
    );
  });

  it("rejects a scheduled from date after the to date", () => {
    const result = validateTaskFilterDraft({
      ...EMPTY_DRAFT,
      scheduledFrom: "2026-08-01",
      scheduledTo: "2026-07-01",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.scheduledTo).toBeTruthy();
  });

  it("accepts equal scheduled dates", () => {
    expect(
      validateTaskFilterDraft({
        ...EMPTY_DRAFT,
        scheduledFrom: "2026-07-25",
        scheduledTo: "2026-07-25",
      }).ok,
    ).toBe(true);
  });

  it("rejects a malformed scheduled date", () => {
    const result = validateTaskFilterDraft({ ...EMPTY_DRAFT, scheduledFrom: "not-a-date" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.scheduledFrom).toBeTruthy();
  });
});

describe("buildTaskSearchQuery", () => {
  it("omits unset optional keys entirely", () => {
    expect(buildTaskSearchQuery(1, 20, "", DEFAULT_TASK_FILTERS)).toEqual({
      page: 1,
      pageSize: 20,
      sort: "newest",
    });
  });

  it("emits the no-offers filter only when it is on", () => {
    // Off (or absent) must not appear on the wire at all: an explicit
    // `noOffersOnly: false` would still be a different query object from the
    // default one, and both surfaces compare these queries for feed/map parity.
    expect("noOffersOnly" in buildTaskSearchQuery(1, 20, "", DEFAULT_TASK_FILTERS)).toBe(false);

    const query = buildTaskSearchQuery(1, 20, "", { sort: "newest", noOffersOnly: true });
    expect(query.noOffersOnly).toBe(true);
  });

  it("carries a canonical PSGC city code into task search", () => {
    const filters: TaskFilterState = {
      sort: "newest",
      cityCode: "137404",
      cityName: "Quezon City",
    };
    const query = buildTaskSearchQuery(1, 20, "", filters);
    expect(query.cityCode).toBe("137404");
    expect("cityName" in query).toBe(false);
  });

  it("carries a barangay code together with its parent city", () => {
    const filters: TaskFilterState = {
      sort: "newest",
      cityCode: "137404",
      barangayCode: "137404001",
      cityName: "Quezon City",
      barangayName: "Alicia",
    };
    const query = buildTaskSearchQuery(1, 20, "", filters);
    expect(query.cityCode).toBe("137404");
    expect(query.barangayCode).toBe("137404001");
    expect("barangayName" in query).toBe(false);
  });

  it("carries the schedule window through unchanged", () => {
    const filters: TaskFilterState = {
      sort: "newest",
      scheduledFrom: "2026-07-25T00:00:00.000Z",
      scheduledTo: "2026-07-28T23:59:59.999Z",
    };
    const query = buildTaskSearchQuery(1, 20, "", filters);
    expect(query.scheduledFrom).toBe(filters.scheduledFrom);
    expect(query.scheduledTo).toBe(filters.scheduledTo);
  });

  it("trims a non-empty keyword and omits a blank one", () => {
    expect(buildTaskSearchQuery(1, 20, "  faucet  ", DEFAULT_TASK_FILTERS).keyword).toBe("faucet");
    expect("keyword" in buildTaskSearchQuery(1, 20, "   ", DEFAULT_TASK_FILTERS)).toBe(false);
  });

  it("adds a coordinate origin and switches to the nearby sort", () => {
    const query = buildTaskSearchQuery(1, 100, "", { sort: "newest" }, { lat: 14.6, lng: 121.03 });
    expect(query.nearLat).toBe(14.6);
    expect(query.nearLng).toBe(121.03);
    expect(query.sort).toBe("nearby");
  });

  it("ignores a non-finite origin and keeps the chosen sort (no geo keys)", () => {
    const query = buildTaskSearchQuery(
      1,
      100,
      "",
      { sort: "highest_budget" },
      { lat: Number.NaN, lng: 121 },
    );
    expect("nearLat" in query).toBe(false);
    expect("nearLng" in query).toBe(false);
    expect(query.sort).toBe("highest_budget");
  });

  it("omits geo keys and keeps the chosen sort when no origin is given (set parity)", () => {
    const query = buildTaskSearchQuery(1, 100, "", { sort: "newest" });
    expect("nearLat" in query).toBe(false);
    expect("nearLng" in query).toBe(false);
    expect(query.sort).toBe("newest");
  });
});

describe("dynamic locality summaries", () => {
  it("uses resolved city and barangay names rather than exposing PSGC codes", () => {
    const chips = describeActiveFilters(
      {
        sort: "newest",
        cityCode: "137404",
        cityName: "Quezon City",
        barangayCode: "137404001",
        barangayName: "Alicia",
      },
      () => undefined,
    );
    expect(chips).toContain("Quezon City");
    expect(chips).toContain("Alicia");
    expect(chips.join(" ")).not.toContain("137404");
  });

  it("does not offer nearest sorting without a coordinate-bearing origin", () => {
    expect(SORT_OPTIONS.map((option) => option.key)).toEqual(["newest", "highest_budget"]);
  });
});

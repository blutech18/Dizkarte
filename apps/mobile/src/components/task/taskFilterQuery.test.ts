import { describe, expect, it } from "vitest";
import {
  buildTaskSearchQuery,
  DEFAULT_TASK_FILTERS,
  DEV_REFERENCE_AREAS,
  findReferenceArea,
  validateTaskFilterDraft,
  type TaskFilterState,
} from "./taskFilterQuery";

describe("validateTaskFilterDraft", () => {
  it("accepts an empty draft", () => {
    const result = validateTaskFilterDraft({
      minBudget: "",
      maxBudget: "",
      scheduledFrom: "",
      scheduledTo: "",
      radiusKm: "",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a minimum budget greater than the maximum", () => {
    const result = validateTaskFilterDraft({
      minBudget: "1000",
      maxBudget: "500",
      scheduledFrom: "",
      scheduledTo: "",
      radiusKm: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.maxBudget).toBeTruthy();
  });

  it("accepts a minimum budget equal to the maximum", () => {
    const result = validateTaskFilterDraft({
      minBudget: "500",
      maxBudget: "500",
      scheduledFrom: "",
      scheduledTo: "",
      radiusKm: "",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a radius outside the shared schema bounds", () => {
    const tooSmall = validateTaskFilterDraft({
      minBudget: "",
      maxBudget: "",
      scheduledFrom: "",
      scheduledTo: "",
      radiusKm: "0.1",
    });
    expect(tooSmall.ok).toBe(false);

    const tooLarge = validateTaskFilterDraft({
      minBudget: "",
      maxBudget: "",
      scheduledFrom: "",
      scheduledTo: "",
      radiusKm: "500",
    });
    expect(tooLarge.ok).toBe(false);
  });

  it("rejects a scheduled 'from' date after the 'to' date", () => {
    const result = validateTaskFilterDraft({
      minBudget: "",
      maxBudget: "",
      scheduledFrom: "2026-08-01",
      scheduledTo: "2026-07-01",
      radiusKm: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.scheduledTo).toBeTruthy();
  });

  it("accepts a scheduled 'from' date equal to the 'to' date", () => {
    const result = validateTaskFilterDraft({
      minBudget: "",
      maxBudget: "",
      scheduledFrom: "2026-07-25",
      scheduledTo: "2026-07-25",
      radiusKm: "",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a malformed scheduled date", () => {
    const result = validateTaskFilterDraft({
      minBudget: "",
      maxBudget: "",
      scheduledFrom: "not-a-date",
      scheduledTo: "",
      radiusKm: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.scheduledFrom).toBeTruthy();
  });
});

describe("findReferenceArea", () => {
  it("resolves a known deterministic development reference area", () => {
    const area = findReferenceArea("quezon_city");
    expect(area).toBeDefined();
    expect(area?.label).toContain("approximate");
  });

  it("returns undefined for an unknown/undefined id", () => {
    expect(findReferenceArea(undefined)).toBeUndefined();
    expect(findReferenceArea("nonexistent")).toBeUndefined();
  });

  it("every reference area is labeled as approximate and never exposes precise-looking coordinates", () => {
    for (const area of DEV_REFERENCE_AREAS) {
      expect(area.label.toLowerCase()).toContain("approximate");
    }
  });
});

describe("buildTaskSearchQuery", () => {
  it("omits unset optional keys entirely", () => {
    const query = buildTaskSearchQuery(1, 20, "", DEFAULT_TASK_FILTERS);
    expect(query).toEqual({ page: 1, pageSize: 20, sort: "newest" });
    expect("nearLat" in query).toBe(false);
    expect("nearLng" in query).toBe(false);
  });

  it("includes nearLat/nearLng whenever an area + radius is set", () => {
    const filters: TaskFilterState = { sort: "newest", areaId: "quezon_city", radiusKm: 5 };
    const query = buildTaskSearchQuery(1, 20, "", filters);
    const area = findReferenceArea("quezon_city")!;
    expect(query.nearLat).toBe(area.approximateLat);
    expect(query.nearLng).toBe(area.approximateLng);
    expect(query.radiusKm).toBe(5);
  });

  it("includes nearLat/nearLng whenever an area + nearest sort is set, even without an explicit radius", () => {
    const filters: TaskFilterState = { sort: "nearby", areaId: "bgc_taguig" };
    const query = buildTaskSearchQuery(1, 20, "", filters);
    const area = findReferenceArea("bgc_taguig")!;
    expect(query.nearLat).toBe(area.approximateLat);
    expect(query.nearLng).toBe(area.approximateLng);
  });

  it("never includes nearLat/nearLng when no area is selected", () => {
    const filters: TaskFilterState = { sort: "nearby", radiusKm: 5 };
    const query = buildTaskSearchQuery(1, 20, "", filters);
    expect("nearLat" in query).toBe(false);
    expect("nearLng" in query).toBe(false);
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

  it("trims and includes a non-empty keyword, and omits a blank one", () => {
    const withKeyword = buildTaskSearchQuery(1, 20, "  faucet  ", DEFAULT_TASK_FILTERS);
    expect(withKeyword.keyword).toBe("faucet");
    const blank = buildTaskSearchQuery(1, 20, "   ", DEFAULT_TASK_FILTERS);
    expect("keyword" in blank).toBe(false);
  });
});

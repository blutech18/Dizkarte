import { describe, expect, it } from "vitest";
import { assertNoPrivateTaskFields, SyntheticMapProvider } from "@dizkarte/domain";
import { searchOpenTasksSynthetic, getPublicTaskSynthetic } from "./synthetic-task-feed";

describe("synthetic task feed", () => {
  it("returns bounded, paginated results", async () => {
    const page = await searchOpenTasksSynthetic({ page: 1, pageSize: 2 });
    expect(page.items.length).toBeLessThanOrEqual(2);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(2);
  });

  it("filters by keyword across title and description", async () => {
    const page = await searchOpenTasksSynthetic({ page: 1, pageSize: 20, keyword: "faucet" });
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(`${item.title} ${item.description}`.toLowerCase()).toContain("faucet");
    }
  });

  it("every feed item passes the public-safe privacy assertion", async () => {
    const page = await searchOpenTasksSynthetic({ page: 1, pageSize: 20 });
    for (const item of page.items) {
      expect(() =>
        assertNoPrivateTaskFields(item as unknown as Record<string, unknown>),
      ).not.toThrow();
    }
  });

  it("getPublicTaskSynthetic returns null for an unknown id", async () => {
    const result = await getPublicTaskSynthetic("00000000-0000-4000-8000-000000000000" as never);
    expect(result).toBeNull();
  });

  it("filters by category", async () => {
    const page = await searchOpenTasksSynthetic({
      page: 1,
      pageSize: 20,
      categoryId: "30000000-0000-4000-8000-000000000001",
    });
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(item.categoryId as unknown as string).toBe("30000000-0000-4000-8000-000000000001");
    }
  });

  it("filters by min/max PHP budget bounds", async () => {
    const page = await searchOpenTasksSynthetic({
      page: 1,
      pageSize: 20,
      minBudgetCentavos: 70000,
      maxBudgetCentavos: 120000,
    });
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(item.budgetCentavos).toBeGreaterThanOrEqual(70000);
      expect(item.budgetCentavos).toBeLessThanOrEqual(120000);
    }
  });

  it("filters to same-day tasks only", async () => {
    const page = await searchOpenTasksSynthetic({ page: 1, pageSize: 20, sameDayOnly: true });
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(item.sameDay).toBe(true);
    }
  });

  it("sorts by highest budget descending", async () => {
    const page = await searchOpenTasksSynthetic({
      page: 1,
      pageSize: 20,
      sort: "highest_budget",
    });
    for (let i = 1; i < page.items.length; i += 1) {
      expect(page.items[i - 1]!.budgetCentavos).toBeGreaterThanOrEqual(
        page.items[i]!.budgetCentavos,
      );
    }
  });

  it("sorts newest-first by publishedAt by default", async () => {
    const page = await searchOpenTasksSynthetic({ page: 1, pageSize: 20 });
    for (let i = 1; i < page.items.length; i += 1) {
      const prev = new Date(page.items[i - 1]!.publishedAt ?? 0).getTime();
      const curr = new Date(page.items[i]!.publishedAt ?? 0).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it("filters and sorts by distance when a map provider is supplied", async () => {
    const mapProvider = new SyntheticMapProvider("development");
    const near = { lat: 14.657, lng: 121.032 };
    const withinRadius = await searchOpenTasksSynthetic(
      { page: 1, pageSize: 20, nearLat: near.lat, nearLng: near.lng, radiusKm: 2 },
      mapProvider,
    );
    for (const item of withinRadius.items) {
      const distance = mapProvider.distanceKm(near, {
        lat: item.approximateLat,
        lng: item.approximateLng,
      });
      expect(distance).toBeLessThanOrEqual(2);
    }

    const sortedByDistance = await searchOpenTasksSynthetic(
      { page: 1, pageSize: 20, nearLat: near.lat, nearLng: near.lng, sort: "nearby" },
      mapProvider,
    );
    for (let i = 1; i < sortedByDistance.items.length; i += 1) {
      const prevDistance = mapProvider.distanceKm(near, {
        lat: sortedByDistance.items[i - 1]!.approximateLat,
        lng: sortedByDistance.items[i - 1]!.approximateLng,
      });
      const currDistance = mapProvider.distanceKm(near, {
        lat: sortedByDistance.items[i]!.approximateLat,
        lng: sortedByDistance.items[i]!.approximateLng,
      });
      expect(prevDistance).toBeLessThanOrEqual(currDistance);
    }
  });

  it("reports distance in metres rounded to 100, matching search_task_feed", async () => {
    const mapProvider = new SyntheticMapProvider("development");
    const near = { lat: 14.657, lng: 121.032 };
    const page = await searchOpenTasksSynthetic(
      { page: 1, pageSize: 20, nearLat: near.lat, nearLng: near.lng, sort: "nearby" },
      mapProvider,
    );

    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      // Rounding to 100 m is a privacy property, not cosmetic: it stops a set of
      // readings being trilaterated past the published coordinate precision.
      expect(item.distanceMeters).not.toBeNull();
      expect(item.distanceMeters! % 100).toBe(0);
    }

    // Ascending, using the reported value rather than recomputing it.
    for (let i = 1; i < page.items.length; i += 1) {
      expect(page.items[i - 1]!.distanceMeters!).toBeLessThanOrEqual(
        page.items[i]!.distanceMeters!,
      );
    }
  });

  it("reports a null distance when the search has no origin", async () => {
    const page = await searchOpenTasksSynthetic({ page: 1, pageSize: 20 });
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(item.distanceMeters).toBeNull();
    }
  });

  it("without a distance filter/sort, a distance-only radius has no effect on non-distance queries", async () => {
    // Confirms radius/sort=nearby without nearLat/nearLng never silently
    // filters everything out (a common off-by-default bug).
    const page = await searchOpenTasksSynthetic({ page: 1, pageSize: 20, radiusKm: 1 });
    const unfiltered = await searchOpenTasksSynthetic({ page: 1, pageSize: 20 });
    expect(page.items.length).toBe(unfiltered.items.length);
  });

  it("filters by city/area code", async () => {
    const page = await searchOpenTasksSynthetic({ page: 1, pageSize: 20, cityCode: "137602" });
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(item.cityCode).toBe("137602");
    }
  });

  it("filters by barangay code", async () => {
    const page = await searchOpenTasksSynthetic({
      page: 1,
      pageSize: 20,
      barangayCode: "137404001",
    });
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(item.barangayCode).toBe("137404001");
    }
  });

  it("a scheduled window excludes null-scheduled (same-day, non-matching) tasks", async () => {
    const page = await searchOpenTasksSynthetic({
      page: 1,
      pageSize: 20,
      scheduledFrom: "2026-07-24T00:00:00.000Z",
      scheduledTo: "2026-07-29T00:00:00.000Z",
    });
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(item.scheduledFor).not.toBeNull();
      const time = new Date(item.scheduledFor as string).getTime();
      expect(time).toBeGreaterThanOrEqual(new Date("2026-07-24T00:00:00.000Z").getTime());
      expect(time).toBeLessThanOrEqual(new Date("2026-07-29T00:00:00.000Z").getTime());
    }
  });

  it("a scheduled window combined with sameDayOnly includes matching same-day (null-scheduled) tasks", async () => {
    const page = await searchOpenTasksSynthetic({
      page: 1,
      pageSize: 20,
      scheduledFrom: "2026-07-24T00:00:00.000Z",
      scheduledTo: "2026-07-29T00:00:00.000Z",
      sameDayOnly: true,
    });
    // Same-day tasks have no `scheduledFor`, but explicitly asking for
    // same-day tasks alongside a schedule window must still surface them.
    expect(page.items.some((item) => item.scheduledFor === null && item.sameDay)).toBe(true);
    for (const item of page.items) {
      expect(item.sameDay).toBe(true);
    }
  });

  it("a scheduled from/to window excludes an out-of-range scheduled task", async () => {
    const page = await searchOpenTasksSynthetic({
      page: 1,
      pageSize: 20,
      scheduledFrom: "2026-07-30T00:00:00.000Z",
      scheduledTo: "2026-08-05T00:00:00.000Z",
    });
    expect(page.items.length).toBe(0);
  });
});

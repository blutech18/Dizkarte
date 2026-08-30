import { describe, expect, it } from "vitest";
import type { OwnedTaskRecord } from "../../services/marketplace/types";
import {
  DEFAULT_MY_TASK_FILTERS,
  activeMyTaskFilterCount,
  countMyTasksByCategory,
  countMyTasksByStatus,
  describeMyTaskFilters,
  matchesMyTaskFilters,
  matchesMyTaskStatus,
  sortMyTasks,
} from "./myTaskFilters";

function task(overrides: {
  id: string;
  status?: OwnedTaskRecord["status"];
  categoryId?: string;
  cityCode?: string;
  barangayCode?: string;
  budgetCentavos?: number;
  scheduledFor?: string | null;
  sameDay?: boolean;
  offerCount?: number;
  createdAt?: string;
  updatedAt?: string;
  title?: string;
  description?: string;
}): OwnedTaskRecord {
  return {
    id: overrides.id as OwnedTaskRecord["id"],
    clientId: "usr-1" as OwnedTaskRecord["clientId"],
    status: overrides.status ?? "OPEN",
    draft: {
      categoryId: overrides.categoryId ?? "cat-clean",
      title: overrides.title ?? "Deep clean condo",
      description: overrides.description ?? "Two bedrooms",
      budgetCentavos: overrides.budgetCentavos ?? 150_000,
      scheduledFor: overrides.scheduledFor ?? null,
      sameDay: overrides.sameDay ?? false,
      landmark: "Near the plaza",
      cityCode: overrides.cityCode ?? "137404",
      barangayCode: overrides.barangayCode ?? "137404001",
      approximateLat: 14.5,
      approximateLng: 121,
      exactAddress: "hidden",
      exactLat: 14.5,
      exactLng: 121,
      media: [],
    },
    publishedAt: null,
    createdAt: overrides.createdAt ?? "2026-08-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-08-02T00:00:00.000Z",
    questionCount: 0,
    offerCount: overrides.offerCount ?? 0,
    assignedOfferId: null,
    activeBookingId: null,
  };
}

describe("matchesMyTaskStatus", () => {
  it("groups the lifecycle into the queue buckets the sheet offers", () => {
    expect(matchesMyTaskStatus("DRAFT", "draft")).toBe(true);
    expect(matchesMyTaskStatus("BOOKING_PENDING", "published")).toBe(true);
    expect(matchesMyTaskStatus("COMPLETION_REQUESTED", "assigned")).toBe(true);
    expect(matchesMyTaskStatus("REMOVED", "closed")).toBe(true);
    expect(matchesMyTaskStatus("DRAFT", "published")).toBe(false);
    expect(matchesMyTaskStatus("DRAFT", "all")).toBe(true);
  });
});

describe("matchesMyTaskFilters", () => {
  it("passes everything through with the default filters", () => {
    expect(matchesMyTaskFilters(task({ id: "t1" }), DEFAULT_MY_TASK_FILTERS)).toBe(true);
  });

  it("filters by category and PSGC locality", () => {
    const subject = task({ id: "t1", categoryId: "cat-move", cityCode: "137404" });
    expect(
      matchesMyTaskFilters(subject, { ...DEFAULT_MY_TASK_FILTERS, categoryId: "cat-move" }),
    ).toBe(true);
    expect(
      matchesMyTaskFilters(subject, { ...DEFAULT_MY_TASK_FILTERS, categoryId: "cat-clean" }),
    ).toBe(false);
    expect(matchesMyTaskFilters(subject, { ...DEFAULT_MY_TASK_FILTERS, cityCode: "137404" })).toBe(
      true,
    );
    expect(matchesMyTaskFilters(subject, { ...DEFAULT_MY_TASK_FILTERS, cityCode: "133900" })).toBe(
      false,
    );
  });

  it("treats a budget range as inclusive", () => {
    const subject = task({ id: "t1", budgetCentavos: 100_000 });
    const within = { ...DEFAULT_MY_TASK_FILTERS, minBudgetCentavos: 100_000 };
    expect(matchesMyTaskFilters(subject, within)).toBe(true);
    expect(
      matchesMyTaskFilters(subject, { ...DEFAULT_MY_TASK_FILTERS, minBudgetCentavos: 100_001 }),
    ).toBe(false);
    expect(
      matchesMyTaskFilters(subject, { ...DEFAULT_MY_TASK_FILTERS, maxBudgetCentavos: 100_000 }),
    ).toBe(true);
  });

  it("excludes an undated task from a schedule range rather than assuming it fits", () => {
    const dated = task({ id: "t1", scheduledFor: "2026-09-10T02:00:00.000Z" });
    const undated = task({ id: "t2", scheduledFor: null });
    const range = {
      ...DEFAULT_MY_TASK_FILTERS,
      scheduledFrom: "2026-09-01T00:00:00.000Z",
      scheduledTo: "2026-09-30T23:59:59.999Z",
    };
    expect(matchesMyTaskFilters(dated, range)).toBe(true);
    expect(matchesMyTaskFilters(undated, range)).toBe(false);
  });

  it("only counts offers that can still be acted on", () => {
    const openWithOffers = task({ id: "t1", status: "OPEN", offerCount: 2 });
    const assignedWithOffers = task({ id: "t2", status: "ASSIGNED", offerCount: 2 });
    const filters = { ...DEFAULT_MY_TASK_FILTERS, withOffersOnly: true };
    expect(matchesMyTaskFilters(openWithOffers, filters)).toBe(true);
    // An assigned task's offers are already resolved, so it is not "to review".
    expect(matchesMyTaskFilters(assignedWithOffers, filters)).toBe(false);
  });

  it("searches the title and description", () => {
    const subject = task({ id: "t1", title: "Move a sofa", description: "Third floor walk-up" });
    expect(matchesMyTaskFilters(subject, DEFAULT_MY_TASK_FILTERS, "sofa")).toBe(true);
    expect(matchesMyTaskFilters(subject, DEFAULT_MY_TASK_FILTERS, "walk-up")).toBe(true);
    expect(matchesMyTaskFilters(subject, DEFAULT_MY_TASK_FILTERS, "garden")).toBe(false);
  });
});

describe("countMyTasksByStatus", () => {
  it("counts each status against the other applied filters", () => {
    const tasks = [
      task({ id: "t1", status: "DRAFT", categoryId: "cat-clean" }),
      task({ id: "t2", status: "OPEN", categoryId: "cat-clean" }),
      task({ id: "t3", status: "OPEN", categoryId: "cat-move" }),
    ];

    const counts = countMyTasksByStatus(tasks, {
      ...DEFAULT_MY_TASK_FILTERS,
      categoryId: "cat-clean",
    });

    // The category filter still applies, so the "move" task is not counted.
    expect(counts.all).toBe(2);
    expect(counts.draft).toBe(1);
    expect(counts.published).toBe(1);
    expect(counts.completed).toBe(0);
  });
});

describe("countMyTasksByCategory", () => {
  it("counts tasks per category against other applied filters", () => {
    const tasks = [
      task({ id: "t1", status: "DRAFT", categoryId: "cat-clean" }),
      task({ id: "t2", status: "OPEN", categoryId: "cat-clean" }),
      task({ id: "t3", status: "OPEN", categoryId: "cat-move" }),
    ];
    const categories = [{ id: "cat-clean" }, { id: "cat-move" }, { id: "cat-garden" }];

    const counts = countMyTasksByCategory(
      tasks,
      categories,
      { ...DEFAULT_MY_TASK_FILTERS, status: "published" },
    );

    // Status filter "published" matches OPEN/BOOKING_PENDING
    expect(counts.all).toBe(2);
    expect(counts["cat-clean"]).toBe(1);
    expect(counts["cat-move"]).toBe(1);
    expect(counts["cat-garden"]).toBe(0);
  });
});

describe("sortMyTasks", () => {
  it("sorts undated tasks last when sorting by soonest schedule", () => {
    const sorted = sortMyTasks(
      [
        task({ id: "t1", scheduledFor: null }),
        task({ id: "t2", scheduledFor: "2026-09-20T00:00:00.000Z" }),
        task({ id: "t3", scheduledFor: "2026-09-05T00:00:00.000Z" }),
      ],
      "soonest",
    );
    expect(sorted.map((item) => item.id)).toEqual(["t3", "t2", "t1"]);
  });

  it("sorts by highest budget and most recent update", () => {
    const byBudget = sortMyTasks(
      [
        task({ id: "low", budgetCentavos: 10_000 }),
        task({ id: "high", budgetCentavos: 90_000 }),
      ],
      "highest_budget",
    );
    expect(byBudget[0]!.id).toBe("high");

    const byRecent = sortMyTasks(
      [
        task({ id: "old", updatedAt: "2026-08-01T00:00:00.000Z" }),
        task({ id: "new", updatedAt: "2026-08-20T00:00:00.000Z" }),
      ],
      "recent",
    );
    expect(byRecent[0]!.id).toBe("new");
  });
});

describe("activeMyTaskFilterCount and describeMyTaskFilters", () => {
  it("reports nothing applied for the defaults", () => {
    expect(activeMyTaskFilterCount(DEFAULT_MY_TASK_FILTERS)).toBe(0);
    expect(describeMyTaskFilters(DEFAULT_MY_TASK_FILTERS, () => undefined)).toEqual([]);
  });

  it("counts and labels each applied filter", () => {
    const filters = {
      ...DEFAULT_MY_TASK_FILTERS,
      status: "draft" as const,
      categoryId: "cat-clean",
      cityCode: "137404",
      cityName: "Quezon City",
      withOffersOnly: true,
      sort: "highest_budget" as const,
    };
    expect(activeMyTaskFilterCount(filters)).toBe(5);
    const chips = describeMyTaskFilters(filters, () => "Cleaning");
    expect(chips).toContain("Draft");
    expect(chips).toContain("Cleaning");
    expect(chips).toContain("Quezon City");
    expect(chips).toContain("Has offers to review");
    expect(chips).toContain("Highest budget");
  });
});

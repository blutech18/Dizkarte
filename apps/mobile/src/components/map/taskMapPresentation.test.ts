import { describe, expect, it } from "vitest";
import type { CategoryId, PublicTaskFeedItem, TaskId } from "@dizkarte/domain";
import { distanceLabel, taskTimingLabel } from "./taskMapPresentation";

function makeItem(overrides: Partial<PublicTaskFeedItem> = {}): PublicTaskFeedItem {
  return {
    id: "10000000-0000-4000-8000-000000000001" as TaskId,
    categoryId: "20000000-0000-4000-8000-000000000001" as CategoryId,
    title: "Weekly condo cleaning for a studio unit",
    description: "Looking for a reliable cleaner to do a basic wipe down.",
    budgetCentavos: 90000,
    currency: "PHP",
    status: "OPEN",
    sameDay: false,
    scheduledFor: null,
    cityCode: "PH-137404",
    barangayCode: "PH-137404001",
    landmark: "Near City of Malabon",
    approximateLat: 14.65,
    approximateLng: 120.95,
    publishedAt: "2026-08-20T10:00:00Z",
    offerCount: 2,
    distanceMeters: null,
    ...overrides,
  };
}

describe("taskTimingLabel", () => {
  it("returns 'Needed today' when sameDay is true", () => {
    const item = makeItem({ sameDay: true });
    expect(taskTimingLabel(item)).toBe("Needed today");
  });

  it("returns 'Flexible schedule' when scheduledFor is missing", () => {
    const item = makeItem({ scheduledFor: null });
    expect(taskTimingLabel(item)).toBe("Flexible schedule");
  });

  it("formats a scheduled date with short weekday and month day", () => {
    const item = makeItem({ scheduledFor: "2026-08-28T14:00:00Z" });
    const result = taskTimingLabel(item);
    expect(result).toMatch(/Fri/);
    expect(result).toMatch(/Aug/);
    expect(result).toMatch(/28/);
  });
});

describe("distanceLabel", () => {
  it("returns null when distance is null", () => {
    expect(distanceLabel(null)).toBeNull();
  });

  it("formats meters below 1 km", () => {
    expect(distanceLabel(450)).toBe("450 m away");
  });

  it("enforces minimum 100m for sub-100 values", () => {
    expect(distanceLabel(50)).toBe("100 m away");
  });

  it("formats kilometers above 1000 meters with one decimal", () => {
    expect(distanceLabel(2400)).toBe("2.4 km away");
    expect(distanceLabel(10500)).toBe("10.5 km away");
  });
});

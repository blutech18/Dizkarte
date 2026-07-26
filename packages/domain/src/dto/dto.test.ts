import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_PUBLIC_TASK_FIELDS,
  assertNoPrivateTaskFields,
  ratingAverage,
  toPublicTaskFeedItem,
  type CategoryId,
  type TaskId,
  type TaskProjectionSource,
  type UserId,
} from "../index.js";

const source: TaskProjectionSource = {
  id: "00000000-0000-4000-8000-000000000001" as TaskId,
  categoryId: "00000000-0000-4000-8000-000000000002" as CategoryId,
  clientId: "00000000-0000-4000-8000-000000000003" as UserId,
  title: "Assemble a wardrobe",
  description: "Flat-pack wardrobe assembly needed.",
  budgetCentavos: 80000,
  currency: "PHP",
  status: "OPEN",
  sameDay: false,
  scheduledFor: null,
  publishedAt: "2026-02-01T10:00:00.000Z",
  offerCount: 3,
  publicLocation: {
    cityCode: "133900",
    barangayCode: "133901001",
    landmark: "Near the mall",
    approximateLat: 14.599,
    approximateLng: 120.984,
  },
};

describe("public task projection privacy", () => {
  it("exposes only safe fields", () => {
    const item = toPublicTaskFeedItem(source);
    expect(item.title).toBe(source.title);
    expect(item.cityCode).toBe("133900");
    expect("clientId" in item).toBe(false);
    expect("exactAddress" in item).toBe(false);
    expect("privateLocation" in item).toBe(false);
  });

  it("assertNoPrivateTaskFields throws when a forbidden field leaks", () => {
    for (const field of FORBIDDEN_PUBLIC_TASK_FIELDS) {
      expect(() => assertNoPrivateTaskFields({ [field]: "leak" })).toThrow(field);
    }
  });
});

describe("ratingAverage", () => {
  it("returns null with no ratings", () => {
    expect(ratingAverage(0, 0)).toBeNull();
  });
  it("rounds to two decimals", () => {
    expect(ratingAverage(14, 3)).toBe(4.67);
  });
});

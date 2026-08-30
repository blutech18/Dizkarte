import { describe, it, expect } from "vitest";
import { CATEGORY_CACHE_KEY, parseCachedCategories, serializeCategories } from "./category-cache";
import type { MarketplaceCategory } from "./types";

const CATALOG: ReadonlyArray<MarketplaceCategory> = [
  { id: "30000000-0000-4000-8000-000000000001", slug: "home-cleaning", name: "Home Cleaning" },
  { id: "30000000-0000-4000-8000-000000000002", slug: "handyman", name: "Handyman & Repairs" },
];

describe("category cache", () => {
  it("is versioned so a shape change retires old entries", () => {
    expect(CATEGORY_CACHE_KEY).toMatch(/\.v\d+$/);
  });

  it("round-trips a catalog", () => {
    expect(parseCachedCategories(serializeCategories(CATALOG))).toEqual(CATALOG);
  });

  it("keeps only the catalog fields, so unrelated data is never persisted", () => {
    const serialized = serializeCategories([
      { ...CATALOG[0]!, secret: "do-not-persist" } as MarketplaceCategory,
    ]);
    expect(serialized).not.toContain("do-not-persist");
  });

  it.each([
    ["nothing cached", null],
    ["an empty string", ""],
    ["invalid JSON", "{not json"],
    ["a non-object payload", "42"],
    ["a missing categories key", '{"items":[]}'],
    ["an empty catalog", '{"categories":[]}'],
    ["a category with no id", '{"categories":[{"slug":"a","name":"A"}]}'],
    ["a category with a blank id", '{"categories":[{"id":"","slug":"a","name":"A"}]}'],
    ["a category with a non-string name", '{"categories":[{"id":"x","slug":"a","name":7}]}'],
  ])("returns null rather than a partial catalog for %s", (_case, raw) => {
    expect(parseCachedCategories(raw)).toBeNull();
  });

  it("rejects the whole payload when any entry is malformed", () => {
    const raw = JSON.stringify({ categories: [CATALOG[0], { id: "x" }] });
    expect(parseCachedCategories(raw)).toBeNull();
  });
});

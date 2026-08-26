import { describe, expect, it } from "vitest";
import { categoryIdForTitle, categorySlugsForTitle } from "./taskCategoryQuestions";

/** Stand-in for the live catalogue: the slugs currently active in the database. */
const LIVE_CATEGORIES = [
  { id: "cat-gardening", slug: "gardening" },
  { id: "cat-painting", slug: "painting" },
  { id: "cat-cleaning", slug: "cleaning" },
  { id: "cat-removals", slug: "removals" },
  { id: "cat-repairs", slug: "repairs-installations" },
  { id: "cat-copywriting", slug: "copywriting" },
  { id: "cat-data-entry", slug: "data-entry" },
  { id: "cat-assembly", slug: "furniture-assembly" },
];

/** The older taxonomy from supabase/seed.sql, to prove the fallbacks work. */
const LEGACY_CATEGORIES = [
  { id: "legacy-cleaning", slug: "home-cleaning" },
  { id: "legacy-handyman", slug: "handyman" },
  { id: "legacy-moving", slug: "moving-hauling" },
  { id: "legacy-errands", slug: "errands" },
];

describe("categorySlugsForTitle", () => {
  it("classifies a moving title as removals, most specific slug first", () => {
    expect(categorySlugsForTitle("Help me move home")[0]).toBe("removals");
    expect(categorySlugsForTitle("Move a house")[0]).toBe("removals");
    expect(categorySlugsForTitle("House relocation next week")[0]).toBe("removals");
  });

  it("classifies the other trades", () => {
    expect(categorySlugsForTitle("Deep clean a condo")[0]).toBe("cleaning");
    expect(categorySlugsForTitle("Repaint the bedroom")[0]).toBe("painting");
    expect(categorySlugsForTitle("Mow the lawn")[0]).toBe("gardening");
    expect(categorySlugsForTitle("Assemble an IKEA wardrobe")[0]).toBe("furniture-assembly");
    expect(categorySlugsForTitle("Fix a leaking tap")[0]).toBe("repairs-installations");
    expect(categorySlugsForTitle("Aircon not cooling")[0]).toBe("appliance-repair");
    expect(categorySlugsForTitle("Deliver a parcel to Makati")[0]).toBe("errands");
    expect(categorySlugsForTitle("Write a blog article")[0]).toBe("copywriting");
    expect(categorySlugsForTitle("Data entry for 200 receipts")[0]).toBe("data-entry");
  });

  it("returns nothing for an unrecognised or empty title", () => {
    expect(categorySlugsForTitle("Event photography")).toEqual([]);
    expect(categorySlugsForTitle("")).toEqual([]);
    expect(categorySlugsForTitle("   ")).toEqual([]);
  });

  it("prefers the more specific trade over the broad repairs catch-all", () => {
    // "install" would otherwise match the repairs rule.
    expect(categorySlugsForTitle("Assemble and install a wardrobe")[0]).toBe("furniture-assembly");
    // "replace" would too, but the appliance rule is more specific.
    expect(categorySlugsForTitle("Replace the refrigerator seal")[0]).toBe("appliance-repair");
  });
});

describe("categoryIdForTitle", () => {
  it("resolves to a real category id from the live catalogue", () => {
    expect(categoryIdForTitle("Help me move home", LIVE_CATEGORIES)).toBe("cat-removals");
    expect(categoryIdForTitle("End of lease cleaning", LIVE_CATEGORIES)).toBe("cat-cleaning");
  });

  it("falls back to the next candidate when the preferred slug is absent", () => {
    // No "removals" in the legacy taxonomy, so it must pick "moving-hauling".
    expect(categoryIdForTitle("Help me move home", LEGACY_CATEGORIES)).toBe("legacy-moving");
    // No "furniture-assembly" either, so assembly falls back to handyman.
    expect(categoryIdForTitle("Assemble a wardrobe", LEGACY_CATEGORIES)).toBe("legacy-handyman");
    expect(categoryIdForTitle("Deep clean a condo", LEGACY_CATEGORIES)).toBe("legacy-cleaning");
  });

  it("returns null when nothing matches, so the current category is kept", () => {
    expect(categoryIdForTitle("Event photography", LIVE_CATEGORIES)).toBeNull();
    expect(categoryIdForTitle("", LIVE_CATEGORIES)).toBeNull();
  });

  it("never invents a category that is not in the catalogue", () => {
    expect(categoryIdForTitle("Write a blog article", LEGACY_CATEGORIES)).toBeNull();
  });
});

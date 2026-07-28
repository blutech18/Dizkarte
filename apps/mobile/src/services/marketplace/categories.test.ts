import { beforeEach, describe, expect, it } from "vitest";

process.env.EXPO_PUBLIC_DIZKARTE_ENV ??= "development";
process.env.EXPO_PUBLIC_SUPABASE_URL ??= "https://synthetic-test.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= "synthetic-test-anon-key";
process.env.EXPO_PUBLIC_MARKETPLACE_ADAPTER = "synthetic";

import { __resetAppConfigForTests } from "../../lib/config";
import { __resetMarketplaceRepositoryForTests, createMarketplaceRepository } from "./factory";
import type { MobileMarketplacePort } from "./port";

const CLIENT_ID = "10000000-0000-4000-8000-000000000002";

/**
 * The service catalog must come from the repository rather than a bundled list.
 * `tasks.category_id` is a foreign key, so an id the app invents locally fails on
 * insert and makes existing tasks render without a category name.
 */
describe("service catalog", () => {
  let repo: MobileMarketplacePort;

  beforeEach(() => {
    __resetAppConfigForTests();
    __resetMarketplaceRepositoryForTests();
    repo = createMarketplaceRepository();
  });

  it("is served through the repository port", async () => {
    const categories = await repo.listCategories();
    expect(categories.length).toBeGreaterThan(0);
  });

  it("exposes an id, slug and name for every category", async () => {
    for (const category of await repo.listCategories()) {
      expect(category.id).toBeTruthy();
      expect(category.slug).toBeTruthy();
      expect(category.name).toBeTruthy();
    }
  });

  it("returns unique ids and slugs", async () => {
    const categories = await repo.listCategories();
    expect(new Set(categories.map((c) => c.id)).size).toBe(categories.length);
    expect(new Set(categories.map((c) => c.slug)).size).toBe(categories.length);
  });

  it("accepts a catalog id when saving a draft, so the picker and writes agree", async () => {
    const categories = await repo.listCategories();
    const saved = await repo.saveDraftTask(CLIENT_ID, {
      categoryId: categories[0]!.id,
      title: "Repaint a small bedroom wall",
      description: "One accent wall needs repainting; paint and rollers are already on site.",
      budgetCentavos: 250000,
      scheduledFor: null,
      sameDay: false,
      landmark: "Near Trinoma",
      cityCode: "137404",
      barangayCode: "137404001",
      approximateLat: 14.657,
      approximateLng: 121.032,
      exactAddress: "12 Sample Road, Quezon City",
      exactLat: 14.6571,
      exactLng: 121.0321,
      media: [],
    });
    expect(saved.draft.categoryId).toBe(categories[0]!.id);
  });
});

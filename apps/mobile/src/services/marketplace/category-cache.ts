import type { MarketplaceCategory } from "./types";

/**
 * Local cache for the service catalog.
 *
 * The catalog is small, changes rarely, and is needed by the task wizard, the
 * browse filters, and every task label — but it was re-fetched from scratch on
 * every cold start, so the first screen after sign-in always waited a network
 * round-trip before it could name a category. Caching it lets the app render
 * immediately from the last known catalog and revalidate in the background.
 *
 * The cache is a render accelerator, never an authority: ids are still the
 * database-issued ones (a stale id would fail the foreign key on task creation,
 * which is exactly the loud failure we want), and a revalidation result always
 * replaces what was cached.
 */

/**
 * Versioned key. Bumping it retires every previously written entry, which is how
 * a shape change is rolled out without reading a payload we no longer trust.
 */
export const CATEGORY_CACHE_KEY = "dizkarte.categoryCatalog.v1";

type CachedCatalog = {
  readonly categories: ReadonlyArray<MarketplaceCategory>;
};

function isCategory(value: unknown): value is MarketplaceCategory {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.slug === "string" &&
    typeof candidate.name === "string"
  );
}

export function serializeCategories(categories: ReadonlyArray<MarketplaceCategory>): string {
  const payload: CachedCatalog = {
    categories: categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
    })),
  };
  return JSON.stringify(payload);
}

/**
 * Read a cached catalog back.
 *
 * Returns `null` — never a partial list — for anything unreadable: absent,
 * malformed, wrong shape, or empty. A half-parsed catalog would surface as
 * silently missing categories in a picker, so the caller falls back to the
 * network instead.
 */
export function parseCachedCategories(
  raw: string | null,
): ReadonlyArray<MarketplaceCategory> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const categories = (parsed as Record<string, unknown>).categories;
  if (!Array.isArray(categories) || categories.length === 0) return null;
  if (!categories.every(isCategory)) return null;
  return categories.map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.name,
  }));
}

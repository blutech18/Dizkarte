/**
 * Slugs that ship a category illustration in `assets/icons`.
 *
 * Kept free of React Native imports so the seed catalog can be checked against
 * it in a plain unit test. `CategoryGrid` types its image map as
 * `Record<CategoryArtSlug, ...>`, so adding a slug here without adding the
 * matching asset is a compile error rather than a blank tile at runtime.
 *
 * Slugs, not database ids: ids are issued per environment, slugs are stable.
 */
export const CATEGORY_ART_SLUGS = [
  "gardening",
  "painting",
  "cleaning",
  "removals",
  "repairs-installations",
  "copywriting",
  "data-entry",
  "furniture-assembly",
] as const;

export type CategoryArtSlug = (typeof CATEGORY_ART_SLUGS)[number];

export function hasCategoryArt(slug: string): slug is CategoryArtSlug {
  return (CATEGORY_ART_SLUGS as ReadonlyArray<string>).includes(slug);
}

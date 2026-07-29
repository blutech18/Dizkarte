import { describe, expect, it } from "vitest";
import { CATEGORY_ART_SLUGS, hasCategoryArt } from "./categoryArt";

/**
 * Imports `categoryArt.ts`, not the grid component: the component `require`s PNG
 * assets and pulls in React Native, neither of which the pure-logic test
 * environment can parse.
 *
 * These assertions pin the contract between the seeded catalog and the shipped
 * illustrations. The seed's slugs are duplicated here deliberately — if someone
 * renames a category without renaming its asset, this fails.
 */
const SEEDED_CATEGORY_SLUGS = [
  "gardening",
  "painting",
  "cleaning",
  "removals",
  "repairs-installations",
  "copywriting",
  "data-entry",
  "furniture-assembly",
] as const;

describe("category artwork", () => {
  it("ships an illustration for every seeded category", () => {
    for (const slug of SEEDED_CATEGORY_SLUGS) {
      expect(hasCategoryArt(slug)).toBe(true);
    }
  });

  it("ships no illustration that has no seeded category", () => {
    for (const slug of CATEGORY_ART_SLUGS) {
      expect(SEEDED_CATEGORY_SLUGS).toContain(slug);
    }
  });

  it("uses kebab-case slugs, so asset filenames need no escaping", () => {
    for (const slug of CATEGORY_ART_SLUGS) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("reports no artwork for a category added later", () => {
    // Such a category is skipped by the grid rather than rendered blank.
    expect(hasCategoryArt("pet-sitting")).toBe(false);
    expect(hasCategoryArt("")).toBe(false);
  });
});

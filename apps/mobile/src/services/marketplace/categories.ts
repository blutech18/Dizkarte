/**
 * Synthetic category directory mirroring `supabase/seed.sql` slugs.
 *
 * IDs are deterministic UUID-shaped placeholders for development/test only —
 * the real category catalog is served from the `categories` table once
 * Supabase wiring lands (task 9). Kept mobile-local so this pass does not
 * touch migrations/seed data.
 */
export type SyntheticCategory = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
};

export const SYNTHETIC_CATEGORIES: ReadonlyArray<SyntheticCategory> = [
  { id: "30000000-0000-4000-8000-000000000001", slug: "home-cleaning", name: "Home Cleaning" },
  { id: "30000000-0000-4000-8000-000000000002", slug: "handyman", name: "Handyman & Repairs" },
  {
    id: "30000000-0000-4000-8000-000000000003",
    slug: "appliance-repair",
    name: "Appliance Repair",
  },
  { id: "30000000-0000-4000-8000-000000000004", slug: "moving-hauling", name: "Moving & Hauling" },
  { id: "30000000-0000-4000-8000-000000000005", slug: "gardening", name: "Gardening & Lawn" },
  { id: "30000000-0000-4000-8000-000000000006", slug: "tutoring", name: "Tutoring" },
  { id: "30000000-0000-4000-8000-000000000007", slug: "errands", name: "Errands & Delivery" },
  { id: "30000000-0000-4000-8000-000000000008", slug: "tech-support", name: "Tech Support" },
];

export function categoryName(categoryId: string): string {
  return SYNTHETIC_CATEGORIES.find((c) => c.id === categoryId)?.name ?? "Uncategorized";
}

import { describe, it, expect } from "vitest";
import { taskSearchSchema, assertNoPrivateTaskFields } from "@dizkarte/domain";
import { createSupabaseClient } from "./client.js";
import { SupabaseMarketplaceReadAdapter } from "./marketplace-read-adapter.js";

/**
 * Live integration slice against a real Supabase/Postgres stack.
 *
 * This suite is SKIPPED unless integration credentials are provided, so unit CI
 * stays hermetic. To run it, point it at a local Supabase stack seeded with
 * `supabase/seed.sql` (synthetic data only):
 *
 *   DIZKARTE_IT_SUPABASE_URL=http://127.0.0.1:54321 \
 *   DIZKARTE_IT_SUPABASE_ANON_KEY=<local anon key> \
 *   npm run test -- packages/adapter-supabase/src/integration.test.ts
 *
 * It never uses the service-role key: it verifies exactly the anon/RLS-bounded
 * public read surface a real client would see.
 */
const url = process.env.DIZKARTE_IT_SUPABASE_URL?.trim();
const anonKey = process.env.DIZKARTE_IT_SUPABASE_ANON_KEY?.trim();
const runLive = Boolean(url && anonKey);

describe.skipIf(!runLive)("SupabaseMarketplaceReadAdapter (live integration)", () => {
  // Constructed lazily inside each test: the describe body is still executed
  // during collection even when skipped, so building the client here (with
  // possibly-empty creds) must not happen at suite-definition time.
  const makeAdapter = (): SupabaseMarketplaceReadAdapter =>
    new SupabaseMarketplaceReadAdapter(
      createSupabaseClient({ url: url ?? "", anonKey: anonKey ?? "" }),
    );

  it("returns a bounded, well-formed public task feed with no private fields", async () => {
    const adapter = makeAdapter();
    const input = taskSearchSchema.parse({ page: 1, pageSize: 10, sort: "newest" });
    const result = await adapter.searchOpenTasks(input);

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.items.length).toBeLessThanOrEqual(10);
    expect(result.total).toBeGreaterThanOrEqual(result.items.length);
    for (const item of result.items) {
      expect(item.status).toBe("OPEN");
      expect(item.currency).toBe("PHP");
      assertNoPrivateTaskFields(item as unknown as Record<string, unknown>);
    }
  });

  it("fetches a single public task consistent with the feed (or null)", async () => {
    const adapter = makeAdapter();
    const feed = await adapter.searchOpenTasks(taskSearchSchema.parse({ page: 1, pageSize: 1 }));
    const first = feed.items[0];
    if (!first) return; // empty seed — nothing to assert
    const detail = await adapter.getPublicTask(first.id);
    expect(detail?.id).toBe(first.id);
  });

  it("respects the server-side page-size ceiling", async () => {
    const adapter = makeAdapter();
    const result = await adapter.searchOpenTasks({
      page: 1,
      pageSize: 9999,
      sort: "newest",
    } as never);
    expect(result.items.length).toBeLessThanOrEqual(100);
  });
});

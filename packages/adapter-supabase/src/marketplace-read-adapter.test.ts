import { describe, it, expect } from "vitest";
import {
  taskSearchSchema,
  type TaskId,
  type UserId,
  type BookingId,
  type LedgerAccountId,
} from "@dizkarte/domain";
import { SupabaseMarketplaceReadAdapter } from "./marketplace-read-adapter.js";
import type { DizkarteSupabaseClient } from "./client.js";

type FakeResult = { data: unknown; error: { message: string } | null; count?: number };

/**
 * Minimal chainable stand-in for the PostgREST query builder. Records applied
 * filters so tests can assert the adapter wires inputs correctly, and resolves
 * (when awaited or via `maybeSingle`) to a preconfigured result.
 */
class FakeBuilder implements PromiseLike<FakeResult> {
  readonly filters: string[] = [];
  constructor(private readonly result: FakeResult) {}
  select(): this {
    return this;
  }
  or(expr: string): this {
    this.filters.push(`or:${expr}`);
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push(`eq:${col}=${String(val)}`);
    return this;
  }
  gte(col: string, val: unknown): this {
    this.filters.push(`gte:${col}=${String(val)}`);
    return this;
  }
  lte(col: string, val: unknown): this {
    this.filters.push(`lte:${col}=${String(val)}`);
    return this;
  }
  order(col: string, opts: { ascending: boolean }): this {
    this.filters.push(`order:${col}:${opts.ascending ? "asc" : "desc"}`);
    return this;
  }
  range(from: number, to: number): this {
    this.filters.push(`range:${from}-${to}`);
    return this;
  }
  maybeSingle(): Promise<FakeResult> {
    return Promise.resolve(this.result);
  }
  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function makeClient(config: {
  tables?: Record<string, FakeResult>;
  rpcs?: Record<string, FakeResult>;
  builders?: FakeBuilder[];
}): DizkarteSupabaseClient {
  const client = {
    from(table: string): FakeBuilder {
      const result = config.tables?.[table] ?? { data: [], error: null };
      const builder = new FakeBuilder(result);
      config.builders?.push(builder);
      return builder;
    },
    rpc(name: string): Promise<FakeResult> {
      return Promise.resolve(config.rpcs?.[name] ?? { data: [], error: null });
    },
  };
  return client as unknown as DizkarteSupabaseClient;
}

const TASK_ID = "11111111-1111-4111-8111-111111111111" as TaskId;
const CATEGORY_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333" as UserId;
const TASKER_ID = "44444444-4444-4444-8444-444444444444" as UserId;
const BOOKING_ID = "55555555-5555-4555-8555-555555555555" as BookingId;
const ACCOUNT_ID = "66666666-6666-4666-8666-666666666666" as LedgerAccountId;

const feedRow = {
  id: TASK_ID,
  category_id: CATEGORY_ID,
  title: "Fix a leaky faucet",
  description: "Kitchen tap drips and needs a new washer.",
  budget_centavos: 150000,
  currency: "PHP",
  status: "OPEN",
  same_day: false,
  scheduled_for: null,
  published_at: "2026-07-01T08:00:00.000Z",
  city_code: "PH-137404",
  barangay_code: "PH-137404001",
  landmark: "Near the barangay hall",
  approximate_lat: 14.676,
  approximate_lng: 121.043,
  offer_count: 2,
};

describe("SupabaseMarketplaceReadAdapter.searchOpenTasks", () => {
  it("maps rows and builds a correct Paginated envelope from the exact count", async () => {
    const client = makeClient({
      tables: { public_task_feed: { data: [feedRow], error: null, count: 25 } },
    });
    const adapter = new SupabaseMarketplaceReadAdapter(client);
    const input = taskSearchSchema.parse({ page: 1, pageSize: 10 });

    const result = await adapter.searchOpenTasks(input);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe(TASK_ID);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.total).toBe(25);
    expect(result.hasMore).toBe(true);
  });

  it("clamps an oversized pageSize to the server-side maximum of 100", async () => {
    const builders: FakeBuilder[] = [];
    const client = makeClient({
      tables: { public_task_feed: { data: [], error: null, count: 0 } },
      builders,
    });
    const adapter = new SupabaseMarketplaceReadAdapter(client);
    // pageSize above the schema max would be rejected by Zod; call the adapter
    // directly with an out-of-band value to prove the internal clamp.
    await adapter.searchOpenTasks({ page: 1, pageSize: 500, sort: "newest" } as never);
    expect(builders[0]?.filters).toContain("range:0-99");
  });

  it("applies sanitized keyword and filters, and honors highest_budget sort", async () => {
    const builders: FakeBuilder[] = [];
    const client = makeClient({
      tables: { public_task_feed: { data: [], error: null, count: 0 } },
      builders,
    });
    const adapter = new SupabaseMarketplaceReadAdapter(client);
    const input = taskSearchSchema.parse({
      page: 2,
      pageSize: 20,
      keyword: "leak)*",
      categoryId: CATEGORY_ID,
      minBudgetCentavos: 50000,
      sameDayOnly: true,
      sort: "highest_budget",
    });

    await adapter.searchOpenTasks(input);
    const filters = builders[0]?.filters ?? [];

    expect(filters.some((f) => f.startsWith("or:title.ilike.*leak*"))).toBe(true);
    expect(filters).toContain(`eq:category_id=${CATEGORY_ID}`);
    expect(filters).toContain("gte:budget_centavos=50000");
    expect(filters).toContain("eq:same_day=true");
    expect(filters).toContain("order:budget_centavos:desc");
    expect(filters).toContain("range:20-39");
  });

  it("throws a safe error when the query returns a PostgREST error", async () => {
    const client = makeClient({
      tables: { public_task_feed: { data: null, error: { message: "permission denied" } } },
    });
    const adapter = new SupabaseMarketplaceReadAdapter(client);
    await expect(
      adapter.searchOpenTasks(taskSearchSchema.parse({ page: 1, pageSize: 10 })),
    ).rejects.toThrow(/searchOpenTasks/);
  });
});

describe("SupabaseMarketplaceReadAdapter single reads", () => {
  it("returns null for a missing public task", async () => {
    const client = makeClient({ tables: { public_task_feed: { data: null, error: null } } });
    const adapter = new SupabaseMarketplaceReadAdapter(client);
    expect(await adapter.getPublicTask(TASK_ID)).toBeNull();
  });

  it("assembles a tasker profile from the view plus specialty and service-area reads", async () => {
    const client = makeClient({
      tables: {
        public_tasker_profiles: {
          data: {
            user_id: TASKER_ID,
            display_name: "Ana R.",
            avatar_path: null,
            public_bio: "Reliable handywork.",
            public_experience: "5 years",
            completion_count: 12,
            rating_average: 4.75,
            rating_count: 8,
            suspended: false,
            verified_identity: true,
          },
          error: null,
        },
        tasker_specialties: {
          data: [{ specialties: { slug: "plumbing" } }, { specialties: { slug: "electrical" } }],
          error: null,
        },
        service_areas: {
          data: [
            { city_code: "PH-137404" },
            { city_code: "PH-137404" },
            { city_code: "PH-137602" },
          ],
          error: null,
        },
      },
    });
    const adapter = new SupabaseMarketplaceReadAdapter(client);
    const profile = await adapter.getPublicTaskerProfile(TASKER_ID);

    expect(profile?.displayName).toBe("Ana R.");
    expect(profile?.specialties).toEqual(["plumbing", "electrical"]);
    expect(profile?.serviceCityCodes).toEqual(["PH-137404", "PH-137602"]);
    expect(profile?.ratingAverage).toBeCloseTo(4.75);
  });

  it("returns null when the tasker profile is not found", async () => {
    const client = makeClient({ tables: { public_tasker_profiles: { data: null, error: null } } });
    const adapter = new SupabaseMarketplaceReadAdapter(client);
    expect(await adapter.getPublicTaskerProfile(TASKER_ID)).toBeNull();
  });

  it("maps a visible booking row", async () => {
    const client = makeClient({
      tables: {
        bookings: {
          data: {
            id: BOOKING_ID,
            task_id: TASK_ID,
            client_id: USER_ID,
            tasker_id: TASKER_ID,
            agreed_centavos: 150000,
            status: "CONFIRMED",
          },
          error: null,
        },
      },
    });
    const adapter = new SupabaseMarketplaceReadAdapter(client);
    const booking = await adapter.getBooking(BOOKING_ID);
    expect(booking?.status).toBe("CONFIRMED");
    expect(booking?.agreedCentavos).toBe(150000);
  });
});

describe("SupabaseMarketplaceReadAdapter derived numbers", () => {
  it("maps the first row of the derive_user_balances RPC", async () => {
    const client = makeClient({
      rpcs: {
        derive_user_balances: {
          data: [
            {
              pending_centavos: 1000,
              protected_centavos: 2000,
              available_centavos: 3000,
              reserved_centavos: 0,
              withdrawn_centavos: 500,
            },
          ],
          error: null,
        },
      },
    });
    const adapter = new SupabaseMarketplaceReadAdapter(client);
    const balances = await adapter.getDerivedBalances(USER_ID);
    expect(balances.availableCentavos).toBe(3000);
    expect(balances.withdrawnCentavos).toBe(500);
  });

  it("sums RLS-visible ledger entries for an account balance", async () => {
    const client = makeClient({
      tables: {
        ledger_entries: {
          data: [{ amount_centavos: 1000 }, { amount_centavos: -250 }, { amount_centavos: "500" }],
          error: null,
        },
      },
    });
    const adapter = new SupabaseMarketplaceReadAdapter(client);
    expect(await adapter.getLedgerAccountBalance(ACCOUNT_ID)).toBe(1250);
  });
});

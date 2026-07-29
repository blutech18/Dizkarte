import {
  paginate,
  type Paginated,
  type PublicTaskFeedItem,
  type PublicTaskerProfile,
  type MarketplaceRepository,
  type BookingRecord,
  type DerivedBalances,
  type TaskSearchInput,
  type TaskId,
  type UserId,
  type BookingId,
  type LedgerAccountId,
} from "@dizkarte/domain";
import type { DizkarteSupabaseClient } from "./client.js";
import {
  mapTaskFeedRow,
  mapTaskerProfileRow,
  mapBookingRow,
  mapDerivedBalancesRow,
  sanitizeKeyword,
  toNumber,
  type RawTaskFeedRow,
  type RawTaskerProfileRow,
  type RawBookingRow,
  type RawDerivedBalancesRow,
} from "./mappers.js";

const MAX_PAGE_SIZE = 100;
const MIN_PAGE_SIZE = 1;

function clampPageSize(pageSize: number): number {
  if (!Number.isFinite(pageSize)) return MIN_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.trunc(pageSize)));
}

/** Wrap a PostgREST error into a safe Error without leaking provider internals. */
function assertNoError(context: string, error: { message: string } | null): void {
  if (error) {
    throw new Error(`Supabase read failed (${context}): ${error.message}`);
  }
}

/**
 * Read-only, RLS-respecting Supabase implementation of the domain
 * `MarketplaceRepository`.
 *
 * This is the first vertical slice of the real backend adapter foundation. It
 * covers exclusively the public-safe read surface (feed, task detail, Tasker
 * trust profile, booking summary, ledger-derived balances). Every query flows
 * through the anon key and Row Level Security / public-safe views from
 * migrations `0008`/`0009`; no service-role key, no mutations, and no exact
 * address/contact/payment fields are ever read here. Mutations remain the
 * privileged-RPC responsibility tracked separately.
 */
export class SupabaseMarketplaceReadAdapter implements MarketplaceRepository {
  constructor(private readonly client: DizkarteSupabaseClient) {}

  async searchOpenTasks(input: TaskSearchInput): Promise<Paginated<PublicTaskFeedItem>> {
    const pageSize = clampPageSize(input.pageSize);
    const page = Math.max(1, Math.trunc(input.page));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.client.from("public_task_feed").select("*", { count: "exact" });

    if (input.keyword) {
      const safe = sanitizeKeyword(input.keyword);
      if (safe.length > 0) {
        query = query.or(`title.ilike.*${safe}*,description.ilike.*${safe}*`);
      }
    }
    if (input.categoryId) query = query.eq("category_id", input.categoryId);
    if (input.cityCode) query = query.eq("city_code", input.cityCode);
    if (input.barangayCode) query = query.eq("barangay_code", input.barangayCode);
    if (input.minBudgetCentavos !== undefined) {
      query = query.gte("budget_centavos", input.minBudgetCentavos);
    }
    if (input.maxBudgetCentavos !== undefined) {
      query = query.lte("budget_centavos", input.maxBudgetCentavos);
    }
    if (input.sameDayOnly === true) query = query.eq("same_day", true);

    // Distance ("nearby") sorting requires a configured map provider; without
    // one it falls back to newest so results stay deterministic and bounded.
    if (input.sort === "highest_budget") {
      query = query.order("budget_centavos", { ascending: false, nullsFirst: false });
    } else {
      query = query.order("published_at", { ascending: false, nullsFirst: false });
    }

    const { data, error, count } = await query.range(from, to);
    assertNoError("searchOpenTasks", error);

    const rows = (data ?? []) as ReadonlyArray<RawTaskFeedRow>;
    const items = rows.map(mapTaskFeedRow);
    return paginate(items, page, pageSize, count ?? items.length);
  }

  async getPublicTask(taskId: TaskId): Promise<PublicTaskFeedItem | null> {
    const { data, error } = await this.client
      .from("public_task_feed")
      .select("*")
      .eq("id", taskId)
      .maybeSingle();
    assertNoError("getPublicTask", error);
    return data ? mapTaskFeedRow(data as RawTaskFeedRow) : null;
  }

  async getPublicTaskerProfile(userId: UserId): Promise<PublicTaskerProfile | null> {
    const { data, error } = await this.client
      .from("public_tasker_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    assertNoError("getPublicTaskerProfile", error);
    if (!data) return null;

    const [specialties, serviceCityCodes] = await Promise.all([
      this.fetchSpecialtySlugs(userId),
      this.fetchServiceCityCodes(userId),
    ]);
    return mapTaskerProfileRow(data as RawTaskerProfileRow, specialties, serviceCityCodes);
  }

  private async fetchSpecialtySlugs(userId: UserId): Promise<ReadonlyArray<string>> {
    const { data, error } = await this.client
      .from("tasker_specialties")
      .select("specialties(slug)")
      .eq("user_id", userId);
    assertNoError("fetchSpecialtySlugs", error);
    // PostgREST embeds the related row; depending on inferred cardinality it may
    // arrive as an object or a single-element array. Normalize both.
    type Embedded = { slug: string } | ReadonlyArray<{ slug: string }> | null;
    const rows = (data ?? []) as unknown as ReadonlyArray<{ specialties: Embedded }>;
    const slugOf = (embedded: Embedded): string | undefined => {
      if (embedded === null) return undefined;
      const one = Array.isArray(embedded) ? embedded[0] : embedded;
      return one?.slug;
    };
    return rows
      .map((r) => slugOf(r.specialties))
      .filter((slug): slug is string => typeof slug === "string");
  }

  private async fetchServiceCityCodes(userId: UserId): Promise<ReadonlyArray<string>> {
    const { data, error } = await this.client
      .from("service_areas")
      .select("city_code")
      .eq("user_id", userId);
    assertNoError("fetchServiceCityCodes", error);
    const rows = (data ?? []) as ReadonlyArray<{ city_code: string }>;
    return Array.from(new Set(rows.map((r) => r.city_code)));
  }

  async getBooking(bookingId: BookingId): Promise<BookingRecord | null> {
    const { data, error } = await this.client
      .from("bookings")
      .select("id,task_id,client_id,tasker_id,agreed_centavos,status")
      .eq("id", bookingId)
      .maybeSingle();
    assertNoError("getBooking", error);
    return data ? mapBookingRow(data as RawBookingRow) : null;
  }

  /**
   * The caller's own derived balances.
   *
   * Calls `public.my_ledger_balances()`, which takes no arguments and resolves
   * the subject from `auth.uid()` server-side. The underlying
   * `app.derive_user_balances(p_user_id)` is not PostgREST-exposed on purpose:
   * a user-supplied id would let one Tasker read another's earnings.
   *
   * `userId` is therefore only used to assert the caller is asking about
   * themselves, so a mismatched call fails loudly instead of silently returning
   * the wrong person's money.
   */
  async getDerivedBalances(userId: UserId): Promise<DerivedBalances> {
    const { data: authData } = await this.client.auth.getUser();
    const callerId = authData.user?.id;
    if (callerId && callerId !== userId) {
      throw new Error(
        "getDerivedBalances: balances can only be read for the signed-in user.",
      );
    }

    const { data, error } = await this.client.rpc("my_ledger_balances");
    assertNoError("getDerivedBalances", error);
    const rows = (data ?? []) as ReadonlyArray<RawDerivedBalancesRow>;
    return mapDerivedBalancesRow(rows[0]);
  }

  async getLedgerAccountBalance(accountId: LedgerAccountId): Promise<number> {
    // `app.account_balance` is not PostgREST-exposed; sum the RLS-visible ledger
    // entries for the account instead. RLS bounds visibility to the owner, so a
    // caller only ever sums entries they are entitled to see.
    const { data, error } = await this.client
      .from("ledger_entries")
      .select("amount_centavos")
      .eq("account_id", accountId);
    assertNoError("getLedgerAccountBalance", error);
    const rows = (data ?? []) as ReadonlyArray<{ amount_centavos: number | string }>;
    return rows.reduce((sum, r) => sum + toNumber(r.amount_centavos), 0);
  }
}

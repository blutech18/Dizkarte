import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { paginate, type AdminCapability, type Paginated } from "@dizkarte/domain";
import { createSupabaseServerClient } from "../supabase-server";
import {
  buildDisplayNameMap,
  classifyReconciliation,
  derivePaymentIntentStatus,
  displayNameFor,
  pageRange,
  toLedgerTransactionType,
  toPayloadHashPreview,
  toProviderEventStatus,
  toProviderReferenceLabel,
  toRefundStatus,
  toWithdrawalStatus,
  type RawProfileNameRow,
} from "./supabase-mappers";
import {
  PROVIDER_UNAVAILABLE,
  type AdminRepository,
  type AuditLogRow,
  type BookingDetail,
  type BookingRow,
  type CaseDetailAccess,
  type CaseHistoryEvent,
  type CategoryDetail,
  type CategoryHistoryEvent,
  type CategoryRow,
  type DashboardSnapshot,
  type DisputeDetail,
  type DisputeRow,
  type DisputeStatus,
  type EvidenceMetadata,
  type FinanceProviderAvailability,
  type FinanceSummary,
  type PageInput,
  type PaymentEventRow,
  type PaymentIntentDetail,
  type PaymentIntentRow,
  type PaymentIntentStatus,
  type ProviderEventRow,
  type ReconciliationRow,
  type ReconciliationStatus,
  type ReconciliationSummary,
  type ReportDetail,
  type ReportRow,
  type ReportStatus,
  type TaskRow,
  type TaskerApplicationDetail,
  type TaskerApplicationRow,
  type TicketDetail,
  type TicketRow,
  type TicketStatus,
  type UserDetail,
  type UserRow,
  type VerificationCaseDetail,
  type VerificationCaseRow,
  type WithdrawalRow,
} from "./types";

/**
 * Real Supabase-backed Admin repository.
 *
 * Security posture (this is the whole point of the adapter):
 *  - Every request uses the signed-in Admin's own JWT through the cookie-backed
 *    `@supabase/ssr` client and the publishable anon key. The service-role key
 *    is never used here, so RLS is always the row gate and an Admin can only
 *    read what policy allows.
 *  - Ordinary triage reads hit capability-scoped base tables and the
 *    `admin_*_queue` views.
 *  - Sensitive detail (case narrative, evidence, ID documents) is NOT readable
 *    from a base table by any Admin. Those go through the audited SECURITY
 *    DEFINER `admin_read_*` RPCs, which require the caller to be the assigned
 *    Admin and write exactly one audit row per access.
 *  - Every mutation calls a privileged RPC that re-checks capability, requires a
 *    bounded reason plus idempotency key, and records an immutable audit trail.
 *    Nothing in this file writes a base table directly.
 *
 * Errors from Postgres are translated to `{ ok: false, message }` with the
 * database's own message class (FORBIDDEN / NOT_FOUND / CONFLICT / VALIDATION_
 * ERROR / INVALID_STATE), so the console never invents a success it did not get.
 */

/** Reasons are required by the RPCs; the console always supplies one. */
const MISSING_REASON = "A reason is required for this action.";

type MutationResult = { ok: boolean; message?: string; code?: string };

type RawCountResult = { readonly count: number | null; readonly error: { message: string } | null };

function friendlyError(message: string): string {
  // The RPCs raise 'CLASS: human readable detail'. Surface the detail only.
  const separator = message.indexOf(": ");
  const detail = separator > 0 ? message.slice(separator + 2) : message;
  return detail.trim() || "The request could not be completed.";
}

function countOf(result: RawCountResult): number {
  return result.error ? 0 : (result.count ?? 0);
}

export class SupabaseAdminRepository implements AdminRepository {
  public readonly synthetic = false;

  private client: SupabaseClient | null = null;

  /**
   * The Supabase client is created lazily and cached per repository instance
   * (which is per request) because `cookies()` may only be read during a
   * request scope.
   */
  private async db(): Promise<SupabaseClient> {
    this.client ??= await createSupabaseServerClient();
    return this.client;
  }

  /** Resolve display names for a set of user ids in one round trip. */
  private async displayNames(
    userIds: ReadonlyArray<string | null | undefined>,
  ): Promise<ReadonlyMap<string, string>> {
    const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();
    const db = await this.db();
    const { data } = await db
      .from("profiles")
      .select("id,display_name,account_status,created_at")
      .in("id", unique);
    return buildDisplayNameMap((data ?? []) as ReadonlyArray<RawProfileNameRow>);
  }

  private async call(fn: string, args: Record<string, unknown>): Promise<MutationResult> {
    const db = await this.db();
    const { error } = await db.rpc(fn, args);
    if (error) return { ok: false, message: friendlyError(error.message) };
    return { ok: true };
  }

  // =========================================================================
  // Dashboard
  // =========================================================================

  /**
   * Counts are read with `head: true` so only the count crosses the wire. Each
   * source is RLS-scoped, and a capability the Admin lacks simply yields zero
   * rather than failing the whole dashboard.
   */
  async getDashboardSnapshot(): Promise<DashboardSnapshot> {
    const db = await this.db();
    const head = { count: "exact" as const, head: true };

    const [verif, apps, reports, disputes, tickets, quarantined, withdrawals, attention] =
      await Promise.all([
      db
        .from("admin_verification_queue")
        .select("id", head)
        .in("status", ["SUBMITTED", "IN_REVIEW"]),
      db
        .from("tasker_applications")
        .select("id", head)
        .in("status", ["SUBMITTED", "IN_REVIEW"]),
      db.from("admin_report_queue").select("id", head).eq("status", "OPEN"),
      db.from("admin_dispute_queue").select("id", head).in("status", ["OPEN", "UNDER_REVIEW"]),
      db.from("admin_ticket_queue").select("id", head).in("status", ["OPEN", "PENDING"]),
      db.from("provider_events").select("id", head).eq("processing_status", "QUARANTINED"),
      db.from("withdrawals").select("id", head).in("status", ["REQUESTED", "RESERVED"]),
      db.from("bookings").select("id", head).in("status", ["DISPUTED", "PAYMENT_FAILED"]),
    ]);

    const finance = await this.getFinanceSummary();
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { data: todayFees } = await db
      .from("ledger_transactions")
      .select("id")
      .eq("type", "FEE_CHARGE")
      .gte("created_at", startOfDay.toISOString());
    const revenueTodayCentavos = await this.sumEntriesForTransactions(
      ((todayFees ?? []) as ReadonlyArray<{ id: string }>).map((row) => row.id),
      "PLATFORM_FEE",
    );

    return {
      pendingVerificationCount: countOf(verif),
      pendingTaskerApplicationCount: countOf(apps),
      openReportCount: countOf(reports),
      openDisputeCount: countOf(disputes),
      openTicketCount: countOf(tickets),
      quarantinedPaymentEventCount: countOf(quarantined),
      pendingWithdrawalCount: countOf(withdrawals),
      attentionBookingCount: countOf(attention),
      revenueTodayCentavos,
      netLedgerBalanceCentavos: finance.ledgerBalanceCentavos,
    };
  }

  /** Sum ledger entry amounts for the given transactions, optionally by account type. */
  private async sumEntriesForTransactions(
    transactionIds: ReadonlyArray<string>,
    accountType?: string,
  ): Promise<number> {
    if (transactionIds.length === 0) return 0;
    const db = await this.db();
    const { data } = await db
      .from("ledger_entries")
      .select("amount_centavos,account_id,transaction_id")
      .in("transaction_id", transactionIds);
    const entries = (data ?? []) as ReadonlyArray<{
      amount_centavos: number;
      account_id: string;
    }>;
    if (!accountType) {
      return entries.reduce((total, entry) => total + Number(entry.amount_centavos), 0);
    }
    const accountIds = [...new Set(entries.map((entry) => entry.account_id))];
    if (accountIds.length === 0) return 0;
    const { data: accounts } = await db
      .from("ledger_accounts")
      .select("id,account_type")
      .in("id", accountIds)
      .eq("account_type", accountType);
    const matching = new Set(
      ((accounts ?? []) as ReadonlyArray<{ id: string }>).map((account) => account.id),
    );
    return entries
      .filter((entry) => matching.has(entry.account_id))
      .reduce((total, entry) => total + Number(entry.amount_centavos), 0);
  }

  // =========================================================================
  // Identity verification
  // =========================================================================

  async listVerificationCases(
    input: PageInput & { status?: string },
  ): Promise<Paginated<VerificationCaseRow>> {
    const db = await this.db();
    const { from, to } = pageRange(input.page, input.pageSize);
    let query = db
      .from("admin_verification_queue")
      .select("id,user_id,status,version,assigned_admin_id,submitted_at,created_at", {
        count: "exact",
      })
      // DRAFT cases have not been submitted for review, so they are not queue work.
      .neq("status", "DRAFT");
    if (input.status) query = query.eq("status", input.status);
    const { data, count, error } = await query
      .order("submitted_at", { ascending: true, nullsFirst: false })
      .range(from, to);
    if (error) return paginate<VerificationCaseRow>([], input.page, input.pageSize, 0);

    const rows = (data ?? []) as ReadonlyArray<{
      id: string;
      user_id: string;
      status: string;
      submitted_at: string | null;
      created_at: string;
    }>;
    const names = await this.displayNames(rows.map((row) => row.user_id));
    const items = rows.map((row) => ({
      id: row.id,
      userDisplayName: displayNameFor(names, row.user_id),
      status: row.status as VerificationCaseRow["status"],
      submittedAt: row.submitted_at ?? row.created_at,
      // Document rows are self-only in RLS; the count is revealed by the
      // audited detail read, not the queue list.
      documentCount: 0,
    }));
    return paginate(items, input.page, input.pageSize, count ?? items.length);
  }

  /**
   * Full verification detail. `admin_read_verification_case` is an audited
   * SECURITY DEFINER read that requires the caller to be the assigned Admin, so
   * an unassigned Admin correctly receives no documents.
   */
  async getVerificationCase(id: string): Promise<VerificationCaseDetail | null> {
    const db = await this.db();
    const { data: queueData } = await db
      .from("admin_verification_queue")
      .select("id,user_id,status,submitted_at,created_at,assigned_admin_id")
      .eq("id", id)
      .maybeSingle();
    const queue = queueData as {
      id: string;
      user_id: string;
      status: string;
      submitted_at: string | null;
      created_at: string;
      assigned_admin_id: string | null;
    } | null;
    if (!queue) return null;

    const names = await this.displayNames([queue.user_id]);
    const { data: docsData } = await db.rpc("admin_read_verification_case", {
      p_case_id: id,
      p_reason: "Admin console verification detail review.",
      p_idempotency_key: `verif_read_${id}`,
    });
    const documents = (docsData ?? []) as ReadonlyArray<{ kind: string; mime_type: string }>;

    return {
      id: queue.id,
      userId: queue.user_id,
      userDisplayName: displayNameFor(names, queue.user_id),
      status: queue.status as VerificationCaseRow["status"],
      submittedAt: queue.submitted_at ?? queue.created_at,
      documentCount: documents.length,
      // Decision history is subject-only in RLS and is not exposed to the
      // console; the audit log is the Admin-side record of decisions.
      history: [],
      documents: documents.map((doc) => ({
        kind: doc.kind,
        // Never a storage path or a signed URL rendered inline: object bytes
        // require admin_authorize_object_read plus a short-lived service-role
        // signed URL, requested separately and deliberately.
        signedUrlPreview: `${doc.kind} (${doc.mime_type}) — authorized on request`,
      })),
    };
  }

  async decideVerificationCase(input: {
    caseId: string;
    decision: "APPROVED" | "REJECTED" | "RESUBMISSION_REQUIRED";
    reason: string;
    actor: string;
  }): Promise<MutationResult> {
    if (!input.reason.trim()) return { ok: false, message: MISSING_REASON };
    return this.call("decide_verification", {
      p_case_id: input.caseId,
      p_decision: input.decision,
      p_reason: input.reason,
      p_idempotency_key: `verif_${input.caseId}_${input.decision}`,
    });
  }

  // =========================================================================
  // Tasker applications
  // =========================================================================

  async listTaskerApplications(
    input: PageInput & { status?: string },
  ): Promise<Paginated<TaskerApplicationRow>> {
    const db = await this.db();
    const { from, to } = pageRange(input.page, input.pageSize);
    let query = db
      .from("tasker_applications")
      .select("id,user_id,status,submitted_at,created_at", { count: "exact" })
      .neq("status", "DRAFT");
    if (input.status) query = query.eq("status", input.status);
    const { data, count, error } = await query
      .order("submitted_at", { ascending: true, nullsFirst: false })
      .range(from, to);
    if (error) return paginate<TaskerApplicationRow>([], input.page, input.pageSize, 0);

    const rows = (data ?? []) as ReadonlyArray<{
      id: string;
      user_id: string;
      status: string;
      submitted_at: string | null;
      created_at: string;
    }>;
    const names = await this.displayNames(rows.map((row) => row.user_id));
    const specialties = await this.specialtiesFor(rows.map((row) => row.user_id));

    const items = rows.map((row) => ({
      id: row.id,
      userDisplayName: displayNameFor(names, row.user_id),
      status: row.status as TaskerApplicationRow["status"],
      specialties: specialties.get(row.user_id) ?? [],
      submittedAt: row.submitted_at ?? row.created_at,
    }));
    return paginate(items, input.page, input.pageSize, count ?? items.length);
  }

  private async specialtiesFor(
    userIds: ReadonlyArray<string>,
  ): Promise<ReadonlyMap<string, ReadonlyArray<string>>> {
    const unique = [...new Set(userIds)];
    const map = new Map<string, ReadonlyArray<string>>();
    if (unique.length === 0) return map;
    const db = await this.db();
    const { data } = await db
      .from("tasker_specialties")
      .select("user_id,specialty_id")
      .in("user_id", unique);
    const links = (data ?? []) as ReadonlyArray<{ user_id: string; specialty_id: string }>;
    if (links.length === 0) return map;

    const { data: specialtyData } = await db
      .from("specialties")
      .select("id,name")
      .in("id", [...new Set(links.map((link) => link.specialty_id))]);
    const nameById = new Map(
      ((specialtyData ?? []) as ReadonlyArray<{ id: string; name: string }>).map((row) => [
        row.id,
        row.name,
      ]),
    );
    for (const link of links) {
      const name = nameById.get(link.specialty_id);
      if (!name) continue;
      map.set(link.user_id, [...(map.get(link.user_id) ?? []), name]);
    }
    return map;
  }

  async getTaskerApplication(id: string): Promise<TaskerApplicationDetail | null> {
    const db = await this.db();
    const { data } = await db
      .from("tasker_applications")
      .select(
        "id,user_id,status,bio,experience,payout_provider,payout_reference,submitted_at,created_at",
      )
      .eq("id", id)
      .maybeSingle();
    const row = data as {
      id: string;
      user_id: string;
      status: string;
      bio: string;
      experience: string;
      payout_provider: string | null;
      payout_reference: string | null;
      submitted_at: string | null;
      created_at: string;
    } | null;
    if (!row) return null;

    const [names, specialties] = await Promise.all([
      this.displayNames([row.user_id]),
      this.specialtiesFor([row.user_id]),
    ]);
    const { data: areasData } = await db
      .from("service_areas")
      .select("city_code,barangay_code")
      .eq("user_id", row.user_id);
    const areas = (areasData ?? []) as ReadonlyArray<{
      city_code: string;
      barangay_code: string | null;
    }>;
    const { count: portfolioCount } = await db
      .from("portfolio_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", row.user_id);

    return {
      id: row.id,
      userDisplayName: displayNameFor(names, row.user_id),
      status: row.status as TaskerApplicationRow["status"],
      specialties: specialties.get(row.user_id) ?? [],
      submittedAt: row.submitted_at ?? row.created_at,
      bio: row.bio,
      experience: row.experience,
      serviceAreas: areas.map((area) =>
        area.barangay_code ? `${area.city_code}/${area.barangay_code}` : area.city_code,
      ),
      portfolioCount: portfolioCount ?? 0,
      // Deliberately a boundary label, never the payout reference itself.
      payoutTokenBoundaryLabel: row.payout_provider
        ? `${row.payout_provider} token held by provider — not readable in the console`
        : "No payout method on file",
    };
  }

  async decideTaskerApplication(input: {
    applicationId: string;
    decision: "APPROVED" | "REJECTED" | "RESUBMISSION_REQUIRED" | "SUSPENDED";
    reason: string;
    actor: string;
  }): Promise<MutationResult> {
    if (!input.reason.trim()) return { ok: false, message: MISSING_REASON };
    return this.call("decide_tasker_application", {
      p_application_id: input.applicationId,
      p_decision: input.decision,
      p_reason: input.reason,
      p_idempotency_key: `taskerapp_${input.applicationId}_${input.decision}`,
    });
  }

  // =========================================================================
  // Users and tasks
  // =========================================================================

  async listUsers(input: PageInput & { query?: string }): Promise<Paginated<UserRow>> {
    const db = await this.db();
    const { from, to } = pageRange(input.page, input.pageSize);
    let query = db
      .from("profiles")
      .select("id,display_name,account_status,created_at", { count: "exact" });
    const search = input.query?.trim();
    if (search) {
      // Only the display name is searchable: email lives in auth.users and is
      // not exposed to the console.
      query = query.ilike("display_name", `%${search}%`);
    }
    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) return paginate<UserRow>([], input.page, input.pageSize, 0);

    const rows = (data ?? []) as ReadonlyArray<RawProfileNameRow>;
    const verified = await this.verifiedIdentitySet(rows.map((row) => row.id));
    const items = rows.map((row) => ({
      id: row.id,
      displayName: row.display_name?.trim() || `User ${row.id.slice(0, 8)}`,
      // auth.users is not readable with the anon key, so no email is surfaced.
      email: "(not exposed)",
      accountStatus: (row.account_status ?? "deactivated") as UserRow["accountStatus"],
      identityVerified: verified.has(row.id),
      createdAt: row.created_at ?? new Date(0).toISOString(),
    }));
    return paginate(items, input.page, input.pageSize, count ?? items.length);
  }

  /**
   * Users whose identity verification is APPROVED.
   *
   * Read from `admin_verification_queue`, not `public_tasker_profiles`: that view
   * only contains rows for users who already have a Tasker profile, so using it
   * reported every verified Client and Admin as unverified. The queue view is the
   * only Admin-visible source of another user's verification status, since
   * `verification_cases` itself is self-read only under 0013.
   */
  private async verifiedIdentitySet(userIds: ReadonlyArray<string>): Promise<ReadonlySet<string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Set();
    const db = await this.db();
    const { data } = await db
      .from("admin_verification_queue")
      .select("user_id,status")
      .in("user_id", unique)
      .eq("status", "APPROVED");
    const rows = (data ?? []) as ReadonlyArray<{ user_id: string }>;
    return new Set(rows.map((row) => row.user_id));
  }

  /** Latest verification status per user, for the detail page. */
  private async verificationStatusMap(
    userIds: ReadonlyArray<string>,
  ): Promise<ReadonlyMap<string, string>> {
    const unique = [...new Set(userIds)];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const db = await this.db();
    const { data } = await db
      .from("admin_verification_queue")
      .select("user_id,status,created_at")
      .in("user_id", unique)
      .order("created_at", { ascending: true });
    for (const row of (data ?? []) as ReadonlyArray<{ user_id: string; status: string }>) {
      // Ordered ascending, so the last write per user is the newest case.
      map.set(row.user_id, row.status);
    }
    return map;
  }

  /**
   * Consolidated user record. Each source is independently capability-scoped, so
   * a Support Admin sees exactly what policy allows and nothing is assembled
   * through a privileged escalation.
   */
  async getUser(userId: string): Promise<UserDetail | null> {
    const db = await this.db();
    const { data } = await db
      .from("profiles")
      .select("id,display_name,account_status,created_at,language,city_code")
      .eq("id", userId)
      .maybeSingle();
    const row = data as {
      id: string;
      display_name: string | null;
      account_status: string | null;
      created_at: string | null;
      language: string | null;
      city_code: string | null;
    } | null;
    if (!row) return null;

    const [capsRes, verification, appRes, taskCount, asClient, asTasker, moderation] =
      await Promise.all([
        db
          .from("user_capabilities")
          .select("capability,granted_at,revoked_at")
          .eq("user_id", userId)
          .order("granted_at", { ascending: true }),
        this.verificationStatusMap([userId]),
        db
          .from("tasker_applications")
          .select("status,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db.from("tasks").select("id", { count: "exact", head: true }).eq("client_id", userId),
        db.from("bookings").select("id", { count: "exact", head: true }).eq("client_id", userId),
        db.from("bookings").select("id", { count: "exact", head: true }).eq("tasker_id", userId),
        db
          .from("moderation_actions")
          .select("id,action,reason,admin_id,capability,created_at")
          .eq("resource_type", "user")
          .eq("resource_id", userId)
          .order("created_at", { ascending: false }),
      ]);

    const moderationRows = (moderation.data ?? []) as ReadonlyArray<{
      id: string;
      action: string;
      reason: string;
      admin_id: string;
      capability: string;
      created_at: string;
    }>;
    const actorNames = await this.displayNames(moderationRows.map((entry) => entry.admin_id));

    const verified = verification.get(userId) === "APPROVED";
    return {
      id: row.id,
      displayName: row.display_name?.trim() || `User ${row.id.slice(0, 8)}`,
      // auth.users is not readable with the anon key, so no email is surfaced.
      email: "(not exposed)",
      accountStatus: (row.account_status ?? "deactivated") as UserRow["accountStatus"],
      identityVerified: verified,
      createdAt: row.created_at ?? new Date(0).toISOString(),
      language: row.language ?? "en",
      cityCode: row.city_code,
      capabilities: (
        (capsRes.data ?? []) as ReadonlyArray<{
          capability: string;
          granted_at: string;
          revoked_at: string | null;
        }>
      ).map((grant) => ({
        capability: grant.capability,
        grantedAt: grant.granted_at,
        revokedAt: grant.revoked_at,
      })),
      verificationStatus: verification.get(userId) ?? null,
      taskerApplicationStatus: (appRes.data as { status: string } | null)?.status ?? null,
      taskCount: taskCount.count ?? 0,
      bookingCountAsClient: asClient.count ?? 0,
      bookingCountAsTasker: asTasker.count ?? 0,
      moderationHistory: moderationRows.map((entry) => ({
        id: entry.id,
        action: entry.action,
        reason: entry.reason,
        actor: displayNameFor(actorNames, entry.admin_id),
        capability: entry.capability as AdminCapability,
        at: entry.created_at,
      })),
    };
  }

  async setUserAccountStatus(input: {
    userId: string;
    status: "active" | "suspended" | "banned";
    reason: string;
    actor: string;
  }): Promise<MutationResult> {
    if (!input.reason.trim()) return { ok: false, message: MISSING_REASON };
    return this.call("admin_set_account_status", {
      p_user_id: input.userId,
      p_status: input.status,
      p_reason: input.reason,
      p_idempotency_key: `acct_${input.userId}_${input.status}_${Date.now()}`,
    });
  }

  async listTasks(
    input: PageInput & {
      status?: string;
      query?: string;
      categoryId?: string;
      cityCode?: string;
    },
  ): Promise<Paginated<TaskRow>> {
    const db = await this.db();
    const { from, to } = pageRange(input.page, input.pageSize);
    let query = db
      .from("tasks")
      .select("id,title,status,budget_centavos,created_at,category_id", { count: "exact" });
    if (input.status) query = query.eq("status", input.status);
    if (input.categoryId) query = query.eq("category_id", input.categoryId);
    const keyword = input.query?.trim();
    if (keyword) {
      // Escape PostgREST's `or` filter separators so a crafted search term
      // cannot inject additional filter clauses.
      const safe = keyword.replace(/[,().*\\]/g, " ").trim();
      if (safe.length > 0) {
        query = query.or(`title.ilike.*${safe}*,description.ilike.*${safe}*`);
      }
    }
    if (input.cityCode) {
      // City lives on the related public-location row, so the task ids are
      // resolved first rather than relying on an implicit embedded filter.
      const { data: locData } = await db
        .from("task_public_locations")
        .select("task_id")
        .eq("city_code", input.cityCode);
      const taskIds = ((locData ?? []) as ReadonlyArray<{ task_id: string }>).map(
        (row) => row.task_id,
      );
      if (taskIds.length === 0) return paginate<TaskRow>([], input.page, input.pageSize, 0);
      query = query.in("id", taskIds);
    }
    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) return paginate<TaskRow>([], input.page, input.pageSize, 0);

    const rows = (data ?? []) as ReadonlyArray<{
      id: string;
      title: string;
      status: string;
      budget_centavos: number;
      created_at: string;
      category_id: string;
    }>;
    const taskIds = rows.map((row) => row.id);
    const [flagged, categorySlugs, cityCodes] = await Promise.all([
      this.flaggedTaskSet(taskIds),
      this.categorySlugs(rows.map((row) => row.category_id)),
      this.taskCityCodes(taskIds),
    ]);
    const items = rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      budgetCentavos: Number(row.budget_centavos),
      cityCode: cityCodes.get(row.id) ?? "",
      categorySlug: categorySlugs.get(row.category_id) ?? "",
      flagged: flagged.has(row.id),
      createdAt: row.created_at,
    }));
    return paginate(items, input.page, input.pageSize, count ?? items.length);
  }

  private async categorySlugs(
    categoryIds: ReadonlyArray<string>,
  ): Promise<ReadonlyMap<string, string>> {
    const unique = [...new Set(categoryIds)];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const db = await this.db();
    const { data } = await db.from("categories").select("id,slug").in("id", unique);
    for (const row of (data ?? []) as ReadonlyArray<{ id: string; slug: string }>) {
      map.set(row.id, row.slug);
    }
    return map;
  }

  /** Public (approximate) locality only — the exact address is never read here. */
  private async taskCityCodes(taskIds: ReadonlyArray<string>): Promise<ReadonlyMap<string, string>> {
    const unique = [...new Set(taskIds)];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const db = await this.db();
    const { data } = await db
      .from("task_public_locations")
      .select("task_id,city_code")
      .in("task_id", unique);
    for (const row of (data ?? []) as ReadonlyArray<{ task_id: string; city_code: string }>) {
      map.set(row.task_id, row.city_code);
    }
    return map;
  }

  /** A task is flagged when an open abuse report names it. */
  private async flaggedTaskSet(taskIds: ReadonlyArray<string>): Promise<ReadonlySet<string>> {
    const unique = [...new Set(taskIds)];
    if (unique.length === 0) return new Set();
    const db = await this.db();
    const { data } = await db
      .from("admin_report_queue")
      .select("resource_id,resource_type,status")
      .eq("resource_type", "task")
      .in("resource_id", unique)
      .in("status", ["OPEN", "TRIAGED"]);
    const rows = (data ?? []) as ReadonlyArray<{ resource_id: string }>;
    return new Set(rows.map((row) => row.resource_id));
  }

  async moderateTask(input: {
    taskId: string;
    action: "remove" | "restore";
    reason: string;
    actor: string;
  }): Promise<MutationResult> {
    if (!input.reason.trim()) return { ok: false, message: MISSING_REASON };
    return this.call("admin_moderate_task", {
      p_task_id: input.taskId,
      p_action: input.action,
      p_reason: input.reason,
      p_idempotency_key: `task_${input.taskId}_${input.action}_${Date.now()}`,
    });
  }

  // =========================================================================
  // Cases: reports, disputes, tickets
  // =========================================================================

  async listReports(input: PageInput & { status?: string }): Promise<Paginated<ReportRow>> {
    const db = await this.db();
    const { from, to } = pageRange(input.page, input.pageSize);
    let query = db
      .from("admin_report_queue")
      .select("id,resource_type,resource_id,category,status,assignee_id,created_at", {
        count: "exact",
      });
    if (input.status) query = query.eq("status", input.status);
    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) return paginate<ReportRow>([], input.page, input.pageSize, 0);

    const rows = (data ?? []) as ReadonlyArray<{
      id: string;
      resource_type: string;
      category: string;
      status: string;
      assignee_id: string | null;
      created_at: string;
    }>;
    const names = await this.displayNames(rows.map((row) => row.assignee_id));
    const items = rows.map((row) => ({
      id: row.id,
      resourceType: row.resource_type,
      category: row.category,
      status: row.status as ReportStatus,
      // The reporter's identity is part of the protected narrative surface and
      // is not exposed in the queue.
      reporterDisplayName: "(protected)",
      createdAt: row.created_at,
      assignee: row.assignee_id ? displayNameFor(names, row.assignee_id) : null,
    }));
    return paginate(items, input.page, input.pageSize, count ?? items.length);
  }

  async listDisputes(input: PageInput & { status?: string }): Promise<Paginated<DisputeRow>> {
    const db = await this.db();
    const { from, to } = pageRange(input.page, input.pageSize);
    let query = db
      .from("admin_dispute_queue")
      .select("id,booking_id,status,assignee_id,created_at", { count: "exact" });
    if (input.status) query = query.eq("status", input.status);
    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) return paginate<DisputeRow>([], input.page, input.pageSize, 0);

    const rows = (data ?? []) as ReadonlyArray<{
      id: string;
      booking_id: string;
      status: string;
      assignee_id: string | null;
      created_at: string;
    }>;
    const [names, amounts] = await Promise.all([
      this.displayNames(rows.map((row) => row.assignee_id)),
      this.bookingAmounts(rows.map((row) => row.booking_id)),
    ]);
    const items = rows.map((row) => ({
      id: row.id,
      bookingId: row.booking_id,
      status: row.status as DisputeStatus,
      amountCentavos: amounts.get(row.booking_id) ?? 0,
      openedAt: row.created_at,
      assignee: row.assignee_id ? displayNameFor(names, row.assignee_id) : null,
    }));
    return paginate(items, input.page, input.pageSize, count ?? items.length);
  }

  private async bookingAmounts(
    bookingIds: ReadonlyArray<string>,
  ): Promise<ReadonlyMap<string, number>> {
    const unique = [...new Set(bookingIds)];
    const map = new Map<string, number>();
    if (unique.length === 0) return map;
    const db = await this.db();
    const { data } = await db.from("bookings").select("id,agreed_centavos").in("id", unique);
    for (const row of (data ?? []) as ReadonlyArray<{ id: string; agreed_centavos: number }>) {
      map.set(row.id, Number(row.agreed_centavos));
    }
    return map;
  }

  async listTickets(input: PageInput & { status?: string }): Promise<Paginated<TicketRow>> {
    const db = await this.db();
    const { from, to } = pageRange(input.page, input.pageSize);
    let query = db
      .from("admin_ticket_queue")
      .select("id,user_id,category,status,assignee_id,updated_at", { count: "exact" });
    if (input.status) query = query.eq("status", input.status);
    const { data, count, error } = await query
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (error) return paginate<TicketRow>([], input.page, input.pageSize, 0);

    const rows = (data ?? []) as ReadonlyArray<{
      id: string;
      user_id: string;
      category: string;
      status: string;
      assignee_id: string | null;
      updated_at: string;
    }>;
    const names = await this.displayNames([
      ...rows.map((row) => row.assignee_id),
      ...rows.map((row) => row.user_id),
    ]);
    const items = rows.map((row) => ({
      id: row.id,
      // The subject line is part of the protected narrative; the queue shows
      // category plus requester and reveals the subject on the audited read.
      subject: `${row.category} request`,
      category: row.category,
      status: row.status as TicketStatus,
      requesterDisplayName: displayNameFor(names, row.user_id),
      updatedAt: row.updated_at,
      assignee: row.assignee_id ? displayNameFor(names, row.assignee_id) : null,
    }));
    return paginate(items, input.page, input.pageSize, count ?? items.length);
  }

  /**
   * Assignment-gated access decision, computed from the queue row before any
   * sensitive read is attempted. This mirrors what the database enforces, so
   * the UI can explain the restriction instead of showing an opaque failure.
   */
  private accessFor(assigneeId: string | null, actorId: string): CaseDetailAccess {
    if (assigneeId === null) return { restricted: true, reason: "unassigned" };
    if (assigneeId !== actorId) return { restricted: true, reason: "assigned-to-other" };
    return { restricted: false };
  }

  private async currentUserId(): Promise<string | null> {
    const db = await this.db();
    const { data } = await db.auth.getUser();
    return data.user?.id ?? null;
  }

  /** Audited evidence metadata for an assigned case. Never a storage path. */
  private async evidenceFor(
    resourceType: "report" | "dispute" | "ticket",
    resourceId: string,
  ): Promise<ReadonlyArray<EvidenceMetadata>> {
    const db = await this.db();
    const { data } = await db.rpc("admin_read_evidence", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_reason: `Admin console ${resourceType} evidence review.`,
      p_idempotency_key: `evidence_${resourceType}_${resourceId}`,
    });
    const rows = (data ?? []) as ReadonlyArray<{ id: string; storage_path: string }>;
    return rows.map((row, index) => ({
      kind: "attachment",
      // Only the final path segment is shown, never the full storage path.
      fileName: row.storage_path.split("/").pop() ?? `evidence-${index + 1}`,
      mimeType: "application/octet-stream",
      sizeBytes: 0,
      reviewState: "pending" as const,
    }));
  }

  /** Case history from the immutable moderation trail. */
  private async caseHistory(
    resourceType: "report" | "dispute" | "ticket" | "verification",
    resourceId: string,
  ): Promise<ReadonlyArray<CaseHistoryEvent>> {
    const db = await this.db();
    const { data } = await db
      .from("moderation_actions")
      .select("admin_id,capability,action,reason,created_at")
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .order("created_at", { ascending: true });
    const rows = (data ?? []) as ReadonlyArray<{
      admin_id: string;
      capability: string;
      action: string;
      reason: string;
      created_at: string;
    }>;
    const names = await this.displayNames(rows.map((row) => row.admin_id));
    return rows.map((row) => {
      const isAssignment = row.action === "assign";
      const toValue = row.action.includes(":") ? row.action.split(":")[1]! : row.action;
      return {
        type: isAssignment ? ("assignment" as const) : ("status" as const),
        fromValue: null,
        toValue: isAssignment ? displayNameFor(names, row.admin_id) : toValue,
        actor: displayNameFor(names, row.admin_id),
        capability: row.capability as AdminCapability,
        reason: row.reason,
        at: row.created_at,
      };
    });
  }

  async getReport(input: { reportId: string; actor: string }): Promise<ReportDetail | null> {
    const db = await this.db();
    const { data } = await db
      .from("admin_report_queue")
      .select("id,resource_type,resource_id,category,status,assignee_id,created_at")
      .eq("id", input.reportId)
      .maybeSingle();
    const queue = data as {
      id: string;
      resource_type: string;
      resource_id: string;
      category: string;
      status: string;
      assignee_id: string | null;
      created_at: string;
    } | null;
    if (!queue) return null;

    const actorId = await this.currentUserId();
    const access = this.accessFor(queue.assignee_id, actorId ?? "");
    const names = await this.displayNames([queue.assignee_id]);
    const history = await this.caseHistory("report", queue.id);

    let narrative: string | null = null;
    let evidence: ReadonlyArray<EvidenceMetadata> = [];
    if (!access.restricted) {
      const { data: caseData } = await db.rpc("admin_read_report_case", {
        p_report_id: input.reportId,
        p_reason: "Admin console report detail review.",
        p_idempotency_key: `report_read_${input.reportId}`,
      });
      const rows = (caseData ?? []) as ReadonlyArray<{ narrative: string }>;
      narrative = rows[0]?.narrative ?? null;
      evidence = await this.evidenceFor("report", input.reportId);
    }

    return {
      id: queue.id,
      resourceType: queue.resource_type,
      category: queue.category,
      status: queue.status as ReportStatus,
      reporterDisplayName: "(protected)",
      createdAt: queue.created_at,
      assignee: queue.assignee_id ? displayNameFor(names, queue.assignee_id) : null,
      access,
      caseSubject: {
        resourceType: queue.resource_type,
        resourceLabel: `${queue.resource_type} ${queue.resource_id.slice(0, 8)}`,
      },
      narrative,
      evidence,
      history,
    };
  }

  async getDispute(input: { disputeId: string; actor: string }): Promise<DisputeDetail | null> {
    const db = await this.db();
    const { data } = await db
      .from("admin_dispute_queue")
      .select("id,booking_id,status,assignee_id,created_at")
      .eq("id", input.disputeId)
      .maybeSingle();
    const queue = data as {
      id: string;
      booking_id: string;
      status: string;
      assignee_id: string | null;
      created_at: string;
    } | null;
    if (!queue) return null;

    const actorId = await this.currentUserId();
    const access = this.accessFor(queue.assignee_id, actorId ?? "");
    const [names, amounts, history] = await Promise.all([
      this.displayNames([queue.assignee_id]),
      this.bookingAmounts([queue.booking_id]),
      this.caseHistory("dispute", queue.id),
    ]);

    let narrative: string | null = null;
    let evidence: ReadonlyArray<EvidenceMetadata> = [];
    if (!access.restricted) {
      const { data: caseData } = await db.rpc("admin_read_dispute_case", {
        p_dispute_id: input.disputeId,
        p_reason: "Admin console dispute detail review.",
        p_idempotency_key: `dispute_read_${input.disputeId}`,
      });
      const rows = (caseData ?? []) as ReadonlyArray<{ reason: string }>;
      narrative = rows[0]?.reason ?? null;
      evidence = await this.evidenceFor("dispute", input.disputeId);
    }

    return {
      id: queue.id,
      bookingId: queue.booking_id,
      status: queue.status as DisputeStatus,
      amountCentavos: amounts.get(queue.booking_id) ?? 0,
      openedAt: queue.created_at,
      assignee: queue.assignee_id ? displayNameFor(names, queue.assignee_id) : null,
      access,
      caseSubject: {
        resourceType: "booking" as const,
        resourceLabel: `booking ${queue.booking_id.slice(0, 8)}`,
      },
      narrative,
      evidence,
      history,
    };
  }

  async getTicket(input: { ticketId: string; actor: string }): Promise<TicketDetail | null> {
    const db = await this.db();
    const { data } = await db
      .from("admin_ticket_queue")
      .select("id,user_id,category,status,assignee_id,updated_at")
      .eq("id", input.ticketId)
      .maybeSingle();
    const queue = data as {
      id: string;
      user_id: string;
      category: string;
      status: string;
      assignee_id: string | null;
      updated_at: string;
    } | null;
    if (!queue) return null;

    const actorId = await this.currentUserId();
    const access = this.accessFor(queue.assignee_id, actorId ?? "");
    const [names, history] = await Promise.all([
      this.displayNames([queue.assignee_id, queue.user_id]),
      this.caseHistory("ticket", queue.id),
    ]);

    let narrative: string | null = null;
    let subject = `${queue.category} request`;
    let evidence: ReadonlyArray<EvidenceMetadata> = [];
    if (!access.restricted) {
      const { data: caseData } = await db.rpc("admin_read_ticket_case", {
        p_ticket_id: input.ticketId,
        p_reason: "Admin console ticket detail review.",
        p_idempotency_key: `ticket_read_${input.ticketId}`,
      });
      const rows = (caseData ?? []) as ReadonlyArray<{ subject: string; narrative: string }>;
      narrative = rows[0]?.narrative ?? null;
      subject = rows[0]?.subject ?? subject;
      evidence = await this.evidenceFor("ticket", input.ticketId);
    }

    return {
      id: queue.id,
      subject,
      category: queue.category,
      status: queue.status as TicketStatus,
      requesterDisplayName: displayNameFor(names, queue.user_id),
      updatedAt: queue.updated_at,
      assignee: queue.assignee_id ? displayNameFor(names, queue.assignee_id) : null,
      access,
      caseSubject: {
        resourceType: "ticket",
        resourceLabel: `ticket ${queue.id.slice(0, 8)}`,
      },
      narrative,
      evidence,
      history,
    };
  }

  /**
   * Self-assignment only. The RPCs assign the case to the authenticated caller
   * and refuse to take a case away from another Admin, so a caller-chosen
   * assignee is neither accepted nor needed.
   */
  async assignCase(input: {
    resourceType: "report" | "dispute" | "ticket" | "verification";
    resourceId: string;
    assignee: string;
    actor: string;
    capability: AdminCapability | null;
    force?: boolean;
  }): Promise<MutationResult> {
    const fn = {
      report: "admin_assign_report",
      dispute: "admin_assign_dispute",
      ticket: "admin_assign_ticket",
      verification: "admin_assign_verification",
    }[input.resourceType];
    const idArg = {
      report: "p_report_id",
      dispute: "p_dispute_id",
      ticket: "p_ticket_id",
      verification: "p_case_id",
    }[input.resourceType];
    return this.call(fn, {
      [idArg]: input.resourceId,
      p_reason: `Assigned by ${input.actor} through the Admin console for triage.`,
      p_idempotency_key: `assign_${input.resourceType}_${input.resourceId}_${input.actor}`,
    });
  }

  async transitionCaseStatus(input: {
    resourceType: "report" | "dispute" | "ticket";
    resourceId: string;
    toStatus: string;
    reason: string;
    actor: string;
    capability: AdminCapability | null;
  }): Promise<MutationResult> {
    if (!input.reason.trim()) return { ok: false, message: MISSING_REASON };
    const fn = {
      report: "admin_transition_report",
      dispute: "admin_transition_dispute",
      ticket: "admin_transition_ticket",
    }[input.resourceType];
    const idArg = {
      report: "p_report_id",
      dispute: "p_dispute_id",
      ticket: "p_ticket_id",
    }[input.resourceType];
    return this.call(fn, {
      [idArg]: input.resourceId,
      p_to_status: input.toStatus,
      p_reason: input.reason,
      p_idempotency_key: `transition_${input.resourceType}_${input.resourceId}_${input.toStatus}`,
    });
  }

  // =========================================================================
  // Finance
  // =========================================================================

  /**
   * Live provider availability is a configuration fact, not a data read: no
   * approved payment/payout provider is configured, so provider-dependent
   * actions stay disabled with an explicit reason instead of appearing live.
   */
  getFinanceProviderAvailability(): FinanceProviderAvailability {
    return {
      paymentProviderAvailable: false,
      payoutProviderAvailable: false,
      reason:
        "No approved payment or payout provider is configured. Provider-dependent actions are disabled until credentials and the refund/payout policy are approved.",
    };
  }

  async listPaymentEvents(
    input: PageInput & { status?: string },
  ): Promise<Paginated<PaymentEventRow>> {
    const events = await this.listProviderEvents(input);
    return paginate(
      events.items.map((event) => ({
        id: event.id,
        bookingId: event.bookingId,
        type: event.type,
        amountCentavos: event.amountCentavos,
        status: event.status,
        receivedAt: event.receivedAt,
      })),
      events.page,
      events.pageSize,
      events.total,
    );
  }

  async listProviderEvents(
    input: PageInput & { status?: string },
  ): Promise<Paginated<ProviderEventRow>> {
    const db = await this.db();
    const { from, to } = pageRange(input.page, input.pageSize);
    let query = db
      .from("provider_events")
      .select(
        "id,provider,event_type,provider_reference,amount_centavos,processing_status,payload_hash,received_at",
        { count: "exact" },
      );
    if (input.status) query = query.eq("processing_status", input.status);
    const { data, count, error } = await query
      .order("received_at", { ascending: false })
      .range(from, to);
    if (error) return paginate<ProviderEventRow>([], input.page, input.pageSize, 0);

    const rows = (data ?? []) as ReadonlyArray<{
      id: string;
      provider: string;
      event_type: string;
      provider_reference: string | null;
      amount_centavos: number | null;
      processing_status: string;
      payload_hash: string;
      received_at: string;
    }>;
    const bookingByReference = await this.bookingIdsByProviderReference(
      rows.map((row) => row.provider_reference),
    );
    const items = rows.map((row) => ({
      id: row.id,
      bookingId: row.provider_reference
        ? (bookingByReference.get(row.provider_reference) ?? "")
        : "",
      type: row.event_type,
      amountCentavos: Number(row.amount_centavos ?? 0),
      status: toProviderEventStatus(row.processing_status),
      providerReferenceLabel: toProviderReferenceLabel(row.provider, row.provider_reference),
      payloadHashPreview: toPayloadHashPreview(row.payload_hash),
      receivedAt: row.received_at,
    }));
    return paginate(items, input.page, input.pageSize, count ?? items.length);
  }

  private async bookingIdsByProviderReference(
    references: ReadonlyArray<string | null>,
  ): Promise<ReadonlyMap<string, string>> {
    const unique = [...new Set(references.filter((ref): ref is string => Boolean(ref)))];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const db = await this.db();
    const { data } = await db
      .from("payment_intents")
      .select("booking_id,provider_reference")
      .in("provider_reference", unique);
    for (const row of (data ?? []) as ReadonlyArray<{
      booking_id: string;
      provider_reference: string | null;
    }>) {
      if (row.provider_reference) map.set(row.provider_reference, row.booking_id);
    }
    return map;
  }

  /**
   * Finance totals derived from the balanced append-only ledger, not from any
   * mutable balance column. Each figure is the signed sum of entries against the
   * account type that represents that stage of the money's life.
   */
  async getFinanceSummary(): Promise<FinanceSummary> {
    const db = await this.db();
    const [entriesRes, accountsRes, feeRes] = await Promise.all([
      db.from("ledger_entries").select("amount_centavos,account_id"),
      db.from("ledger_accounts").select("id,account_type"),
      db.from("app_settings").select("typed_value").eq("key", "platform_fee_bps").maybeSingle(),
    ]);

    const entries = (entriesRes.data ?? []) as ReadonlyArray<{
      amount_centavos: number;
      account_id: string;
    }>;
    const accounts = (accountsRes.data ?? []) as ReadonlyArray<{
      id: string;
      account_type: string;
    }>;
    const typeById = new Map(accounts.map((account) => [account.id, account.account_type]));

    const totalFor = (accountType: string): number =>
      entries
        .filter((entry) => typeById.get(entry.account_id) === accountType)
        .reduce((total, entry) => total + Number(entry.amount_centavos), 0);

    const feeRaw = (feeRes.data as { typed_value: unknown } | null)?.typed_value;
    const platformFeeBps = typeof feeRaw === "number" ? feeRaw : Number(feeRaw ?? 0) || 0;

    const protectedCentavos = totalFor("PROTECTED_HOLD");
    const capturedCentavos = -totalFor("CLIENT_FUNDING");
    const releasedCentavos = totalFor("TASKER_AVAILABLE");
    const refundedCentavos = totalFor("REFUND_CLEARING");
    const platformFeeCentavos = totalFor("PLATFORM_FEE");

    return {
      synthetic: false,
      protectedCentavos,
      capturedCentavos,
      releasedCentavos,
      refundedCentavos,
      platformFeeCentavos,
      platformFeeBps,
      // A correct double-entry ledger always sums to zero; a non-zero value here
      // is itself the signal that something needs reconciliation.
      ledgerBalanceCentavos: entries.reduce(
        (total, entry) => total + Number(entry.amount_centavos),
        0,
      ),
    };
  }

  async listPaymentIntents(
    input: PageInput & { status?: PaymentIntentStatus },
  ): Promise<Paginated<PaymentIntentRow>> {
    const db = await this.db();
    const { from, to } = pageRange(input.page, input.pageSize);
    const { data, count, error } = await db
      .from("payment_intents")
      .select("id,booking_id,amount_centavos,status,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) return paginate<PaymentIntentRow>([], input.page, input.pageSize, 0);

    const rows = (data ?? []) as ReadonlyArray<{
      id: string;
      booking_id: string;
      amount_centavos: number;
      status: string;
      created_at: string;
    }>;
    const [ledgerTypes, refunded, fees] = await Promise.all([
      this.ledgerTypesByBooking(rows.map((row) => row.booking_id)),
      this.succeededRefundIntentIds(rows.map((row) => row.id)),
      this.feeByBooking(rows.map((row) => row.booking_id)),
    ]);

    const all = rows.map((row) => ({
      id: row.id,
      bookingId: row.booking_id,
      status: derivePaymentIntentStatus({
        dbStatus: row.status,
        ledgerTypes: ledgerTypes.get(row.booking_id) ?? [],
        hasSucceededRefund: refunded.has(row.id),
      }),
      amountCentavos: Number(row.amount_centavos),
      platformFeeCentavos: fees.get(row.booking_id) ?? 0,
      createdAt: row.created_at,
    }));
    // The derived lifecycle label is not a stored column, so a status filter is
    // applied after derivation on the requested page.
    const items = input.status ? all.filter((row) => row.status === input.status) : all;
    return paginate(items, input.page, input.pageSize, count ?? items.length);
  }

  private async ledgerTypesByBooking(
    bookingIds: ReadonlyArray<string>,
  ): Promise<ReadonlyMap<string, ReadonlyArray<string>>> {
    const unique = [...new Set(bookingIds)];
    const map = new Map<string, ReadonlyArray<string>>();
    if (unique.length === 0) return map;
    const db = await this.db();
    const { data } = await db
      .from("ledger_transactions")
      .select("booking_id,type")
      .in("booking_id", unique);
    for (const row of (data ?? []) as ReadonlyArray<{ booking_id: string; type: string }>) {
      map.set(row.booking_id, [...(map.get(row.booking_id) ?? []), row.type]);
    }
    return map;
  }

  private async succeededRefundIntentIds(
    intentIds: ReadonlyArray<string>,
  ): Promise<ReadonlySet<string>> {
    const unique = [...new Set(intentIds)];
    if (unique.length === 0) return new Set();
    const db = await this.db();
    const { data } = await db
      .from("refunds")
      .select("payment_intent_id,status")
      .in("payment_intent_id", unique)
      .eq("status", "SUCCEEDED");
    return new Set(
      ((data ?? []) as ReadonlyArray<{ payment_intent_id: string }>).map(
        (row) => row.payment_intent_id,
      ),
    );
  }

  private async feeByBooking(
    bookingIds: ReadonlyArray<string>,
  ): Promise<ReadonlyMap<string, number>> {
    const unique = [...new Set(bookingIds)];
    const map = new Map<string, number>();
    if (unique.length === 0) return map;
    const db = await this.db();
    const { data: txData } = await db
      .from("ledger_transactions")
      .select("id,booking_id")
      .eq("type", "FEE_CHARGE")
      .in("booking_id", unique);
    const txRows = (txData ?? []) as ReadonlyArray<{ id: string; booking_id: string }>;
    if (txRows.length === 0) return map;

    const { data: accountData } = await db
      .from("ledger_accounts")
      .select("id")
      .eq("account_type", "PLATFORM_FEE");
    const feeAccounts = new Set(
      ((accountData ?? []) as ReadonlyArray<{ id: string }>).map((row) => row.id),
    );
    const { data: entryData } = await db
      .from("ledger_entries")
      .select("transaction_id,account_id,amount_centavos")
      .in(
        "transaction_id",
        txRows.map((row) => row.id),
      );
    const bookingByTx = new Map(txRows.map((row) => [row.id, row.booking_id]));
    for (const entry of (entryData ?? []) as ReadonlyArray<{
      transaction_id: string;
      account_id: string;
      amount_centavos: number;
    }>) {
      if (!feeAccounts.has(entry.account_id)) continue;
      const bookingId = bookingByTx.get(entry.transaction_id);
      if (!bookingId) continue;
      map.set(bookingId, (map.get(bookingId) ?? 0) + Number(entry.amount_centavos));
    }
    return map;
  }

  async getPaymentIntent(id: string): Promise<PaymentIntentDetail | null> {
    const db = await this.db();
    const { data } = await db
      .from("payment_intents")
      .select("id,booking_id,provider,provider_reference,amount_centavos,status,created_at")
      .eq("id", id)
      .maybeSingle();
    const intent = data as {
      id: string;
      booking_id: string;
      provider: string;
      provider_reference: string | null;
      amount_centavos: number;
      status: string;
      created_at: string;
    } | null;
    if (!intent) return null;

    const [ledgerTypes, refundRows, fees, providerEvents, transactions, history] =
      await Promise.all([
        this.ledgerTypesByBooking([intent.booking_id]),
        this.refundsFor(intent.id),
        this.feeByBooking([intent.booking_id]),
        this.providerEventsFor(intent.provider, intent.provider_reference, intent.booking_id),
        this.transactionIdsFor(intent.booking_id),
        this.caseHistory("dispute", intent.booking_id),
      ]);

    const hasSucceededRefund = refundRows.some((refund) => refund.status === "SUCCEEDED");
    const ledgerAmount = await this.sumEntriesForTransactions(
      transactions.filter((tx) => tx.type === "PAYMENT_CAPTURE").map((tx) => tx.id),
      "CLIENT_FUNDING",
    );
    const primaryEvent = providerEvents[0] ?? null;
    const { status: reconciliationStatus } = classifyReconciliation({
      paymentAmountCentavos: Number(intent.amount_centavos),
      providerEventAmountCentavos: primaryEvent ? primaryEvent.amountCentavos : null,
      providerEventStatus: primaryEvent ? primaryEvent.status : null,
      ledgerAmountCentavos: transactions.length > 0 ? Math.abs(ledgerAmount) : null,
    });

    return {
      id: intent.id,
      bookingId: intent.booking_id,
      status: derivePaymentIntentStatus({
        dbStatus: intent.status,
        ledgerTypes: ledgerTypes.get(intent.booking_id) ?? [],
        hasSucceededRefund,
      }),
      amountCentavos: Number(intent.amount_centavos),
      platformFeeCentavos: fees.get(intent.booking_id) ?? 0,
      createdAt: intent.created_at,
      refundSummary: {
        totalRefundedCentavos: refundRows
          .filter((refund) => refund.status === "SUCCEEDED")
          .reduce((total, refund) => total + refund.amountCentavos, 0),
        refundCount: refundRows.length,
      },
      refundHistory: refundRows,
      providerEvents,
      ledgerTransactionIds: transactions.map((tx) => tx.id),
      reconciliationStatus,
      history,
    };
  }

  private async refundsFor(paymentIntentId: string): Promise<
    ReadonlyArray<{
      id: string;
      amountCentavos: number;
      status: "REQUESTED" | "PROCESSING" | "SUCCEEDED" | "FAILED";
      reason: string | null;
      at: string;
    }>
  > {
    const db = await this.db();
    const { data } = await db
      .from("refunds")
      .select("id,amount_centavos,status,reason,created_at")
      .eq("payment_intent_id", paymentIntentId)
      .order("created_at", { ascending: false });
    return ((data ?? []) as ReadonlyArray<{
      id: string;
      amount_centavos: number;
      status: string;
      reason: string | null;
      created_at: string;
    }>).map((row) => ({
      id: row.id,
      amountCentavos: Number(row.amount_centavos),
      status: toRefundStatus(row.status),
      reason: row.reason,
      at: row.created_at,
    }));
  }

  private async providerEventsFor(
    provider: string,
    providerReference: string | null,
    bookingId: string,
  ): Promise<ReadonlyArray<ProviderEventRow>> {
    if (!providerReference) return [];
    const db = await this.db();
    const { data } = await db
      .from("provider_events")
      .select(
        "id,provider,event_type,provider_reference,amount_centavos,processing_status,payload_hash,received_at",
      )
      .eq("provider", provider)
      .eq("provider_reference", providerReference)
      .order("received_at", { ascending: false });
    return ((data ?? []) as ReadonlyArray<{
      id: string;
      provider: string;
      event_type: string;
      provider_reference: string | null;
      amount_centavos: number | null;
      processing_status: string;
      payload_hash: string;
      received_at: string;
    }>).map((row) => ({
      id: row.id,
      bookingId,
      type: row.event_type,
      amountCentavos: Number(row.amount_centavos ?? 0),
      status: toProviderEventStatus(row.processing_status),
      providerReferenceLabel: toProviderReferenceLabel(row.provider, row.provider_reference),
      payloadHashPreview: toPayloadHashPreview(row.payload_hash),
      receivedAt: row.received_at,
    }));
  }

  private async transactionIdsFor(
    bookingId: string,
  ): Promise<ReadonlyArray<{ id: string; type: string }>> {
    const db = await this.db();
    const { data } = await db
      .from("ledger_transactions")
      .select("id,type,created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true });
    return ((data ?? []) as ReadonlyArray<{ id: string; type: string }>).map((row) => ({
      id: row.id,
      type: toLedgerTransactionType(row.type),
    }));
  }

  async getPaymentIntentByBooking(bookingId: string): Promise<PaymentIntentRow | null> {
    const db = await this.db();
    const { data } = await db
      .from("payment_intents")
      .select("id,booking_id,amount_centavos,status,created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as {
      id: string;
      booking_id: string;
      amount_centavos: number;
      status: string;
      created_at: string;
    } | null;
    if (!row) return null;

    const [ledgerTypes, refunded, fees] = await Promise.all([
      this.ledgerTypesByBooking([row.booking_id]),
      this.succeededRefundIntentIds([row.id]),
      this.feeByBooking([row.booking_id]),
    ]);
    return {
      id: row.id,
      bookingId: row.booking_id,
      status: derivePaymentIntentStatus({
        dbStatus: row.status,
        ledgerTypes: ledgerTypes.get(row.booking_id) ?? [],
        hasSucceededRefund: refunded.has(row.id),
      }),
      amountCentavos: Number(row.amount_centavos),
      platformFeeCentavos: fees.get(row.booking_id) ?? 0,
      createdAt: row.created_at,
    };
  }

  /**
   * Refunds stay fail-closed. `admin_refund` exists, but with no approved
   * payment provider or refund policy there is nothing authoritative to settle
   * against, so the console refuses before any mutation instead of writing a
   * refund the provider will never honour.
   */
  async requestRefund(_input: {
    paymentIntentId: string;
    reason: string;
    actor: string;
    idempotencyKey: string;
  }): Promise<MutationResult> {
    return {
      ok: false,
      code: PROVIDER_UNAVAILABLE,
      message: this.getFinanceProviderAvailability().reason,
    };
  }

  /**
   * Freeze is a real privileged command: `admin_freeze` moves the booking to
   * DISPUTED and records the moderation trail without rewriting the ledger. It
   * takes a booking id, so the payment intent is resolved first.
   */
  async freezePaymentIntent(input: {
    paymentIntentId: string;
    reason: string;
    actor: string;
    capability: AdminCapability | null;
    idempotencyKey: string;
  }): Promise<MutationResult> {
    if (!input.reason.trim()) return { ok: false, message: MISSING_REASON };
    const db = await this.db();
    const { data } = await db
      .from("payment_intents")
      .select("booking_id")
      .eq("id", input.paymentIntentId)
      .maybeSingle();
    const bookingId = (data as { booking_id: string } | null)?.booking_id;
    if (!bookingId) return { ok: false, message: "Payment intent not found." };
    return this.call("admin_freeze", {
      p_booking_id: bookingId,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
    });
  }

  // =========================================================================
  // Reconciliation (derived — there is no reconciliation table)
  // =========================================================================

  private async reconciliationRows(): Promise<ReadonlyArray<ReconciliationRow>> {
    const db = await this.db();
    const { data } = await db
      .from("payment_intents")
      .select("id,booking_id,provider,provider_reference,amount_centavos,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    const intents = (data ?? []) as ReadonlyArray<{
      id: string;
      booking_id: string;
      provider: string;
      provider_reference: string | null;
      amount_centavos: number;
      created_at: string;
    }>;
    if (intents.length === 0) return [];

    const references = intents
      .map((intent) => intent.provider_reference)
      .filter((ref): ref is string => Boolean(ref));
    const [eventsRes, txRes] = await Promise.all([
      references.length > 0
        ? db
            .from("provider_events")
            .select("id,provider_reference,amount_centavos,processing_status")
            .in("provider_reference", references)
        : Promise.resolve({ data: [] }),
      db
        .from("ledger_transactions")
        .select("id,booking_id,type")
        .in(
          "booking_id",
          intents.map((intent) => intent.booking_id),
        ),
    ]);

    const eventByReference = new Map<
      string,
      { id: string; amount: number | null; status: string }
    >();
    for (const event of (eventsRes.data ?? []) as ReadonlyArray<{
      id: string;
      provider_reference: string | null;
      amount_centavos: number | null;
      processing_status: string;
    }>) {
      if (!event.provider_reference) continue;
      eventByReference.set(event.provider_reference, {
        id: event.id,
        amount: event.amount_centavos === null ? null : Number(event.amount_centavos),
        status: event.processing_status,
      });
    }

    const captureTxByBooking = new Map<string, string>();
    for (const tx of (txRes.data ?? []) as ReadonlyArray<{
      id: string;
      booking_id: string | null;
      type: string;
    }>) {
      if (tx.booking_id && tx.type === "PAYMENT_CAPTURE") {
        captureTxByBooking.set(tx.booking_id, tx.id);
      }
    }
    const captureIds = [...captureTxByBooking.values()];
    const ledgerByTx = await this.captureAmountsByTransaction(captureIds);

    const checkedAt = new Date().toISOString();
    return intents.map((intent) => {
      const event = intent.provider_reference
        ? (eventByReference.get(intent.provider_reference) ?? null)
        : null;
      const txId = captureTxByBooking.get(intent.booking_id) ?? null;
      const ledgerAmount = txId ? (ledgerByTx.get(txId) ?? null) : null;
      const paymentAmount = Number(intent.amount_centavos);
      const { status, differenceCentavos } = classifyReconciliation({
        paymentAmountCentavos: paymentAmount,
        providerEventAmountCentavos: event ? event.amount : null,
        providerEventStatus: event ? toProviderEventStatus(event.status) : null,
        ledgerAmountCentavos: ledgerAmount,
      });
      return {
        id: `rec_${intent.id}`,
        bookingId: intent.booking_id,
        paymentIntentId: intent.id,
        providerEventId: event?.id ?? null,
        ledgerTransactionId: txId,
        paymentAmountCentavos: paymentAmount,
        providerEventAmountCentavos: event ? event.amount : null,
        ledgerAmountCentavos: ledgerAmount,
        status,
        differenceCentavos,
        checkedAt,
      };
    });
  }

  private async captureAmountsByTransaction(
    transactionIds: ReadonlyArray<string>,
  ): Promise<ReadonlyMap<string, number>> {
    const map = new Map<string, number>();
    if (transactionIds.length === 0) return map;
    const db = await this.db();
    const [entriesRes, accountsRes] = await Promise.all([
      db
        .from("ledger_entries")
        .select("transaction_id,account_id,amount_centavos")
        .in("transaction_id", transactionIds),
      db.from("ledger_accounts").select("id,account_type").eq("account_type", "CLIENT_FUNDING"),
    ]);
    const funding = new Set(
      ((accountsRes.data ?? []) as ReadonlyArray<{ id: string }>).map((row) => row.id),
    );
    for (const entry of (entriesRes.data ?? []) as ReadonlyArray<{
      transaction_id: string;
      account_id: string;
      amount_centavos: number;
    }>) {
      if (!funding.has(entry.account_id)) continue;
      map.set(
        entry.transaction_id,
        (map.get(entry.transaction_id) ?? 0) + Math.abs(Number(entry.amount_centavos)),
      );
    }
    return map;
  }

  async listReconciliationRows(
    input: PageInput & { status?: ReconciliationStatus },
  ): Promise<Paginated<ReconciliationRow>> {
    const all = await this.reconciliationRows();
    const filtered = input.status ? all.filter((row) => row.status === input.status) : all;
    const { from, to } = pageRange(input.page, input.pageSize);
    return paginate(filtered.slice(from, to + 1), input.page, input.pageSize, filtered.length);
  }

  async getReconciliationSummary(): Promise<ReconciliationSummary> {
    const rows = await this.reconciliationRows();
    const count = (status: ReconciliationStatus): number =>
      rows.filter((row) => row.status === status).length;
    return {
      matched: count("MATCHED"),
      duplicate: count("DUPLICATE"),
      quarantined: count("QUARANTINED"),
      mismatch: count("MISMATCH"),
      unmatched: count("UNMATCHED"),
      total: rows.length,
    };
  }

  /**
   * Reconciliation is derived on every read from the authoritative payment,
   * provider-event, and ledger rows, so there is no stored classification to
   * recompute. The "re-run" therefore just recomputes and returns the current
   * summary — it makes no provider call and mutates nothing.
   */
  async rerunReconciliation(input: {
    reason: string;
    actor: string;
    capability: AdminCapability | null;
    idempotencyKey: string;
  }): Promise<{ ok: boolean; message?: string; summary?: ReconciliationSummary }> {
    if (!input.reason.trim()) return { ok: false, message: MISSING_REASON };
    const summary = await this.getReconciliationSummary();
    return { ok: true, summary };
  }

  // =========================================================================
  // Withdrawals
  // =========================================================================

  async listWithdrawals(input: PageInput & { status?: string }): Promise<Paginated<WithdrawalRow>> {
    const db = await this.db();
    const { from, to } = pageRange(input.page, input.pageSize);
    let query = db
      .from("withdrawals")
      .select("id,tasker_id,amount_centavos,status,created_at", { count: "exact" });
    if (input.status) query = query.eq("status", input.status);
    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) return paginate<WithdrawalRow>([], input.page, input.pageSize, 0);

    const rows = (data ?? []) as ReadonlyArray<{
      id: string;
      tasker_id: string;
      amount_centavos: number;
      status: string;
      created_at: string;
    }>;
    const names = await this.displayNames(rows.map((row) => row.tasker_id));
    const items = rows.map((row) => ({
      id: row.id,
      taskerDisplayName: displayNameFor(names, row.tasker_id),
      amountCentavos: Number(row.amount_centavos),
      status: toWithdrawalStatus(row.status),
      requestedAt: row.created_at,
    }));
    return paginate(items, input.page, input.pageSize, count ?? items.length);
  }

  /**
   * Payouts stay fail-closed: settlement is provider-authoritative
   * (`process_payout_result` is service-role only) and no approved payout
   * provider is configured, so the console never marks money as sent.
   */
  async approveWithdrawal(_input: {
    withdrawalId: string;
    reason: string;
    actor: string;
  }): Promise<MutationResult> {
    return {
      ok: false,
      code: PROVIDER_UNAVAILABLE,
      message: this.getFinanceProviderAvailability().reason,
    };
  }

  // =========================================================================
  // Service catalog
  // =========================================================================

  async listCategories(
    input: PageInput & { status?: "active" | "inactive" },
  ): Promise<Paginated<CategoryRow>> {
    const db = await this.db();
    const { from, to } = pageRange(input.page, input.pageSize);
    let query = db.from("categories").select("id,name,slug,active,sort_order", { count: "exact" });
    if (input.status === "active") query = query.eq("active", true);
    if (input.status === "inactive") query = query.eq("active", false);
    const { data, count, error } = await query
      .order("sort_order", { ascending: true })
      .range(from, to);
    if (error) return paginate<CategoryRow>([], input.page, input.pageSize, 0);

    const rows = (data ?? []) as ReadonlyArray<{
      id: string;
      name: string;
      slug: string;
      active: boolean;
      sort_order: number;
    }>;
    const taskCounts = await this.taskCountsByCategory(rows.map((row) => row.id));
    const items = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        active: row.active,
        displayOrder: row.sort_order,
        taskCount: taskCounts.get(row.id) ?? 0,
        updatedAt: await this.lastCategoryChangeAt(row.id),
      })),
    );
    return paginate(items, input.page, input.pageSize, count ?? items.length);
  }

  private async taskCountsByCategory(
    categoryIds: ReadonlyArray<string>,
  ): Promise<ReadonlyMap<string, number>> {
    const map = new Map<string, number>();
    if (categoryIds.length === 0) return map;
    const db = await this.db();
    const { data } = await db.from("tasks").select("category_id").in("category_id", categoryIds);
    for (const row of (data ?? []) as ReadonlyArray<{ category_id: string }>) {
      map.set(row.category_id, (map.get(row.category_id) ?? 0) + 1);
    }
    return map;
  }

  /** `categories` has no updated_at column; the moderation trail is the source. */
  private async lastCategoryChangeAt(categoryId: string): Promise<string> {
    const db = await this.db();
    const { data } = await db
      .from("admin_category_history")
      .select("created_at")
      .eq("category_id", categoryId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as { created_at: string } | null)?.created_at ?? new Date(0).toISOString();
  }

  async getCategory(id: string): Promise<CategoryDetail | null> {
    const db = await this.db();
    const { data } = await db
      .from("categories")
      .select("id,name,slug,active,sort_order")
      .eq("id", id)
      .maybeSingle();
    const row = data as {
      id: string;
      name: string;
      slug: string;
      active: boolean;
      sort_order: number;
    } | null;
    if (!row) return null;

    const [taskCounts, historyRows] = await Promise.all([
      this.taskCountsByCategory([row.id]),
      db
        .from("admin_category_history")
        .select("action,reason,admin_id,capability,created_at")
        .eq("category_id", row.id)
        .order("created_at", { ascending: true }),
    ]);
    const raw = (historyRows.data ?? []) as ReadonlyArray<{
      action: string;
      reason: string;
      admin_id: string;
      capability: string;
      created_at: string;
    }>;
    const names = await this.displayNames(raw.map((entry) => entry.admin_id));
    const history: ReadonlyArray<CategoryHistoryEvent> = raw.map((entry) => ({
      type: toCategoryHistoryType(entry.action),
      fromValue: null,
      toValue: entry.action,
      actor: displayNameFor(names, entry.admin_id),
      capability: entry.capability as AdminCapability,
      reason: entry.reason,
      at: entry.created_at,
    }));

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      active: row.active,
      displayOrder: row.sort_order,
      taskCount: taskCounts.get(row.id) ?? 0,
      updatedAt: raw.at(-1)?.created_at ?? new Date(0).toISOString(),
      history,
    };
  }

  async createCategory(input: {
    name: string;
    slug: string;
    actor: string;
    capability: AdminCapability | null;
  }): Promise<{ ok: boolean; message?: string; categoryId?: string }> {
    const db = await this.db();
    const { data, error } = await db.rpc("admin_create_category", {
      p_name: input.name,
      p_slug: input.slug,
      p_reason: `Created by ${input.actor} through the Admin console catalog.`,
      p_idempotency_key: `cat_create_${input.slug}`,
    });
    if (error) return { ok: false, message: friendlyError(error.message) };
    const created = data as { id: string } | null;
    return created ? { ok: true, categoryId: created.id } : { ok: true };
  }

  async renameCategory(input: {
    categoryId: string;
    name: string;
    slug: string;
    reason: string;
    actor: string;
    capability: AdminCapability | null;
  }): Promise<MutationResult> {
    if (!input.reason.trim()) return { ok: false, message: MISSING_REASON };
    return this.call("admin_rename_category", {
      p_category_id: input.categoryId,
      p_name: input.name,
      p_slug: input.slug,
      p_reason: input.reason,
      p_idempotency_key: `cat_rename_${input.categoryId}_${input.slug}`,
    });
  }

  async setCategoryActive(input: {
    categoryId: string;
    active: boolean;
    reason: string;
    actor: string;
    capability: AdminCapability | null;
  }): Promise<MutationResult> {
    if (!input.reason.trim()) return { ok: false, message: MISSING_REASON };
    return this.call("admin_set_category_active", {
      p_category_id: input.categoryId,
      p_active: input.active,
      p_reason: input.reason,
      p_idempotency_key: `cat_active_${input.categoryId}_${String(input.active)}`,
    });
  }

  async reorderCategory(input: {
    categoryId: string;
    displayOrder: number;
    reason: string;
    actor: string;
    capability: AdminCapability | null;
  }): Promise<MutationResult> {
    if (!input.reason.trim()) return { ok: false, message: MISSING_REASON };
    return this.call("admin_reorder_category", {
      p_category_id: input.categoryId,
      p_sort_order: input.displayOrder,
      p_reason: input.reason,
      p_idempotency_key: `cat_order_${input.categoryId}_${String(input.displayOrder)}`,
    });
  }

  // =========================================================================
  // Bookings (marketplace workflow oversight)
  // =========================================================================

  async listBookings(input: PageInput & { status?: string }): Promise<Paginated<BookingRow>> {
    const db = await this.db();
    const { from, to } = pageRange(input.page, input.pageSize);
    let query = db
      .from("bookings")
      .select(
        "id,task_id,client_id,tasker_id,agreed_centavos,status,created_at,updated_at",
        { count: "exact" },
      );
    if (input.status) query = query.eq("status", input.status);
    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) return paginate<BookingRow>([], input.page, input.pageSize, 0);

    const rows = (data ?? []) as ReadonlyArray<RawAdminBookingRow>;
    const items = await this.decorateBookings(rows);
    return paginate(items, input.page, input.pageSize, count ?? items.length);
  }

  private async decorateBookings(
    rows: ReadonlyArray<RawAdminBookingRow>,
  ): Promise<ReadonlyArray<BookingRow>> {
    if (rows.length === 0) return [];
    const db = await this.db();
    const [names, taskRes] = await Promise.all([
      this.displayNames([...rows.map((r) => r.client_id), ...rows.map((r) => r.tasker_id)]),
      db
        .from("tasks")
        .select("id,title")
        .in("id", [...new Set(rows.map((row) => row.task_id))]),
    ]);
    const titleById = new Map(
      ((taskRes.data ?? []) as ReadonlyArray<{ id: string; title: string }>).map((task) => [
        task.id,
        task.title,
      ]),
    );
    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      taskTitle: titleById.get(row.task_id) ?? "Task",
      clientDisplayName: displayNameFor(names, row.client_id),
      taskerDisplayName: displayNameFor(names, row.tasker_id),
      agreedCentavos: Number(row.agreed_centavos),
      status: row.status as BookingRow["status"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async getBooking(bookingId: string): Promise<BookingDetail | null> {
    const db = await this.db();
    const { data } = await db
      .from("bookings")
      .select(
        "id,task_id,client_id,tasker_id,agreed_centavos,currency,status,created_at,updated_at",
      )
      .eq("id", bookingId)
      .maybeSingle();
    const row = data as (RawAdminBookingRow & { currency: string }) | null;
    if (!row) return null;

    const [decorated] = await this.decorateBookings([row]);
    if (!decorated) return null;

    const [intentRes, disputeRes, eventsRes] = await Promise.all([
      db
        .from("payment_intents")
        .select("id,status")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from("disputes").select("id").eq("booking_id", bookingId).limit(1).maybeSingle(),
      db
        .from("booking_events")
        .select("id,from_status,to_status,actor_id,source,created_at")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true }),
    ]);

    const eventRows = (eventsRes.data ?? []) as ReadonlyArray<{
      id: string;
      from_status: string | null;
      to_status: string;
      actor_id: string | null;
      source: string;
      created_at: string;
    }>;
    const actorNames = await this.displayNames(eventRows.map((event) => event.actor_id));
    const intent = intentRes.data as { id: string; status: string } | null;

    return {
      ...decorated,
      currency: row.currency,
      paymentIntentId: intent?.id ?? null,
      paymentStatus: intent?.status ?? null,
      disputeId: (disputeRes.data as { id: string } | null)?.id ?? null,
      timeline: eventRows.map((event) => ({
        id: event.id,
        fromStatus: event.from_status,
        toStatus: event.to_status,
        actor: event.actor_id ? displayNameFor(actorNames, event.actor_id) : "system",
        source: event.source,
        at: event.created_at,
      })),
    };
  }

  // =========================================================================
  // Audit log
  // =========================================================================

  async listAuditLogs(
    input: PageInput & { action?: string; actor?: string },
  ): Promise<Paginated<AuditLogRow>> {
    const db = await this.db();
    const { from, to } = pageRange(input.page, input.pageSize);
    let query = db
      .from("audit_logs")
      .select("id,actor_id,action,resource_type,resource_id,safe_metadata,created_at", {
        count: "exact",
      });
    if (input.action) query = query.eq("action", input.action);
    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) return paginate<AuditLogRow>([], input.page, input.pageSize, 0);

    const rows = (data ?? []) as ReadonlyArray<{
      id: string;
      actor_id: string | null;
      action: string;
      resource_type: string | null;
      resource_id: string | null;
      safe_metadata: Record<string, unknown> | null;
      created_at: string;
    }>;
    const names = await this.displayNames(rows.map((row) => row.actor_id));
    const items = rows
      .map((row) => {
        const capability = row.safe_metadata?.["capability"];
        return {
          id: row.id,
          actor: row.actor_id ? displayNameFor(names, row.actor_id) : "system",
          capability: typeof capability === "string" ? (capability as AdminCapability) : null,
          action: row.action,
          resource: row.resource_id
            ? `${row.resource_type ?? "resource"} ${row.resource_id.slice(0, 8)}`
            : (row.resource_type ?? "-"),
          // audit_logs.safe_metadata never carries a narrative reason; the
          // reason lives in the immutable moderation trail.
          reason: null,
          at: row.created_at,
        };
      })
      .filter((row) => (input.actor ? row.actor === input.actor : true));
    return paginate(items, input.page, input.pageSize, count ?? items.length);
  }
}

type RawAdminBookingRow = {
  readonly id: string;
  readonly task_id: string;
  readonly client_id: string;
  readonly tasker_id: string;
  readonly agreed_centavos: number;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
};

function toCategoryHistoryType(action: string): CategoryHistoryEvent["type"] {
  switch (action) {
    case "create":
    case "rename":
    case "reorder":
    case "activate":
    case "deactivate":
      return action;
    default:
      return "rename";
  }
}

/** Per-request adapter. A new instance is cheap; the client is created lazily. */
export function createSupabaseAdminRepository(): SupabaseAdminRepository {
  return new SupabaseAdminRepository();
}

import {
  mapTaskFeedRow,
  sanitizeKeyword,
  SupabaseMarketplaceReadAdapter,
  type DizkarteSupabaseClient,
  type RawTaskFeedRow,
} from "@dizkarte/adapter-supabase";
import {
  paginate,
  profileUpdateSchema,
  type BookingId,
  type ConversationId,
  type OfferId,
  type Paginated,
  type PublicTaskerProfile,
  type PublicTaskFeedItem,
  type TaskId,
  type TaskQuestionId,
  type UserId,
} from "@dizkarte/domain";
import type { MobileMarketplacePort } from "./port";
import {
  defaultNotificationPreferences,
  mapBookingEvent,
  mapDispute,
  mapNotification,
  mapNotificationPreferences,
  mapReview,
  mapWithdrawal,
  maskContact,
  persistedDeliveryStatus,
  toBookingStatus,
  toOfferStatus,
  toPointLiteral,
  toTaskStatus,
  type RawBookingRow,
  type RawOfferRow,
} from "./supabase-mappers";
import type {
  BookingEventRecord,
  BookingRecord,
  CheckoutSessionRecord,
  CheckoutSimulationChoice,
  CompletionEvidenceItem,
  ConversationRecord,
  DisputeRecord,
  DraftTaskInput,
  LedgerSummary,
  MessageRecord,
  MyOfferHistoryItem,
  MyProfileRecord,
  MyProfileUpdateInput,
  NotificationPreferenceCategory,
  NotificationPreferences,
  NotificationRecord,
  OfferRecord,
  OpenDisputeInput,
  OwnedTaskRecord,
  RequestCompletionInput,
  RequestWithdrawalOutcome,
  ReviewInput,
  ReviewPairView,
  SelectOfferOutcome,
  SpecialtyOption,
  SupportTicketRecord,
  TaskerDashboardSnapshot,
  TaskQuestionRecord,
  UpdateProfileOutcome,
  WithdrawalRecord,
} from "./types";

/**
 * Real Supabase-backed implementation of `MobileMarketplacePort`.
 *
 * Security posture:
 *  - Every call uses the signed-in user's own JWT through the shared mobile
 *    Supabase client (publishable anon key only). RLS is always the row gate,
 *    so the `clientId` / `taskerId` / `viewerId` arguments on the port are used
 *    for *filtering and clear errors only* — they are never the authorization
 *    decision. A spoofed id cannot widen access because the database still
 *    evaluates policies against `auth.uid()`.
 *  - State transitions go through the privileged SECURITY DEFINER RPCs
 *    (`publish_task`, `submit_offer`, `withdraw_offer`, `select_offer`,
 *    `start_booking`, `request_completion`, `confirm_completion_and_release`,
 *    `open_dispute`, `submit_review`, `request_withdrawal`), which re-check
 *    eligibility server-side. The client never writes a status column directly.
 *  - Money movement is provider-authoritative: checkout and payout are refused
 *    here rather than simulated, because `process_payment_event` and
 *    `process_payout_result` are service-role only and no provider is approved.
 */

/** Thrown for a genuine backend failure so screens can show an error state. */
export class MarketplaceRequestError extends Error {
  constructor(operation: string, detail: string) {
    super(`${operation}: ${detail}`);
    this.name = "MarketplaceRequestError";
  }
}

function fail(operation: string, error: { message: string } | null): void {
  if (error) throw new MarketplaceRequestError(operation, error.message);
}

/** Strip the leading 'CLASS: ' the RPCs raise, keeping the readable detail. */
function detailOf(message: string): string {
  const separator = message.indexOf(": ");
  return (separator > 0 ? message.slice(separator + 2) : message).trim();
}

const CHECKOUT_UNAVAILABLE =
  "No approved Philippine payment provider is configured, so a real checkout cannot be started. " +
  "Escrow payment is enabled once provider credentials and the refund policy are approved.";

export class SupabaseMarketplaceRepository implements MobileMarketplacePort {
  private cachedClient: DizkarteSupabaseClient | null = null;
  private cachedReads: SupabaseMarketplaceReadAdapter | null = null;

  /**
   * The client is supplied as a thunk, not an instance.
   *
   * Creating the Supabase client touches browser/native storage, which does not
   * exist during static web prerendering. Deferring construction to the first
   * actual query keeps the repository safe to instantiate during render.
   */
  constructor(private readonly clientFactory: () => DizkarteSupabaseClient) {}

  private get client(): DizkarteSupabaseClient {
    this.cachedClient ??= this.clientFactory();
    return this.cachedClient;
  }

  private get reads(): SupabaseMarketplaceReadAdapter {
    this.cachedReads ??= new SupabaseMarketplaceReadAdapter(this.client);
    return this.cachedReads;
  }

  // =========================================================================
  // Identity helper
  // =========================================================================

  /**
   * The authenticated user id. Authorization always derives from this (and from
   * RLS), never from an id passed in by a screen.
   */
  private async currentUserId(): Promise<string | null> {
    const { data } = await this.client.auth.getUser();
    return data.user?.id ?? null;
  }

  private async displayNames(
    userIds: ReadonlyArray<string | null | undefined>,
  ): Promise<ReadonlyMap<string, string>> {
    const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const { data } = await this.client.from("profiles").select("id,display_name").in("id", unique);
    for (const row of (data ?? []) as ReadonlyArray<{ id: string; display_name: string | null }>) {
      map.set(row.id, row.display_name?.trim() || "Dizkarte user");
    }
    return map;
  }

  private nameOf(map: ReadonlyMap<string, string>, userId: string): string {
    return map.get(userId) ?? "Dizkarte user";
  }

  // =========================================================================
  // Client "My Tasks"
  // =========================================================================

  async listMyTasks(clientId: string): Promise<ReadonlyArray<OwnedTaskRecord>> {
    const { data, error } = await this.client
      .from("tasks")
      .select("id,client_id,category_id,title,description,budget_centavos,scheduled_for,same_day,status,published_at,created_at,updated_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    fail("listMyTasks", error);
    const rows = (data ?? []) as ReadonlyArray<RawTaskRow>;
    return Promise.all(rows.map((row) => this.buildOwnedTask(row)));
  }

  async getOwnedTask(taskId: TaskId, clientId: string): Promise<OwnedTaskRecord | null> {
    const { data, error } = await this.client
      .from("tasks")
      .select("id,client_id,category_id,title,description,budget_centavos,scheduled_for,same_day,status,published_at,created_at,updated_at")
      .eq("id", taskId)
      .eq("client_id", clientId)
      .maybeSingle();
    fail("getOwnedTask", error);
    return data ? this.buildOwnedTask(data as RawTaskRow) : null;
  }

  /**
   * Assemble the owner view. Location and media live in separate tables, and
   * the coordinates come from the owner-readable coordinate views because the
   * stored columns are PostGIS geography values.
   */
  private async buildOwnedTask(row: RawTaskRow): Promise<OwnedTaskRecord> {
    const [publicLoc, privateLoc, media, counts] = await Promise.all([
      this.client
        .from("task_locations_readable")
        .select("city_code,barangay_code,landmark,approximate_lat,approximate_lng")
        .eq("task_id", row.id)
        .maybeSingle(),
      this.client
        .from("task_private_locations_readable")
        .select("exact_address,exact_lat,exact_lng")
        .eq("task_id", row.id)
        .maybeSingle(),
      this.client
        .from("task_media")
        .select("id,kind,storage_path,sort_order")
        .eq("task_id", row.id)
        .order("sort_order", { ascending: true }),
      this.ownedTaskCounts(row.id),
    ]);

    const pub = publicLoc.data as {
      city_code: string;
      barangay_code: string;
      landmark: string;
      approximate_lat: number;
      approximate_lng: number;
    } | null;
    const priv = privateLoc.data as {
      exact_address: string;
      exact_lat: number;
      exact_lng: number;
    } | null;

    const draft: DraftTaskInput = {
      categoryId: row.category_id,
      title: row.title,
      description: row.description,
      budgetCentavos: Number(row.budget_centavos),
      scheduledFor: row.scheduled_for,
      sameDay: row.same_day,
      landmark: pub?.landmark ?? "",
      cityCode: pub?.city_code ?? "",
      barangayCode: pub?.barangay_code ?? "",
      approximateLat: Number(pub?.approximate_lat ?? 0),
      approximateLng: Number(pub?.approximate_lng ?? 0),
      exactAddress: priv?.exact_address ?? "",
      exactLat: Number(priv?.exact_lat ?? 0),
      exactLng: Number(priv?.exact_lng ?? 0),
      media: ((media.data ?? []) as ReadonlyArray<{
        id: string;
        kind: string;
        storage_path: string;
      }>).map((item) => ({
        id: item.id,
        kind: item.kind === "video" ? ("video" as const) : ("image" as const),
        // Only the final path segment is surfaced, never the full storage path.
        fileName: item.storage_path.split("/").pop() ?? item.id,
        sizeBytes: 0,
        mimeType: item.kind === "video" ? "video/mp4" : "image/jpeg",
      })),
    };

    return {
      id: row.id as TaskId,
      clientId: row.client_id as UserId,
      status: toTaskStatus(row.status),
      draft,
      publishedAt: row.published_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      questionCount: counts.questionCount,
      offerCount: counts.offerCount,
      assignedOfferId: counts.assignedOfferId,
      activeBookingId: counts.activeBookingId,
    };
  }

  private async ownedTaskCounts(taskId: string): Promise<{
    questionCount: number;
    offerCount: number;
    assignedOfferId: OfferId | null;
    activeBookingId: BookingId | null;
  }> {
    const [questions, offers, booking] = await Promise.all([
      this.client
        .from("task_questions")
        .select("id", { count: "exact", head: true })
        .eq("task_id", taskId),
      this.client.from("offers").select("id,status").eq("task_id", taskId),
      this.client
        .from("bookings")
        .select("id,accepted_offer_id,status")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const offerRows = (offers.data ?? []) as ReadonlyArray<{ id: string; status: string }>;
    const bookingRow = booking.data as {
      id: string;
      accepted_offer_id: string | null;
      status: string;
    } | null;
    const selected = offerRows.find((offer) => offer.status === "SELECTED");
    return {
      questionCount: questions.count ?? 0,
      // Withdrawn/rejected offers are not live competition for the Client.
      offerCount: offerRows.filter((offer) => offer.status === "SUBMITTED").length,
      assignedOfferId: (selected?.id ?? bookingRow?.accepted_offer_id ?? null) as OfferId | null,
      activeBookingId: (bookingRow?.id ?? null) as BookingId | null,
    };
  }

  /**
   * Create or update a draft. The task row, its approximate location, and its
   * exact location are written separately because they are separate tables with
   * separate RLS policies (the exact address is owner/participant-only).
   *
   * Editing is only permitted while the task is a DRAFT or still OPEN — the
   * `tasks_update_own` policy enforces that, so a later-stage edit is refused by
   * the database rather than by a client-side check.
   */
  async saveDraftTask(
    clientId: string,
    draft: DraftTaskInput,
    existingTaskId?: TaskId,
  ): Promise<OwnedTaskRecord> {
    const authedId = await this.currentUserId();
    if (!authedId || authedId !== clientId) {
      throw new MarketplaceRequestError("saveDraftTask", "Not signed in as this Client.");
    }

    const taskFields = {
      category_id: draft.categoryId,
      title: draft.title,
      description: draft.description,
      budget_centavos: draft.budgetCentavos,
      scheduled_for: draft.scheduledFor,
      same_day: draft.sameDay,
    };

    let taskId: string;
    if (existingTaskId) {
      const { data, error } = await this.client
        .from("tasks")
        .update(taskFields)
        .eq("id", existingTaskId)
        .eq("client_id", authedId)
        .select("id")
        .maybeSingle();
      fail("saveDraftTask", error);
      if (!data) {
        throw new MarketplaceRequestError(
          "saveDraftTask",
          "This task can no longer be edited. Only a draft or still-open task may be changed.",
        );
      }
      taskId = (data as { id: string }).id;
    } else {
      const { data, error } = await this.client
        .from("tasks")
        .insert({ ...taskFields, client_id: authedId, status: "DRAFT" })
        .select("id")
        .single();
      fail("saveDraftTask", error);
      taskId = (data as { id: string }).id;
    }

    const [pubResult, privResult] = await Promise.all([
      this.client.from("task_public_locations").upsert(
        {
          task_id: taskId,
          city_code: draft.cityCode,
          barangay_code: draft.barangayCode,
          landmark: draft.landmark,
          approximate_point: toPointLiteral(draft.approximateLat, draft.approximateLng),
        },
        { onConflict: "task_id" },
      ),
      this.client.from("task_private_locations").upsert(
        {
          task_id: taskId,
          exact_address: draft.exactAddress,
          exact_point: toPointLiteral(draft.exactLat, draft.exactLng),
        },
        { onConflict: "task_id" },
      ),
    ]);
    fail("saveDraftTask.publicLocation", pubResult.error);
    fail("saveDraftTask.privateLocation", privResult.error);

    const saved = await this.getOwnedTask(taskId as TaskId, authedId);
    if (!saved) {
      throw new MarketplaceRequestError("saveDraftTask", "Saved task could not be read back.");
    }
    return saved;
  }

  /**
   * Publish through the `publish_task` RPC, which re-checks ownership, identity
   * verification, and the current status server-side. The `verified` argument is
   * only used to pre-empt an obviously doomed call with a clearer reason; the
   * database remains the authority.
   */
  async publishTask(
    taskId: TaskId,
    clientId: string,
    verified: boolean,
  ): Promise<
    | { ok: true; task: OwnedTaskRecord }
    | { ok: false; reason: "NOT_VERIFIED" | "FORBIDDEN" | "INVALID_STATE" }
  > {
    if (!verified) return { ok: false, reason: "NOT_VERIFIED" };

    const { error } = await this.client.rpc("publish_task", { p_task_id: taskId });
    if (error) {
      const message = error.message.toUpperCase();
      if (message.includes("NOT_VERIFIED") || message.includes("VERIF")) {
        return { ok: false, reason: "NOT_VERIFIED" };
      }
      if (message.includes("FORBIDDEN") || message.includes("PRIVILEGE")) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      return { ok: false, reason: "INVALID_STATE" };
    }

    const task = await this.getOwnedTask(taskId, clientId);
    if (!task) return { ok: false, reason: "FORBIDDEN" };
    return { ok: true, task };
  }

  // =========================================================================
  // Public discovery
  // =========================================================================

  /**
   * Open-task search over the `public_task_feed` view.
   *
   * Implemented here rather than delegated because the mobile filter set is
   * wider than the shared domain input (schedule window, radius, "nearby").
   * Distance sorting needs a configured map provider, so it falls back to
   * newest instead of inventing an ordering.
   */
  async searchOpenTasks(input: {
    page: number;
    pageSize: number;
    keyword?: string;
    categoryId?: string;
    cityCode?: string;
    barangayCode?: string;
    minBudgetCentavos?: number;
    maxBudgetCentavos?: number;
    scheduledFrom?: string;
    scheduledTo?: string;
    sameDayOnly?: boolean;
    nearLat?: number;
    nearLng?: number;
    radiusKm?: number;
    sort?: "newest" | "highest_budget" | "nearby";
  }): Promise<Paginated<PublicTaskFeedItem>> {
    const pageSize = Math.min(Math.max(1, Math.trunc(input.pageSize)), 100);
    const page = Math.max(1, Math.trunc(input.page));
    const from = (page - 1) * pageSize;

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
    if (input.scheduledFrom) query = query.gte("scheduled_for", input.scheduledFrom);
    if (input.scheduledTo) query = query.lte("scheduled_for", input.scheduledTo);
    if (input.sameDayOnly === true) query = query.eq("same_day", true);

    if (input.sort === "highest_budget") {
      query = query.order("budget_centavos", { ascending: false, nullsFirst: false });
    } else {
      query = query.order("published_at", { ascending: false, nullsFirst: false });
    }

    const { data, count, error } = await query.range(from, from + pageSize - 1);
    fail("searchOpenTasks", error);
    const items = ((data ?? []) as ReadonlyArray<RawTaskFeedRow>).map(mapTaskFeedRow);
    return paginate(items, page, pageSize, count ?? items.length);
  }

  async getPublicTask(taskId: TaskId): Promise<PublicTaskFeedItem | null> {
    return this.reads.getPublicTask(taskId);
  }

  private async taskerProfile(userId: string): Promise<PublicTaskerProfile> {
    const profile = await this.reads.getPublicTaskerProfile(userId as UserId);
    if (profile) return profile;
    // A Tasker with no public profile row yet still needs a renderable shape;
    // everything defaults to the least-trusted values.
    const names = await this.displayNames([userId]);
    return {
      userId: userId as UserId,
      displayName: this.nameOf(names, userId),
      avatarPath: null,
      publicBio: "",
      publicExperience: "",
      completionCount: 0,
      ratingAverage: null,
      ratingCount: 0,
      specialties: [],
      serviceCityCodes: [],
      verifiedIdentity: false,
      suspended: false,
    };
  }

  // =========================================================================
  // Questions
  // =========================================================================

  async listQuestions(taskId: TaskId): Promise<ReadonlyArray<TaskQuestionRecord>> {
    const { data, error } = await this.client
      .from("task_questions")
      .select("id,task_id,author_id,body,answer,created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    fail("listQuestions", error);
    const rows = (data ?? []) as ReadonlyArray<{
      id: string;
      task_id: string;
      author_id: string;
      body: string;
      answer: string | null;
      created_at: string;
    }>;
    const names = await this.displayNames(rows.map((row) => row.author_id));
    return rows.map((row) => ({
      id: row.id as TaskQuestionId,
      taskId: row.task_id as TaskId,
      authorId: row.author_id as UserId,
      authorDisplayName: this.nameOf(names, row.author_id),
      body: row.body,
      answer: row.answer,
      createdAt: row.created_at,
    }));
  }

  async askQuestion(
    taskId: TaskId,
    authorId: string,
    authorDisplayName: string,
    body: string,
  ): Promise<TaskQuestionRecord> {
    const { data, error } = await this.client
      .from("task_questions")
      .insert({ task_id: taskId, author_id: authorId, body })
      .select("id,task_id,author_id,body,answer,created_at")
      .single();
    fail("askQuestion", error);
    const row = data as {
      id: string;
      task_id: string;
      author_id: string;
      body: string;
      answer: string | null;
      created_at: string;
    };
    return {
      id: row.id as TaskQuestionId,
      taskId: row.task_id as TaskId,
      authorId: row.author_id as UserId,
      authorDisplayName,
      body: row.body,
      answer: row.answer,
      createdAt: row.created_at,
    };
  }

  // =========================================================================
  // Offers
  // =========================================================================

  /**
   * Offers on a task. RLS already restricts rows to the submitting Tasker or
   * the task owner, so a Tasker browsing someone else's task sees only their
   * own offer — the per-viewer projection is enforced by the database, not by
   * filtering here.
   */
  async listOffers(taskId: TaskId, _viewerId: string): Promise<ReadonlyArray<OfferRecord>> {
    const { data, error } = await this.client
      .from("offers")
      .select(
        "id,task_id,tasker_id,amount_centavos,message,eta_text,availability_text,experience_text,status,created_at",
      )
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    fail("listOffers", error);
    return this.buildOffers((data ?? []) as ReadonlyArray<RawOfferRow>);
  }

  private async buildOffers(rows: ReadonlyArray<RawOfferRow>): Promise<ReadonlyArray<OfferRecord>> {
    if (rows.length === 0) return [];
    const names = await this.displayNames(rows.map((row) => row.tasker_id));
    const profiles = new Map<string, PublicTaskerProfile>();
    for (const taskerId of new Set(rows.map((row) => row.tasker_id))) {
      profiles.set(taskerId, await this.taskerProfile(taskerId));
    }
    return rows.map((row) => ({
      id: row.id as OfferId,
      taskId: row.task_id as TaskId,
      taskerId: row.tasker_id as UserId,
      taskerDisplayName: this.nameOf(names, row.tasker_id),
      taskerProfile: profiles.get(row.tasker_id)!,
      amountCentavos: Number(row.amount_centavos),
      message: row.message,
      etaText: row.eta_text,
      availabilityText: row.availability_text,
      experienceText: row.experience_text,
      status: toOfferStatus(row.status),
      createdAt: row.created_at,
    }));
  }

  async listMyOffers(taskerId: string): Promise<ReadonlyArray<MyOfferHistoryItem>> {
    const { data, error } = await this.client
      .from("offers")
      .select(
        "id,task_id,tasker_id,amount_centavos,message,eta_text,availability_text,experience_text,status,created_at",
      )
      .eq("tasker_id", taskerId)
      .order("created_at", { ascending: false });
    fail("listMyOffers", error);
    const rows = (data ?? []) as ReadonlyArray<RawOfferRow>;
    if (rows.length === 0) return [];

    const offers = await this.buildOffers(rows);
    const { data: taskData } = await this.client
      .from("tasks")
      .select("id,title,status")
      .in("id", [...new Set(rows.map((row) => row.task_id))]);
    const taskById = new Map(
      ((taskData ?? []) as ReadonlyArray<{ id: string; title: string; status: string }>).map(
        (task) => [task.id, task],
      ),
    );

    return offers.map((offer) => {
      const task = taskById.get(offer.taskId);
      const taskStatus = toTaskStatus(task?.status);
      return {
        offer,
        taskTitle: task?.title ?? "Task no longer visible",
        taskStatus,
        // Withdrawal is only meaningful while the offer is still in play and
        // the task has not moved past open competition.
        canWithdraw:
          offer.status === "SUBMITTED" && (taskStatus === "OPEN" || taskStatus === "DRAFT"),
      };
    });
  }

  async withdrawOffer(offerId: string, taskerId: string): Promise<{ ok: boolean }> {
    const authedId = await this.currentUserId();
    if (!authedId || authedId !== taskerId) return { ok: false };
    const { error } = await this.client.rpc("withdraw_offer", {
      p_offer_id: offerId,
      p_idempotency_key: `withdraw_${offerId}`,
    });
    return { ok: !error };
  }

  /**
   * Submit an offer through `submit_offer`, which enforces Tasker eligibility
   * (approved, active, verified where required) and the one-offer-per-task
   * uniqueness server-side.
   */
  async submitOffer(
    taskId: TaskId,
    _taskerId: string,
    taskerDisplayName: string,
    input: {
      amountCentavos: number;
      message: string;
      etaText: string;
      availabilityText: string;
      experienceText: string;
    },
  ): Promise<OfferRecord> {
    const { data, error } = await this.client.rpc("submit_offer", {
      p_task_id: taskId,
      p_amount_centavos: input.amountCentavos,
      p_message: input.message,
      p_eta_text: input.etaText,
      p_availability_text: input.availabilityText,
      p_experience_text: input.experienceText,
    });
    if (error) throw new MarketplaceRequestError("submitOffer", detailOf(error.message));

    const row = data as RawOfferRow | null;
    if (!row) throw new MarketplaceRequestError("submitOffer", "Offer was not returned.");
    return {
      id: row.id as OfferId,
      taskId: row.task_id as TaskId,
      taskerId: row.tasker_id as UserId,
      taskerDisplayName,
      taskerProfile: await this.taskerProfile(row.tasker_id),
      amountCentavos: Number(row.amount_centavos),
      message: row.message,
      etaText: row.eta_text,
      availabilityText: row.availability_text,
      experienceText: row.experience_text,
      status: toOfferStatus(row.status),
      createdAt: row.created_at,
    };
  }

  async selectOffer(
    taskId: TaskId,
    offerId: string,
    _clientId: string,
    idempotencyKey: string,
  ): Promise<SelectOfferOutcome> {
    const { data, error } = await this.client.rpc("select_offer", {
      p_task_id: taskId,
      p_offer_id: offerId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      const message = error.message.toUpperCase();
      if (message.includes("FORBIDDEN") || message.includes("PRIVILEGE")) {
        return { ok: false, reason: "FORBIDDEN" };
      }
      if (message.includes("ALREADY") || message.includes("CONFLICT")) {
        return { ok: false, reason: "ALREADY_ASSIGNED" };
      }
      return { ok: false, reason: "OFFER_NOT_ELIGIBLE" };
    }
    const booking = data as { id: string } | null;
    if (!booking) return { ok: false, reason: "OFFER_NOT_ELIGIBLE" };
    return { ok: true, bookingId: booking.id as BookingId };
  }

  // =========================================================================
  // Checkout — fail closed
  // =========================================================================

  /**
   * Escrow checkout is provider-authoritative and no provider is approved, so
   * this refuses instead of returning a fabricated session. Returning a
   * synthetic checkout here would let the UI imply that money had moved.
   */
  async createCheckoutSession(
    _bookingId: BookingId,
    _clientId: string,
  ): Promise<CheckoutSessionRecord> {
    throw new MarketplaceRequestError("createCheckoutSession", CHECKOUT_UNAVAILABLE);
  }

  async simulateCheckout(
    _providerReference: string,
    _choice: CheckoutSimulationChoice,
  ): Promise<{ accepted: boolean }> {
    return { accepted: false };
  }

  /**
   * Payment outcomes are written by `process_payment_event`, which is
   * service-role only — a mobile client must never be able to declare a payment
   * confirmed. Reports the booking's real state without changing anything.
   */
  async processAuthoritativeWebhook(
    providerReference: string,
  ): Promise<{ bookingId: BookingId; status: "CONFIRMED" | "FAILED" } | null> {
    const { data } = await this.client
      .from("payment_intents")
      .select("booking_id,status")
      .eq("provider_reference", providerReference)
      .maybeSingle();
    const row = data as { booking_id: string; status: string } | null;
    if (!row) return null;
    if (row.status !== "CONFIRMED" && row.status !== "FAILED") return null;
    return { bookingId: row.booking_id as BookingId, status: row.status };
  }

  // =========================================================================
  // Bookings
  // =========================================================================

  async listMyBookings(userId: string): Promise<ReadonlyArray<BookingRecord>> {
    const { data, error } = await this.client
      .from("bookings")
      .select("id,task_id,client_id,tasker_id,agreed_centavos,status,idempotency_key,created_at,updated_at")
      .or(`client_id.eq.${userId},tasker_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    fail("listMyBookings", error);
    return this.buildBookings((data ?? []) as ReadonlyArray<RawBookingRow>, userId);
  }

  async getBooking(bookingId: BookingId, viewerId: string): Promise<BookingRecord | null> {
    const { data, error } = await this.client
      .from("bookings")
      .select("id,task_id,client_id,tasker_id,agreed_centavos,status,idempotency_key,created_at,updated_at")
      .eq("id", bookingId)
      .maybeSingle();
    fail("getBooking", error);
    if (!data) return null;
    const built = await this.buildBookings([data as RawBookingRow], viewerId);
    return built[0] ?? null;
  }

  /**
   * Booking projection.
   *
   * The exact address is only attached once the booking is communication-
   * unlocked (payment confirmed onward) — before that RLS returns no private
   * location row anyway, so this mirrors the database rather than duplicating
   * the rule as the only gate.
   */
  private async buildBookings(
    rows: ReadonlyArray<RawBookingRow>,
    viewerId: string,
  ): Promise<ReadonlyArray<BookingRecord>> {
    if (rows.length === 0) return [];
    const taskIds = [...new Set(rows.map((row) => row.task_id))];
    const bookingIds = rows.map((row) => row.id);

    const [taskRes, names, intents, disputes, privateLocs, evidence] = await Promise.all([
      this.client.from("tasks").select("id,title").in("id", taskIds),
      this.displayNames([...rows.map((r) => r.client_id), ...rows.map((r) => r.tasker_id)]),
      this.client.from("payment_intents").select("id,booking_id").in("booking_id", bookingIds),
      this.client.from("disputes").select("id,booking_id").in("booking_id", bookingIds),
      this.client
        .from("task_private_locations_readable")
        .select("task_id,exact_address,exact_lat,exact_lng")
        .in("task_id", taskIds),
      this.client
        .from("evidence")
        .select("id,resource_id,storage_path,created_at")
        .eq("resource_type", "booking")
        .in("resource_id", bookingIds),
    ]);

    const titleByTask = new Map(
      ((taskRes.data ?? []) as ReadonlyArray<{ id: string; title: string }>).map((task) => [
        task.id,
        task.title,
      ]),
    );
    const intentByBooking = new Map(
      ((intents.data ?? []) as ReadonlyArray<{ id: string; booking_id: string }>).map((intent) => [
        intent.booking_id,
        intent.id,
      ]),
    );
    const disputeByBooking = new Map(
      ((disputes.data ?? []) as ReadonlyArray<{ id: string; booking_id: string }>).map((d) => [
        d.booking_id,
        d.id,
      ]),
    );
    const locByTask = new Map(
      ((privateLocs.data ?? []) as ReadonlyArray<{
        task_id: string;
        exact_address: string;
        exact_lat: number;
        exact_lng: number;
      }>).map((loc) => [loc.task_id, loc]),
    );
    const evidenceByBooking = new Map<string, CompletionEvidenceItem[]>();
    for (const item of (evidence.data ?? []) as ReadonlyArray<{
      id: string;
      resource_id: string;
      storage_path: string;
      created_at: string;
    }>) {
      const existing = evidenceByBooking.get(item.resource_id) ?? [];
      const isNote = item.storage_path.startsWith("note:");
      existing.push({
        id: item.id,
        kind: isNote ? "note" : "image",
        note: isNote ? item.storage_path.slice("note:".length) : null,
        fileName: isNote ? null : (item.storage_path.split("/").pop() ?? item.id),
        submittedAt: item.created_at,
      });
      evidenceByBooking.set(item.resource_id, existing);
    }

    return rows.map((row) => {
      const clientName = this.nameOf(names, row.client_id);
      const taskerName = this.nameOf(names, row.tasker_id);
      const isParticipant = viewerId === row.client_id || viewerId === row.tasker_id;
      const loc = isParticipant ? (locByTask.get(row.task_id) ?? null) : null;
      return {
        id: row.id as BookingId,
        taskId: row.task_id as TaskId,
        taskTitle: titleByTask.get(row.task_id) ?? "Task",
        clientId: row.client_id as UserId,
        clientDisplayName: clientName,
        taskerId: row.tasker_id as UserId,
        taskerDisplayName: taskerName,
        agreedCentavos: Number(row.agreed_centavos),
        status: toBookingStatus(row.status),
        idempotencyKey: row.idempotency_key,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        paymentIntentId: intentByBooking.get(row.id) ?? null,
        exactAddress: loc?.exact_address ?? null,
        exactLat: loc ? Number(loc.exact_lat) : null,
        exactLng: loc ? Number(loc.exact_lng) : null,
        clientContactMasked: maskContact(clientName),
        taskerContactMasked: maskContact(taskerName),
        completionEvidence: evidenceByBooking.get(row.id) ?? [],
        disputeId: (disputeByBooking.get(row.id) ?? null) as BookingRecord["disputeId"],
      };
    });
  }

  async listBookingEvents(bookingId: BookingId): Promise<ReadonlyArray<BookingEventRecord>> {
    const { data, error } = await this.client
      .from("booking_events")
      .select("id,booking_id,from_status,to_status,actor_id,source,created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true });
    fail("listBookingEvents", error);
    return ((data ?? []) as ReadonlyArray<Parameters<typeof mapBookingEvent>[0]>).map(
      mapBookingEvent,
    );
  }

  async startWork(bookingId: BookingId, _taskerId: string): Promise<{ ok: boolean }> {
    const { error } = await this.client.rpc("start_booking", {
      p_booking_id: bookingId,
      p_idempotency_key: `start_${bookingId}`,
    });
    return { ok: !error };
  }

  /**
   * Completion request. The note and any attachments are recorded as evidence
   * rows against the booking first, so the audit trail exists even if the state
   * transition is rejected; the RPC then performs the transition.
   */
  async requestCompletion(
    input: RequestCompletionInput,
    taskerId: string,
  ): Promise<{ ok: boolean }> {
    const authedId = await this.currentUserId();
    if (!authedId || authedId !== taskerId) return { ok: false };

    const evidenceRows = [
      ...(input.note.trim().length > 0
        ? [{ owner_id: authedId, resource_type: "booking", resource_id: input.bookingId, storage_path: `note:${input.note.trim()}` }]
        : []),
      ...input.evidence.map((item) => ({
        owner_id: authedId,
        resource_type: "booking",
        resource_id: input.bookingId,
        storage_path:
          item.kind === "note" ? `note:${item.note ?? ""}` : `booking/${input.bookingId}/${item.fileName ?? "attachment"}`,
      })),
    ];
    if (evidenceRows.length > 0) {
      await this.client.from("evidence").insert(evidenceRows);
    }

    const { error } = await this.client.rpc("request_completion", {
      p_booking_id: input.bookingId,
      p_idempotency_key: `complete_req_${input.bookingId}`,
    });
    return { ok: !error };
  }

  async confirmCompletion(bookingId: BookingId, _clientId: string): Promise<{ ok: boolean }> {
    const { error } = await this.client.rpc("confirm_completion_and_release", {
      p_booking_id: bookingId,
      p_idempotency_key: `complete_confirm_${bookingId}`,
    });
    return { ok: !error };
  }

  async openDispute(input: OpenDisputeInput, _actorId: string): Promise<DisputeRecord | null> {
    const { data, error } = await this.client.rpc("open_dispute", {
      p_booking_id: input.bookingId,
      p_reason: input.reason,
      p_idempotency_key: `dispute_${input.bookingId}`,
    });
    if (error || !data) return null;
    return mapDispute(data as Parameters<typeof mapDispute>[0]);
  }

  // =========================================================================
  // Ledger and Tasker dashboard
  // =========================================================================

  async getLedgerSummary(userId: string): Promise<LedgerSummary> {
    const balances = await this.reads.getDerivedBalances(userId as UserId);
    return {
      userId: userId as UserId,
      pendingCentavos: balances.pendingCentavos,
      protectedCentavos: balances.protectedCentavos,
      availableCentavos: balances.availableCentavos,
      reservedCentavos: balances.reservedCentavos,
      withdrawnCentavos: balances.withdrawnCentavos,
      derived: true,
    };
  }

  async getTaskerDashboard(taskerId: string): Promise<TaskerDashboardSnapshot> {
    const [feed, bookings, ledger, profile] = await Promise.all([
      this.searchOpenTasks({ page: 1, pageSize: 10, sort: "newest" }),
      this.listMyBookings(taskerId),
      this.getLedgerSummary(taskerId),
      this.client
        .from("public_tasker_profiles")
        .select("rating_average,rating_count,completion_count")
        .eq("user_id", taskerId)
        .maybeSingle(),
    ]);

    const asTasker = bookings.filter((booking) => booking.taskerId === taskerId);
    const stats = profile.data as {
      rating_average: number | null;
      rating_count: number | null;
      completion_count: number | null;
    } | null;

    return {
      availableWork: feed.items,
      activeBookings: asTasker.filter(
        (booking) => booking.status === "CONFIRMED" || booking.status === "IN_PROGRESS",
      ),
      completionRequested: asTasker.filter(
        (booking) => booking.status === "COMPLETION_REQUESTED",
      ),
      completedWork: asTasker.filter((booking) => booking.status === "COMPLETED"),
      ledger,
      ratingAverage: stats?.rating_average ?? null,
      ratingCount: Number(stats?.rating_count ?? 0),
      completionCount: Number(stats?.completion_count ?? 0),
      // No approved payout provider; the UI must fail closed on this.
      payoutProviderAvailable: false,
    };
  }

  // =========================================================================
  // Withdrawals
  // =========================================================================

  async listWithdrawals(userId: string): Promise<ReadonlyArray<WithdrawalRecord>> {
    const { data, error } = await this.client
      .from("withdrawals")
      .select("id,tasker_id,amount_centavos,status,failure_reason,created_at,updated_at")
      .eq("tasker_id", userId)
      .order("created_at", { ascending: false });
    fail("listWithdrawals", error);
    return ((data ?? []) as ReadonlyArray<Parameters<typeof mapWithdrawal>[0]>).map(mapWithdrawal);
  }

  /**
   * Payout settlement is provider-authoritative (`process_payout_result` is
   * service-role only) and no payout provider is approved, so a request is
   * refused before any row is written rather than left sitting as a promise the
   * platform cannot keep.
   */
  async requestWithdrawal(
    userId: string,
    amountCentavos: number,
  ): Promise<RequestWithdrawalOutcome> {
    const authedId = await this.currentUserId();
    if (!authedId || authedId !== userId) return { ok: false, reason: "FORBIDDEN" };
    const ledger = await this.getLedgerSummary(userId);
    if (amountCentavos <= 0 || amountCentavos > ledger.availableCentavos) {
      return { ok: false, reason: "INSUFFICIENT_AVAILABLE_BALANCE" };
    }
    return { ok: false, reason: "PROVIDER_UNAVAILABLE" };
  }

  // =========================================================================
  // Messaging
  // =========================================================================

  async getConversationForBooking(
    bookingId: BookingId,
    _viewerId: string,
  ): Promise<ConversationRecord | null> {
    const { data } = await this.client
      .from("conversations")
      .select("id,booking_id")
      .eq("booking_id", bookingId)
      .maybeSingle();
    const row = data as { id: string; booking_id: string } | null;
    if (!row) return null;
    const { data: participantData } = await this.client
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", row.id);
    return {
      id: row.id as ConversationId,
      bookingId: row.booking_id as BookingId,
      participantIds: ((participantData ?? []) as ReadonlyArray<{ user_id: string }>).map(
        (participant) => participant.user_id as UserId,
      ),
    };
  }

  async listMessages(
    conversationId: ConversationId,
    _viewerId: string,
  ): Promise<ReadonlyArray<MessageRecord>> {
    const { data, error } = await this.client
      .from("messages")
      .select("id,conversation_id,sender_id,body,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    fail("listMessages", error);
    const rows = (data ?? []) as ReadonlyArray<{
      id: string;
      conversation_id: string;
      sender_id: string;
      body: string | null;
      created_at: string;
    }>;
    if (rows.length === 0) return [];

    const { data: mediaData } = await this.client
      .from("message_media")
      .select("id,message_id,kind,storage_path,mime_type,size_bytes")
      .in(
        "message_id",
        rows.map((row) => row.id),
      );
    const mediaByMessage = new Map<string, MessageRecord["media"][number][]>();
    for (const item of (mediaData ?? []) as ReadonlyArray<{
      id: string;
      message_id: string;
      kind: string;
      storage_path: string;
      mime_type: string;
      size_bytes: number;
    }>) {
      const existing = mediaByMessage.get(item.message_id) ?? [];
      existing.push({
        id: item.id,
        kind: item.kind === "video" ? "video" : "image",
        fileName: item.storage_path.split("/").pop() ?? item.id,
        sizeBytes: Number(item.size_bytes),
        mimeType: item.mime_type,
      });
      mediaByMessage.set(item.message_id, existing);
    }

    return rows.map((row) => ({
      id: row.id as MessageRecord["id"],
      conversationId: row.conversation_id as ConversationId,
      senderId: row.sender_id as UserId,
      body: row.body,
      media: mediaByMessage.get(row.id) ?? [],
      createdAt: row.created_at,
      deliveryStatus: persistedDeliveryStatus(),
      // The durable row is the record of truth; the client nonce is a local
      // de-duplication concern and is not persisted server-side.
      clientNonce: row.id,
    }));
  }

  async sendMessage(
    conversationId: ConversationId,
    senderId: string,
    body: string | null,
    clientNonce: string,
    media?: ReadonlyArray<{
      kind: "image" | "video";
      fileName: string;
      sizeBytes: number;
      mimeType: string;
    }>,
  ): Promise<MessageRecord> {
    const { data, error } = await this.client
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: senderId, body })
      .select("id,conversation_id,sender_id,body,created_at")
      .single();
    if (error) throw new MarketplaceRequestError("sendMessage", detailOf(error.message));
    const row = data as {
      id: string;
      conversation_id: string;
      sender_id: string;
      body: string | null;
      created_at: string;
    };

    const attachments = media ?? [];
    if (attachments.length > 0) {
      await this.client.from("message_media").insert(
        attachments.map((item) => ({
          message_id: row.id,
          storage_path: `chat/${conversationId}/${item.fileName}`,
          kind: item.kind,
          mime_type: item.mimeType,
          size_bytes: item.sizeBytes,
        })),
      );
    }

    return {
      id: row.id as MessageRecord["id"],
      conversationId: row.conversation_id as ConversationId,
      senderId: row.sender_id as UserId,
      body: row.body,
      media: attachments.map((item, index) => ({
        id: `${row.id}-${index}`,
        kind: item.kind,
        fileName: item.fileName,
        sizeBytes: item.sizeBytes,
        mimeType: item.mimeType,
      })),
      createdAt: row.created_at,
      deliveryStatus: persistedDeliveryStatus(),
      clientNonce,
    };
  }

  /**
   * Server-side retry has no meaning against a durable store: a message either
   * persisted (and is already "sent") or the insert failed and never existed.
   * Re-sending is the screen's job, so this reports "nothing to retry".
   */
  async retryMessage(
    _conversationId: ConversationId,
    _clientNonce: string,
    _requesterId: string,
  ): Promise<MessageRecord | null> {
    return null;
  }

  // =========================================================================
  // Reviews
  // =========================================================================

  async submitReview(
    input: ReviewInput,
    _reviewerId: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    const { error } = await this.client.rpc("submit_review", {
      p_booking_id: input.bookingId,
      p_score: input.score,
      p_comment: input.comment,
    });
    if (error) return { ok: false, reason: detailOf(error.message) };
    return { ok: true };
  }

  async getReviewPair(bookingId: BookingId, viewerId: string): Promise<ReviewPairView | null> {
    const { data } = await this.client
      .from("reviews")
      .select("id,booking_id,reviewer_id,reviewee_id,score,comment,status,submitted_at,revealed_at")
      .eq("booking_id", bookingId);
    const rows = ((data ?? []) as ReadonlyArray<Parameters<typeof mapReview>[0]>).map(mapReview);
    if (rows.length === 0) {
      return { bookingId, myReview: null, counterpartReview: null, bothSubmitted: false, revealDeadline: null };
    }
    const mine = rows.find((review) => review.reviewerId === viewerId) ?? null;
    const other = rows.find((review) => review.reviewerId !== viewerId) ?? null;
    const bothSubmitted = mine !== null && other !== null;
    return {
      bookingId,
      myReview: mine,
      // Double-blind: the counterpart review is only visible once both exist or
      // it has been revealed by the backend.
      counterpartReview: bothSubmitted || other?.status === "REVEALED" ? other : null,
      bothSubmitted,
      revealDeadline: null,
    };
  }

  // =========================================================================
  // Notifications
  // =========================================================================

  async listNotifications(userId: string): Promise<ReadonlyArray<NotificationRecord>> {
    const { data, error } = await this.client
      .from("notifications")
      .select("id,user_id,type,title,body,resource_type,resource_id,read_at,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    fail("listNotifications", error);
    return ((data ?? []) as ReadonlyArray<Parameters<typeof mapNotification>[0]>).map(
      mapNotification,
    );
  }

  async markNotificationRead(notificationId: string, userId: string): Promise<void> {
    await this.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", userId)
      .is("read_at", null);
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await this.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
  }

  async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    const { data, error } = await this.client
      .from("notification_preferences")
      .select("category,in_app,push")
      .eq("user_id", userId);
    if (error) return defaultNotificationPreferences();
    return mapNotificationPreferences(
      (data ?? []) as ReadonlyArray<{ category: string; in_app: boolean; push: boolean }>,
    );
  }

  async setNotificationPreference(
    userId: string,
    category: NotificationPreferenceCategory,
    channel: "inApp" | "push",
    value: boolean,
  ): Promise<NotificationPreferences> {
    const current = await this.getNotificationPreferences(userId);
    const next = {
      ...current[category],
      [channel === "inApp" ? "inApp" : "push"]: value,
    };
    await this.client.from("notification_preferences").upsert(
      {
        user_id: userId,
        category,
        in_app: next.inApp,
        push: next.push,
      },
      { onConflict: "user_id,category" },
    );
    return this.getNotificationPreferences(userId);
  }

  // =========================================================================
  // Support
  // =========================================================================

  async submitSupportTicket(input: {
    reporterId: string;
    subjectType: "task" | "booking";
    subjectId: string;
    category: "payment" | "safety" | "quality" | "other";
    narrative: string;
    evidence: ReadonlyArray<{
      kind: "image" | "video" | "note";
      fileName?: string;
      note?: string;
    }>;
  }): Promise<SupportTicketRecord> {
    // `support_tickets.category` does not have a 'quality' member; it maps onto
    // the task-related category rather than being silently dropped.
    const dbCategory = input.category === "quality" ? "task" : input.category;
    const { data, error } = await this.client
      .from("support_tickets")
      .insert({
        user_id: input.reporterId,
        subject: `${input.subjectType} concern`,
        narrative: input.narrative,
        category: dbCategory,
        status: "OPEN",
      })
      .select("id,user_id,subject,narrative,category,status,created_at")
      .single();
    if (error) throw new MarketplaceRequestError("submitSupportTicket", detailOf(error.message));
    const row = data as RawTicketRow;

    if (input.evidence.length > 0) {
      await this.client.from("evidence").insert(
        input.evidence.map((item) => ({
          owner_id: input.reporterId,
          resource_type: "ticket",
          resource_id: row.id,
          storage_path:
            item.kind === "note" ? `note:${item.note ?? ""}` : `ticket/${row.id}/${item.fileName ?? "attachment"}`,
        })),
      );
    }

    return this.mapTicket(row, input.subjectType, input.subjectId, input.category);
  }

  async listMySupportTickets(userId: string): Promise<ReadonlyArray<SupportTicketRecord>> {
    const { data, error } = await this.client
      .from("support_tickets")
      .select("id,user_id,subject,narrative,category,status,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    fail("listMySupportTickets", error);
    return ((data ?? []) as ReadonlyArray<RawTicketRow>).map((row) =>
      this.mapTicket(row, row.subject.startsWith("booking") ? "booking" : "task", "", "other"),
    );
  }

  private mapTicket(
    row: RawTicketRow,
    subjectType: "task" | "booking",
    subjectId: string,
    category: SupportTicketRecord["category"],
  ): SupportTicketRecord {
    const status = ["OPEN", "PENDING", "RESOLVED", "CLOSED"].includes(row.status)
      ? (row.status as SupportTicketRecord["status"])
      : "OPEN";
    return {
      id: row.id as SupportTicketRecord["id"],
      reporterId: row.user_id as UserId,
      subjectType,
      subjectId,
      category,
      narrative: row.narrative,
      // Evidence and the admin-side history are not part of the requester's
      // read surface; the requester sees their own submission and its status.
      evidence: [],
      status,
      createdAt: row.created_at,
      history: [],
    };
  }

  // =========================================================================
  // Profiles (self-service)
  // =========================================================================

  async getMyProfile(userId: string): Promise<MyProfileRecord | null> {
    const { data, error } = await this.client
      .from("profiles")
      .select("id,display_name,mobile,city_code,barangay_code,language,bio,avatar_path")
      .eq("id", userId)
      .maybeSingle();
    fail("getMyProfile", error);
    const row = data as {
      id: string;
      display_name: string | null;
      mobile: string | null;
      city_code: string | null;
      barangay_code: string | null;
      language: string | null;
      bio: string | null;
      avatar_path: string | null;
    } | null;
    if (!row) return null;

    const [taskerRes, specialtyRes, areaRes] = await Promise.all([
      this.client
        .from("tasker_profiles")
        .select("public_bio,public_experience,approved_at,suspended_at")
        .eq("user_id", userId)
        .maybeSingle(),
      this.client.from("tasker_specialties").select("specialty_id").eq("user_id", userId),
      this.client.from("service_areas").select("city_code").eq("user_id", userId),
    ]);

    const taskerRow = taskerRes.data as {
      public_bio: string;
      public_experience: string;
      approved_at: string | null;
      suspended_at: string | null;
    } | null;

    // The Tasker section only exists for an approved, unsuspended profile —
    // matching what `update_tasker_public_profile` will accept, so the editor
    // never offers a field the backend would refuse.
    const taskerEditable =
      taskerRow !== null && taskerRow.approved_at !== null && taskerRow.suspended_at === null;

    return {
      userId: row.id as UserId,
      displayName: row.display_name?.trim() ?? "",
      mobile: row.mobile,
      cityCode: row.city_code,
      barangayCode: row.barangay_code,
      language: row.language === "fil" ? "fil" : "en",
      bio: row.bio ?? "",
      avatarPath: row.avatar_path,
      tasker: taskerEditable
        ? {
            publicBio: taskerRow.public_bio,
            publicExperience: taskerRow.public_experience,
            specialtyIds: (
              (specialtyRes.data ?? []) as ReadonlyArray<{ specialty_id: string }>
            ).map((item) => item.specialty_id),
            serviceCityCodes: [
              ...new Set(
                ((areaRes.data ?? []) as ReadonlyArray<{ city_code: string }>).map(
                  (item) => item.city_code,
                ),
              ),
            ],
          }
        : null,
    };
  }

  /**
   * Apply only the supplied fields.
   *
   * The four surfaces have different authorities and are written separately:
   * `profiles` directly (self-update policy), the public Tasker bio through
   * `update_tasker_public_profile` (the base table has no self-update policy
   * because it also holds platform-authoritative rating/approval columns), and
   * specialties / service areas directly (own-row write policies).
   */
  async updateMyProfile(
    userId: string,
    input: MyProfileUpdateInput,
  ): Promise<UpdateProfileOutcome> {
    const authedId = await this.currentUserId();
    if (!authedId || authedId !== userId) {
      return { ok: false, message: "You are not signed in as this user." };
    }

    const parsed = profileUpdateSchema.safeParse({
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.mobile !== undefined && input.mobile.trim().length > 0
        ? { mobile: input.mobile }
        : {}),
      ...(input.cityCode !== undefined && input.cityCode.trim().length > 0
        ? { cityCode: input.cityCode }
        : {}),
      ...(input.barangayCode !== undefined && input.barangayCode.trim().length > 0
        ? { barangayCode: input.barangayCode }
        : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the details entered." };
    }

    const fields: Record<string, unknown> = {};
    if (parsed.data.displayName !== undefined) fields["display_name"] = parsed.data.displayName;
    if (parsed.data.mobile !== undefined) fields["mobile"] = parsed.data.mobile;
    if (parsed.data.cityCode !== undefined) fields["city_code"] = parsed.data.cityCode;
    if (parsed.data.barangayCode !== undefined) {
      fields["barangay_code"] = parsed.data.barangayCode;
    }
    if (parsed.data.language !== undefined) fields["language"] = parsed.data.language;
    if (parsed.data.bio !== undefined) fields["bio"] = parsed.data.bio;

    if (Object.keys(fields).length > 0) {
      const { error } = await this.client.from("profiles").update(fields).eq("id", authedId);
      if (error) return { ok: false, message: detailOf(error.message) };
    }

    if (input.publicBio !== undefined || input.publicExperience !== undefined) {
      const existing = await this.getMyProfile(authedId);
      const { error } = await this.client.rpc("update_tasker_public_profile", {
        p_public_bio: input.publicBio ?? existing?.tasker?.publicBio ?? "",
        p_public_experience: input.publicExperience ?? existing?.tasker?.publicExperience ?? "",
      });
      if (error) return { ok: false, message: detailOf(error.message) };
    }

    if (input.specialtyIds !== undefined) {
      const result = await this.replaceSpecialties(authedId, input.specialtyIds);
      if (result) return { ok: false, message: result };
    }

    if (input.serviceCityCodes !== undefined) {
      const result = await this.replaceServiceAreas(authedId, input.serviceCityCodes);
      if (result) return { ok: false, message: result };
    }

    const profile = await this.getMyProfile(authedId);
    if (!profile) return { ok: false, message: "Profile could not be read back." };
    return { ok: true, profile };
  }

  /** Replace the specialty set. Returns an error message, or null on success. */
  private async replaceSpecialties(
    userId: string,
    specialtyIds: ReadonlyArray<string>,
  ): Promise<string | null> {
    const unique = [...new Set(specialtyIds)];
    const { error: deleteError } = await this.client
      .from("tasker_specialties")
      .delete()
      .eq("user_id", userId);
    if (deleteError) return detailOf(deleteError.message);
    if (unique.length === 0) return null;
    const { error } = await this.client
      .from("tasker_specialties")
      .insert(unique.map((specialtyId) => ({ user_id: userId, specialty_id: specialtyId })));
    return error ? detailOf(error.message) : null;
  }

  /** Replace the service-area set. Returns an error message, or null on success. */
  private async replaceServiceAreas(
    userId: string,
    cityCodes: ReadonlyArray<string>,
  ): Promise<string | null> {
    const unique = [...new Set(cityCodes.filter((code) => code.trim().length > 0))];
    const { error: deleteError } = await this.client
      .from("service_areas")
      .delete()
      .eq("user_id", userId);
    if (deleteError) return detailOf(deleteError.message);
    if (unique.length === 0) return null;
    const { error } = await this.client
      .from("service_areas")
      .insert(unique.map((cityCode) => ({ user_id: userId, city_code: cityCode })));
    return error ? detailOf(error.message) : null;
  }

  async listSpecialtyOptions(): Promise<ReadonlyArray<SpecialtyOption>> {
    const { data, error } = await this.client
      .from("specialties")
      .select("id,slug,name")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    fail("listSpecialtyOptions", error);
    return ((data ?? []) as ReadonlyArray<{ id: string; slug: string; name: string }>).map(
      (row) => ({ id: row.id, slug: row.slug, name: row.name }),
    );
  }

  async getPublicTaskerProfile(userId: string): Promise<PublicTaskerProfile | null> {
    return this.reads.getPublicTaskerProfile(userId as UserId);
  }
}

type RawTaskRow = {
  readonly id: string;
  readonly client_id: string;
  readonly category_id: string;
  readonly title: string;
  readonly description: string;
  readonly budget_centavos: number;
  readonly scheduled_for: string | null;
  readonly same_day: boolean;
  readonly status: string;
  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

type RawTicketRow = {
  readonly id: string;
  readonly user_id: string;
  readonly subject: string;
  readonly narrative: string;
  readonly category: string;
  readonly status: string;
  readonly created_at: string;
};

/**
 * Build the adapter against the shared, session-bound mobile Supabase client.
 *
 * The client module is required lazily inside the thunk so that merely creating
 * the repository (which happens while the provider renders, including during
 * static web export) never pulls in native storage.
 */
export function createSupabaseMarketplaceRepository(): SupabaseMarketplaceRepository {
  return new SupabaseMarketplaceRepository(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate lazy load; see above
    const module = require("../../lib/supabase") as {
      getSupabaseClient: () => unknown;
    };
    return module.getSupabaseClient() as DizkarteSupabaseClient;
  });
}

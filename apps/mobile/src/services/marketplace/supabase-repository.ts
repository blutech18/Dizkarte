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
  type TaskLocationType,
  type TaskQuestionId,
  type TaskTimeOfDay,
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
  toConversationSummary,
  toOfferStatus,
  toPointLiteral,
  toTaskStatus,
  type ConversationSummaryRow,
  type RawBookingRow,
  type RawOfferRow,
} from "./supabase-mappers";
import type {
  AddVerificationDocumentOutcome,
  AddPayoutMethodInput,
  BillingAddressInput,
  BillingAddressRecord,
  BookingEventRecord,
  BookingRecord,
  CheckoutSessionRecord,
  CheckoutSimulationChoice,
  CompletionEvidenceItem,
  ConversationRecord,
  ConversationSummary,
  ReportRecord,
  DisputeRecord,
  DraftTaskInput,
  LedgerSummary,
  MarketplaceCategory,
  MessageRecord,
  MyOfferHistoryItem,
  MyProfileRecord,
  MyProfileUpdateInput,
  NotificationPreferenceCategory,
  NotificationPreferences,
  NotificationRecord,
  OfferRecord,
  OfferRegistrationStatus,
  OpenDisputeInput,
  OwnedTaskRecord,
  PayoutMethodSummary,
  PortfolioItemRecord,
  PsgcBarangay,
  PsgcCity,
  RegistrationActionOutcome,
  ReportEvidenceItem,
  RequestCompletionInput,
  RequestWithdrawalOutcome,
  ReviewInput,
  ReviewPairView,
  SelectOfferOutcome,
  SpecialtyOption,
  SubmitTaskerApplicationInput,
  SubmitTaskerApplicationOutcome,
  SubmitVerificationOutcome,
  SupportTicketRecord,
  TaskerApplicationRecord,
  TaskerWorkSnapshot,
  TaskQuestionRecord,
  TaskQuestionDefinition,
  TaskQuestionInputKind,
  TaskAnswerInput,
  TaskAnswerRecord,
  UpdateProfileOutcome,
  VerificationCaseRecord,
  VerificationDocumentKind,
  WithdrawalRecord,
} from "./types";

/** Row shapes for the offer-registration reads. */
type RawRegistrationStatusRow = {
  readonly mobile_complete: boolean;
  readonly bank_complete: boolean;
  readonly billing_complete: boolean;
};
type RawPayoutMethodRow = {
  readonly id: string;
  readonly provider: string;
  readonly masked_label: string;
  readonly status: string;
};
type RawBillingAddressRow = {
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly region: string | null;
  readonly postal_code: string | null;
  readonly country: string;
};
type RawPsgcCityRow = {
  readonly code: string;
  readonly city6: string;
  readonly name: string;
  readonly province_name: string | null;
  readonly is_city: boolean;
};
type RawPsgcBarangayRow = {
  readonly code: string;
  readonly name: string;
  readonly city6: string;
};
function mapPsgcCity(row: RawPsgcCityRow): PsgcCity {
  return {
    code: row.code,
    city6: row.city6,
    name: row.name,
    provinceName: row.province_name,
    isCity: row.is_city,
  };
}
function mapPsgcBarangay(row: RawPsgcBarangayRow): PsgcBarangay {
  return { code: row.code, name: row.name, city6: row.city6 };
}

/** `public.verification_cases` row as returned by the self-service RPCs. */
type VerificationCaseRow = {
  readonly id: string;
  readonly status: VerificationCaseRecord["status"];
  readonly version: number;
  readonly submitted_at: string | null;
  readonly decided_at: string | null;
  readonly decision_reason: string | null;
};

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

/**
 * Monotonic suffix so each realtime subscription gets its OWN channel topic.
 * Supabase returns the same cached channel for an identical topic, and adding a
 * `postgres_changes` listener to an already-`subscribe()`d channel throws — so
 * independent subscribers (e.g. the notifications screen AND the header-badge
 * provider) must never share a topic.
 */
let realtimeChannelSeq = 0;

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
    // Read the display-safe cross-user projection, not `profiles` (self-only by
    // RLS): a counterpart's name must resolve on bookings, offers, and chat.
    const { data } = await this.client
      .from("public_profiles")
      .select("id,display_name")
      .in("id", unique);
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
    // The cards do not render `time_of_day`, so keep this batched list projection
    // compatible with environments where additive migration 0039 is still
    // rolling out. Detail/edit reads continue to select it so a chosen time is
    // never silently discarded.
    const { data, error } = await this.client
      .from("tasks")
      .select(
        "id,client_id,category_id,title,description,budget_centavos,scheduled_for,same_day,status,published_at,created_at,updated_at",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    fail("listMyTasks", error);
    const rows = (data ?? []) as ReadonlyArray<RawTaskRow>;
    if (rows.length === 0) return [];

    // Batch every dependent table into a single `.in(task_id, ids)` request so
    // a page of N tasks costs ~6 requests total instead of N×7. Firing N×7
    // parallel requests trips Supabase's HTTP/2 concurrent-stream limit
    // (ERR_HTTP2_SERVER_REFUSED_STREAM) once a Client has several tasks.
    const ids = rows.map((row) => row.id);
    const [pubLocs, privLocs, mediaRes, questionRes, offerRes, bookingRes] = await Promise.all([
      this.client
        .from("task_locations_readable")
        .select("task_id,city_code,barangay_code,landmark,approximate_lat,approximate_lng")
        .in("task_id", ids),
      this.client
        .from("task_private_locations_readable")
        .select("task_id,exact_address,exact_lat,exact_lng")
        .in("task_id", ids),
      this.client
        .from("task_media")
        .select("task_id,id,kind,storage_path,sort_order")
        .in("task_id", ids)
        .order("sort_order", { ascending: true }),
      this.client.from("task_questions").select("task_id").in("task_id", ids),
      this.client.from("offers").select("task_id,id,status").in("task_id", ids),
      this.client
        .from("bookings")
        .select("task_id,id,accepted_offer_id,status,created_at")
        .in("task_id", ids)
        .order("created_at", { ascending: false }),
    ]);
    fail("listMyTasks:publicLocations", pubLocs.error);
    fail("listMyTasks:privateLocations", privLocs.error);
    fail("listMyTasks:media", mediaRes.error);
    fail("listMyTasks:questions", questionRes.error);
    fail("listMyTasks:offers", offerRes.error);
    fail("listMyTasks:bookings", bookingRes.error);

    const pubById = new Map<string, RawPublicLocRow>();
    for (const r of (pubLocs.data ?? []) as ReadonlyArray<RawPublicLocRow>)
      pubById.set(r.task_id, r);
    const privById = new Map<string, RawPrivateLocRow>();
    for (const r of (privLocs.data ?? []) as ReadonlyArray<RawPrivateLocRow>)
      privById.set(r.task_id, r);

    const mediaByTask = new Map<string, RawTaskMediaRow[]>();
    for (const r of (mediaRes.data ?? []) as ReadonlyArray<RawTaskMediaRow>) {
      const bucket = mediaByTask.get(r.task_id) ?? [];
      bucket.push(r);
      mediaByTask.set(r.task_id, bucket);
    }
    const questionCountByTask = new Map<string, number>();
    for (const r of (questionRes.data ?? []) as ReadonlyArray<{ task_id: string }>) {
      questionCountByTask.set(r.task_id, (questionCountByTask.get(r.task_id) ?? 0) + 1);
    }
    const offersByTask = new Map<string, { id: string; status: string }[]>();
    for (const r of (offerRes.data ?? []) as ReadonlyArray<{
      task_id: string;
      id: string;
      status: string;
    }>) {
      const bucket = offersByTask.get(r.task_id) ?? [];
      bucket.push({ id: r.id, status: r.status });
      offersByTask.set(r.task_id, bucket);
    }
    // Ordered created_at desc, so the first booking seen per task is the latest.
    const latestBookingByTask = new Map<string, RawLatestBookingRow>();
    for (const r of (bookingRes.data ?? []) as ReadonlyArray<
      RawLatestBookingRow & { task_id: string }
    >) {
      if (!latestBookingByTask.has(r.task_id)) {
        latestBookingByTask.set(r.task_id, {
          id: r.id,
          accepted_offer_id: r.accepted_offer_id,
          status: r.status,
        });
      }
    }

    return rows.map((row) =>
      assembleOwnedTask(
        row,
        pubById.get(row.id) ?? null,
        privById.get(row.id) ?? null,
        mediaByTask.get(row.id) ?? [],
        deriveOwnedTaskCounts(
          questionCountByTask.get(row.id) ?? 0,
          offersByTask.get(row.id) ?? [],
          latestBookingByTask.get(row.id) ?? null,
        ),
      ),
    );
  }

  async getOwnedTask(taskId: TaskId, clientId: string): Promise<OwnedTaskRecord | null> {
    // `*` is intentional for this owner-scoped row read: PostgREST includes
    // `time_of_day` when migration 0039 is present and simply omits it on a
    // legacy schema. Exact location/contact data lives in separate protected
    // relations, while the client filter and RLS still gate this task row.
    const { data, error } = await this.client
      .from("tasks")
      .select("*")
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
        // `*` for the same reason `getOwnedTask` uses it on `tasks`: PostgREST
        // includes `dropoff_landmark` once migration 0041 is present and simply
        // omits it on a schema where it is still rolling out, whereas naming the
        // column explicitly makes the whole request fail with 400 until then.
        // Every column of this view is public by construction, so `*` widens
        // nothing — the private address lives in a separate relation.
        .select("*")
        .eq("task_id", row.id)
        .maybeSingle(),
      this.client
        .from("task_private_locations_readable")
        .select("task_id,exact_address,exact_lat,exact_lng")
        .eq("task_id", row.id)
        .maybeSingle(),
      this.client
        .from("task_media")
        .select("task_id,id,kind,storage_path,sort_order")
        .eq("task_id", row.id)
        .order("sort_order", { ascending: true }),
      this.ownedTaskCounts(row.id),
    ]);

    return assembleOwnedTask(
      row,
      (publicLoc.data as RawPublicLocRow | null) ?? null,
      (privateLoc.data as RawPrivateLocRow | null) ?? null,
      (media.data ?? []) as ReadonlyArray<RawTaskMediaRow>,
      counts,
    );
  }

  private async ownedTaskCounts(taskId: string): Promise<OwnedTaskCounts> {
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
    const bookingRow = booking.data as RawLatestBookingRow | null;
    return deriveOwnedTaskCounts(questions.count ?? 0, offerRows, bookingRow);
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
      time_of_day: draft.timeOfDay ?? null,
      location_type: draft.locationType ?? "in_person",
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
          dropoff_landmark: draft.dropoffLandmark ?? null,
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

    await this.syncTaskMedia(taskId, draft.media);
    await this.syncTaskAnswers(taskId, draft.answers);

    const saved = await this.getOwnedTask(taskId as TaskId, authedId);
    if (!saved) {
      throw new MarketplaceRequestError("saveDraftTask", "Saved task could not be read back.");
    }
    return saved;
  }

  /**
   * Bring `task_answers` in line with the draft's answer list.
   *
   * `undefined` means the caller did not collect answers at all (the single-page
   * edit form), so stored answers are left exactly as they are. An empty array
   * is an explicit "no answers" and does clear them.
   */
  private async syncTaskAnswers(
    taskId: string,
    answers: ReadonlyArray<TaskAnswerInput> | undefined,
  ): Promise<void> {
    if (!answers) return;

    // Blank answers are absences, not values: an optional question left empty
    // should not create a row.
    const provided = answers
      .map((entry) => ({ questionId: entry.questionId, answer: entry.answer.trim() }))
      .filter((entry) => entry.answer.length > 0);

    const { data, error } = await this.client
      .from("task_answers")
      .select("id,question_id")
      .eq("task_id", taskId);
    fail("saveDraftTask.answers", error);

    const existing = (data ?? []) as ReadonlyArray<{ id: string; question_id: string }>;
    const keep = new Set(provided.map((entry) => entry.questionId));
    const staleIds = existing.filter((row) => !keep.has(row.question_id)).map((row) => row.id);
    if (staleIds.length > 0) {
      const { error: deleteError } = await this.client
        .from("task_answers")
        .delete()
        .in("id", staleIds);
      fail("saveDraftTask.answers.remove", deleteError);
    }

    if (provided.length > 0) {
      const { error: upsertError } = await this.client.from("task_answers").upsert(
        provided.map((entry) => ({
          task_id: taskId,
          question_id: entry.questionId,
          answer: entry.answer,
        })),
        { onConflict: "task_id,question_id" },
      );
      fail("saveDraftTask.answers.write", upsertError);
    }
  }

  /**
   * Bring `task_media` in line with the draft's attachment list.
   *
   * Rows are matched on `storage_path` and only the difference is written. A
   * delete-all-then-reinsert would be simpler but would reset
   * `moderation_status`, silently un-reviewing photos an Admin had already
   * cleared every time the owner edited an unrelated field.
   */
  private async syncTaskMedia(
    taskId: string,
    media: ReadonlyArray<{ readonly storagePath: string; readonly kind: "image" | "video" }>,
  ): Promise<void> {
    const { data, error } = await this.client
      .from("task_media")
      .select("id,storage_path")
      .eq("task_id", taskId);
    fail("saveDraftTask.media", error);

    const existing = (data ?? []) as ReadonlyArray<{ id: string; storage_path: string }>;
    const keep = new Set(media.map((item) => item.storagePath));
    const known = new Set(existing.map((row) => row.storage_path));

    const removedIds = existing.filter((row) => !keep.has(row.storage_path)).map((row) => row.id);
    if (removedIds.length > 0) {
      const { error: deleteError } = await this.client
        .from("task_media")
        .delete()
        .in("id", removedIds);
      fail("saveDraftTask.media.remove", deleteError);
    }

    const added = media
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !known.has(item.storagePath));
    if (added.length > 0) {
      const { error: insertError } = await this.client.from("task_media").insert(
        added.map(({ item, index }) => ({
          task_id: taskId,
          storage_path: item.storagePath,
          kind: item.kind,
          sort_order: index,
        })),
      );
      fail("saveDraftTask.media.add", insertError);
    }
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

  /**
   * Retire an unbooked task through `cancel_own_task` (0040).
   *
   * Authorization, the DRAFT/OPEN restriction, offer rejection, and idempotency
   * are all the RPC's job; the `clientId` argument is only for the caller's own
   * filtering. The raised message is mapped to something a Client can act on
   * rather than surfacing raw SQL text.
   */
  async cancelOwnTask(
    taskId: TaskId,
    _clientId: string,
  ): Promise<{ readonly ok: boolean; readonly reason?: string }> {
    const { error } = await this.client.rpc("cancel_own_task", {
      p_task_id: taskId,
      p_idempotency_key: `cancel_task_${taskId}`,
    });
    if (!error) return { ok: true };

    const message = error.message.toUpperCase();
    if (message.includes("FORBIDDEN") || message.includes("PRIVILEGE")) {
      return { ok: false, reason: "Only the task owner may cancel this task." };
    }
    if (message.includes("INVALID_STATE")) {
      return {
        ok: false,
        reason: "This task can no longer be cancelled here. Open the booking to manage it.",
      };
    }
    if (message.includes("NOT_FOUND")) {
      return { ok: false, reason: "This task no longer exists." };
    }
    return { ok: false, reason: "Could not cancel this task. Please try again." };
  }

  // =========================================================================
  // Public discovery
  // =========================================================================

  /**
   * Open-task search over the `public_task_feed` view.
   *
   * Goes through `search_task_feed` (migration 0024) rather than selecting from
   * the view, because radius filtering needs `st_dwithin` and PostgREST's filter
   * grammar cannot express it. The function is `security invoker`, so the same
   * RLS still decides which rows are visible; it only adds filtering, distance,
   * and ordering.
   *
   * Distance ordering does NOT depend on the map provider — the coordinates come
   * from `task_public_locations`. A search with no origin simply returns a null
   * distance and orders by recency.
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
    /** Only tasks with zero offers (migration 0047 p_no_offers_only). */
    noOffersOnly?: boolean;
    nearLat?: number;
    nearLng?: number;
    radiusKm?: number;
    sort?: "newest" | "highest_budget" | "nearby";
  }): Promise<Paginated<PublicTaskFeedItem>> {
    const pageSize = Math.min(Math.max(1, Math.trunc(input.pageSize)), 100);
    const page = Math.max(1, Math.trunc(input.page));

    // Keyword still goes through the shared sanitizer: it is interpolated into
    // an ilike pattern server-side, so `%` and `_` must not survive as wildcards.
    const keyword = input.keyword ? sanitizeKeyword(input.keyword) : "";

    const { data, error } = await this.client.rpc("search_task_feed", {
      p_keyword: keyword.length > 0 ? keyword : null,
      p_category_id: input.categoryId ?? null,
      p_city_code: input.cityCode ?? null,
      p_barangay_code: input.barangayCode ?? null,
      p_min_budget: input.minBudgetCentavos ?? null,
      p_max_budget: input.maxBudgetCentavos ?? null,
      p_scheduled_from: input.scheduledFrom ?? null,
      p_scheduled_to: input.scheduledTo ?? null,
      p_same_day_only: input.sameDayOnly === true,
      p_no_offers_only: input.noOffersOnly === true,
      p_near_lat: input.nearLat ?? null,
      p_near_lng: input.nearLng ?? null,
      p_radius_km: input.radiusKm ?? null,
      p_sort: input.sort ?? "newest",
      p_page: page,
      p_page_size: pageSize,
    });
    fail("searchOpenTasks", error);

    const rows = (data ?? []) as ReadonlyArray<RawTaskFeedRow & { total_count: number | string }>;
    const items = rows.map(mapTaskFeedRow);
    // `total_count` is a window count over the filtered set, repeated on every
    // row. An empty page legitimately has no total, which is zero.
    const total = rows.length > 0 ? Number(rows[0]?.total_count ?? 0) : 0;
    return paginate(items, page, pageSize, total);
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

  async answerQuestion(
    questionId: string,
    taskId: TaskId,
    clientId: string,
    answer: string,
  ): Promise<TaskQuestionRecord> {
    // Verify the task belongs to this client before allowing an answer.
    const { data: taskRow, error: taskErr } = await this.client
      .from("tasks")
      .select("client_id")
      .eq("id", taskId)
      .maybeSingle();
    fail("answerQuestion:getTask", taskErr);
    if (!taskRow || taskRow.client_id !== clientId) {
      throw new Error("Forbidden: only the task owner may answer questions.");
    }

    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("task_questions")
      .update({ answer, answered_at: now })
      .eq("id", questionId)
      .eq("task_id", taskId)
      .select("id,task_id,author_id,body,answer,created_at")
      .single();
    fail("answerQuestion", error);
    const row = data as {
      id: string;
      task_id: string;
      author_id: string;
      body: string;
      answer: string | null;
      created_at: string;
    };
    const names = await this.displayNames([row.author_id]);
    return {
      id: row.id as TaskQuestionId,
      taskId: row.task_id as TaskId,
      authorId: row.author_id as UserId,
      authorDisplayName: this.nameOf(names, row.author_id),
      body: row.body,
      answer: row.answer,
      createdAt: row.created_at,
    };
  }

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
   * Provider-authoritative checkout. Creates a hosted checkout session through
   * the `payment-checkout` Edge Function (which holds the provider secret key
   * server-side) and returns its URL. Fails closed — surfaced as
   * `CHECKOUT_UNAVAILABLE` — when no approved provider is configured, so the UI
   * never implies money moved. The booking is only ever confirmed by the
   * provider webhook, never by this call.
   */
  async createCheckoutSession(
    bookingId: BookingId,
    clientId: string,
  ): Promise<CheckoutSessionRecord> {
    const authedId = await this.currentUserId();
    if (!authedId || authedId !== clientId) {
      throw new MarketplaceRequestError(
        "createCheckoutSession",
        "You are not signed in as this user.",
      );
    }
    const { data, error } = await this.client.functions.invoke("payment-checkout", {
      body: { bookingId },
    });
    if (error) {
      throw new MarketplaceRequestError("createCheckoutSession", CHECKOUT_UNAVAILABLE);
    }
    const session = (
      data as {
        success?: boolean;
        data?: {
          bookingId: string;
          paymentIntentId: string;
          providerReference: string;
          checkoutUrl: string;
          amountCentavos: number;
          mode: "synthetic" | "sandbox" | "live";
        };
      } | null
    )?.data;
    if (!session?.checkoutUrl || !session.providerReference) {
      throw new MarketplaceRequestError("createCheckoutSession", CHECKOUT_UNAVAILABLE);
    }
    return {
      bookingId: session.bookingId as BookingId,
      paymentIntentId: session.paymentIntentId,
      providerReference: session.providerReference,
      checkoutUrl: session.checkoutUrl,
      amountCentavos: session.amountCentavos,
      synthetic: false,
      mode: session.mode,
    };
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
      .select(
        "id,task_id,client_id,tasker_id,agreed_centavos,status,idempotency_key,created_at,updated_at",
      )
      .or(`client_id.eq.${userId},tasker_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    fail("listMyBookings", error);
    return this.buildBookings((data ?? []) as ReadonlyArray<RawBookingRow>, userId);
  }

  async getBooking(bookingId: BookingId, viewerId: string): Promise<BookingRecord | null> {
    const { data, error } = await this.client
      .from("bookings")
      .select(
        "id,task_id,client_id,tasker_id,agreed_centavos,status,idempotency_key,created_at,updated_at",
      )
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
      (
        (privateLocs.data ?? []) as ReadonlyArray<{
          task_id: string;
          exact_address: string;
          exact_lat: number;
          exact_lng: number;
        }>
      ).map((loc) => [loc.task_id, loc]),
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
        storagePath: isNote ? null : item.storage_path,
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

    // `evidence` has no note column, so a text-only item is stored as a
    // `note:` sentinel in storage_path. A file item stores the real object key.
    // An item that claims to be a file but has no uploaded object is dropped
    // rather than recorded as an attachment nobody can open.
    const evidenceRows = [
      ...(input.note.trim().length > 0
        ? [
            {
              owner_id: authedId,
              resource_type: "booking",
              resource_id: input.bookingId,
              storage_path: `note:${input.note.trim()}`,
            },
          ]
        : []),
      ...input.evidence
        .map((item) =>
          item.kind === "note" ? `note:${item.note ?? ""}` : (item.storagePath ?? null),
        )
        .filter((path): path is string => path !== null)
        .map((path) => ({
          owner_id: authedId,
          resource_type: "booking",
          resource_id: input.bookingId,
          storage_path: path,
        })),
    ];
    if (evidenceRows.length > 0) {
      const { error: evidenceError } = await this.client.from("evidence").insert(evidenceRows);
      fail("requestCompletion.evidence", evidenceError);
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

  async cancelUnpaidBooking(bookingId: BookingId, _clientId: string): Promise<{ ok: boolean }> {
    // Authorization is the RPC's job (it checks the booking's client against
    // auth.uid()); the clientId argument is only for the caller's own filtering.
    const { error } = await this.client.rpc("cancel_unpaid_booking", {
      p_booking_id: bookingId,
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

  async getDisputeForBooking(
    bookingId: BookingId,
    _viewerId: string,
  ): Promise<DisputeRecord | null> {
    // `disputes_select` RLS admits only a booking participant (or the opener),
    // so the session JWT is the authorization gate — a non-participant simply
    // sees no row. Newest first in case a booking ever carried more than one.
    const { data, error } = await this.client
      .from("disputes")
      .select("id,booking_id,opened_by,reason,status,created_at")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    fail("getDisputeForBooking", error);
    return data ? mapDispute(data as Parameters<typeof mapDispute>[0]) : null;
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

  async getTaskerWorkSnapshot(taskerId: string): Promise<TaskerWorkSnapshot> {
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
      completionRequested: asTasker.filter((booking) => booking.status === "COMPLETION_REQUESTED"),
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
  // Offer registration ("Finish registration" gate)
  // =========================================================================

  async getOfferRegistrationStatus(userId: string): Promise<OfferRegistrationStatus> {
    const authedId = await this.currentUserId();
    if (!authedId || authedId !== userId) {
      return { mobileComplete: false, bankComplete: false, billingComplete: false };
    }
    const { data, error } = await this.client.rpc("my_offer_registration_status");
    fail("getOfferRegistrationStatus", error);
    const row = ((data ?? []) as ReadonlyArray<RawRegistrationStatusRow>)[0];
    return {
      mobileComplete: row?.mobile_complete ?? false,
      bankComplete: row?.bank_complete ?? false,
      billingComplete: row?.billing_complete ?? false,
    };
  }

  async saveRegistrationMobile(userId: string, mobile: string): Promise<RegistrationActionOutcome> {
    const authedId = await this.currentUserId();
    if (!authedId || authedId !== userId)
      return { ok: false, reason: "Not signed in as this user." };
    const { error } = await this.client.rpc("save_registration_mobile", { p_mobile: mobile });
    if (error) return { ok: false, reason: detailOf(error.message) };
    return { ok: true };
  }

  async listPayoutMethods(userId: string): Promise<ReadonlyArray<PayoutMethodSummary>> {
    const { data, error } = await this.client
      .from("payout_methods")
      .select("id,provider,masked_label,status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    fail("listPayoutMethods", error);
    return ((data ?? []) as ReadonlyArray<RawPayoutMethodRow>).map((row) => ({
      id: row.id,
      provider: row.provider,
      maskedLabel: row.masked_label,
      status: row.status === "disabled" ? "disabled" : "active",
    }));
  }

  async addPayoutMethod(
    userId: string,
    input: AddPayoutMethodInput,
  ): Promise<RegistrationActionOutcome> {
    const authedId = await this.currentUserId();
    if (!authedId || authedId !== userId)
      return { ok: false, reason: "Not signed in as this user." };
    const { error } = await this.client.rpc("add_payout_method", {
      p_provider: input.provider,
      p_masked_label: input.maskedLabel,
    });
    if (error) return { ok: false, reason: detailOf(error.message) };
    return { ok: true };
  }

  async getBillingAddress(userId: string): Promise<BillingAddressRecord | null> {
    const { data, error } = await this.client
      .from("billing_addresses")
      .select("line1,line2,city,region,postal_code,country")
      .eq("user_id", userId)
      .maybeSingle();
    fail("getBillingAddress", error);
    if (!data) return null;
    const row = data as RawBillingAddressRow;
    return {
      line1: row.line1,
      line2: row.line2,
      city: row.city,
      region: row.region,
      postalCode: row.postal_code,
      country: row.country,
    };
  }

  async saveBillingAddress(
    userId: string,
    input: BillingAddressInput,
  ): Promise<RegistrationActionOutcome> {
    const authedId = await this.currentUserId();
    if (!authedId || authedId !== userId)
      return { ok: false, reason: "Not signed in as this user." };
    const { error } = await this.client.rpc("save_billing_address", {
      p_line1: input.line1,
      p_line2: input.line2 ?? null,
      p_city: input.city,
      p_region: input.region ?? null,
      p_postal_code: input.postalCode ?? null,
      p_country: input.country ?? "PH",
    });
    if (error) return { ok: false, reason: detailOf(error.message) };
    return { ok: true };
  }

  // =========================================================================
  // PSGC localities (canonical city/barangay lookup — decision D14)
  // =========================================================================

  async searchCities(keyword: string): Promise<ReadonlyArray<PsgcCity>> {
    const term = keyword.trim();
    let query = this.client
      .from("psgc_cities_municipalities")
      .select("code,city6,name,province_name,is_city")
      .order("name")
      .limit(25);
    if (term.length > 0) query = query.ilike("name", `%${term}%`);
    const { data, error } = await query;
    fail("searchCities", error);
    return ((data ?? []) as ReadonlyArray<RawPsgcCityRow>).map(mapPsgcCity);
  }

  async searchBarangays(city6: string, keyword: string): Promise<ReadonlyArray<PsgcBarangay>> {
    const term = keyword.trim();
    let query = this.client
      .from("psgc_barangays")
      .select("code,name,city6")
      .eq("city6", city6)
      .order("name")
      .limit(40);
    if (term.length > 0) query = query.ilike("name", `%${term}%`);
    const { data, error } = await query;
    fail("searchBarangays", error);
    return ((data ?? []) as ReadonlyArray<RawPsgcBarangayRow>).map(mapPsgcBarangay);
  }

  async getCityByCode(city6: string): Promise<PsgcCity | null> {
    const { data, error } = await this.client
      .from("psgc_cities_municipalities")
      .select("code,city6,name,province_name,is_city")
      .eq("city6", city6)
      .limit(1)
      .maybeSingle();
    fail("getCityByCode", error);
    return data ? mapPsgcCity(data as RawPsgcCityRow) : null;
  }

  async getBarangayByCode(code: string): Promise<PsgcBarangay | null> {
    const { data, error } = await this.client
      .from("psgc_barangays")
      .select("code,name,city6")
      .eq("code", code)
      .maybeSingle();
    fail("getBarangayByCode", error);
    return data ? mapPsgcBarangay(data as RawPsgcBarangayRow) : null;
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
        storagePath: item.storage_path,
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
      storagePath: string;
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
      // Records the key of the object already uploaded to `chat-media`. The
      // previous synthesised path pointed at nothing, so an attachment could
      // never be opened.
      const { error: mediaError } = await this.client.from("message_media").insert(
        attachments.map((item) => ({
          message_id: row.id,
          storage_path: item.storagePath,
          kind: item.kind,
          mime_type: item.mimeType,
          size_bytes: item.sizeBytes,
        })),
      );
      if (mediaError) {
        throw new MarketplaceRequestError("sendMessage.media", detailOf(mediaError.message));
      }
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
        storagePath: item.storagePath,
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

  /**
   * Stream new messages for a conversation (migration 0022 publication).
   *
   * `postgres_changes` re-applies the table's SELECT policy for each subscriber,
   * so this cannot deliver a conversation the viewer is not a participant of —
   * the filter narrows the stream, RLS is still what authorizes it.
   */
  subscribeToConversation(
    conversationId: ConversationId,
    _viewerId: string,
    onChange: () => void,
  ): () => void {
    const channel = this.client
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => onChange(),
      )
      .subscribe();

    return () => {
      void this.client.removeChannel(channel);
    };
  }

  /**
   * Conversation summaries for the Bookings list (migration 0046).
   *
   * `conversation_summaries()` takes no argument: it is scoped to `auth.uid()`
   * inside the function, so the `userId` here only keeps the port signature
   * uniform and can never widen what is returned.
   */
  async listConversationSummaries(_userId: string): Promise<ReadonlyArray<ConversationSummary>> {
    const { data, error } = await this.client.rpc("conversation_summaries");
    fail("listConversationSummaries", error);
    return ((data ?? []) as ReadonlyArray<ConversationSummaryRow>).map(toConversationSummary);
  }

  async markConversationRead(conversationId: ConversationId, _viewerId: string): Promise<void> {
    const { error } = await this.client.rpc("mark_conversation_read", {
      p_conversation_id: conversationId,
    });
    // A non-participant is refused by the RPC. Surfacing that would only tell
    // the caller something they cannot act on — and the screen calling this has
    // already loaded the conversation, so a failure here just means the badge
    // clears on the next successful open.
    if (error) return;
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

  /**
   * Reading the `reviews` rows directly cannot honour the reveal deadline: RLS
   * lets a participant select both rows, so blindness would depend on this
   * client choosing not to show one. `get_review_pair` (migration 0021) decides
   * instead — it reveals anything now due and withholds the counterpart row
   * entirely until it is revealed, so the hidden text never reaches the device.
   */
  async getReviewPair(bookingId: BookingId, _viewerId: string): Promise<ReviewPairView | null> {
    const { data, error } = await this.client.rpc("get_review_pair", {
      p_booking_id: bookingId,
    });
    if (error || data === null) {
      return {
        bookingId,
        myReview: null,
        counterpartReview: null,
        bothSubmitted: false,
        revealDeadline: null,
      };
    }
    const payload = data as {
      reveal_deadline: string | null;
      both_submitted: boolean;
      my_review: Parameters<typeof mapReview>[0] | null;
      counterpart_review: Parameters<typeof mapReview>[0] | null;
    };
    return {
      bookingId,
      myReview: payload.my_review ? mapReview(payload.my_review) : null,
      counterpartReview: payload.counterpart_review ? mapReview(payload.counterpart_review) : null,
      bothSubmitted: payload.both_submitted === true,
      revealDeadline: payload.reveal_deadline ?? null,
    };
  }

  // =========================================================================
  // Identity verification
  // =========================================================================

  async startVerification(): Promise<VerificationCaseRecord> {
    const { data, error } = await this.client.rpc("start_verification");
    fail("startVerification", error);
    const row = (Array.isArray(data) ? data[0] : data) as VerificationCaseRow | null;
    if (!row)
      throw new MarketplaceRequestError("startVerification", "No verification case returned.");
    return this.hydrateVerificationCase(row);
  }

  async addVerificationDocument(input: {
    caseId: string;
    kind: VerificationDocumentKind;
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<AddVerificationDocumentOutcome> {
    const { data, error } = await this.client
      .from("verification_documents")
      .insert({
        case_id: input.caseId,
        kind: input.kind,
        storage_path: input.storagePath,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
      })
      .select("id,kind,storage_path,created_at")
      .single();
    if (error) return { ok: false, reason: detailOf(error.message) };
    const row = data as {
      id: string;
      kind: VerificationDocumentKind;
      storage_path: string;
      created_at: string;
    };
    return {
      ok: true,
      document: {
        id: row.id,
        kind: row.kind,
        storagePath: row.storage_path,
        createdAt: row.created_at,
      },
    };
  }

  async removeVerificationDocument(input: {
    caseId: string;
    documentId: string;
  }): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
    const { data, error } = await this.client
      .from("verification_documents")
      .delete()
      .eq("id", input.documentId)
      .eq("case_id", input.caseId)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, reason: detailOf(error.message) };
    if (!data) {
      return {
        ok: false,
        reason: "This document cannot be removed from the current verification case.",
      };
    }
    return { ok: true };
  }

  async submitVerification(): Promise<SubmitVerificationOutcome> {
    const { data, error } = await this.client.rpc("submit_verification");
    if (error) return { ok: false, reason: detailOf(error.message) };
    const row = (Array.isArray(data) ? data[0] : data) as VerificationCaseRow | null;
    if (!row) return { ok: false, reason: "Verification could not be submitted." };
    return { ok: true, case: await this.hydrateVerificationCase(row) };
  }

  /**
   * Attach the documents that count toward the current attempt.
   *
   * Files added before the last decision are excluded because
   * `submit_verification` ignores them too; listing them would let a
   * resubmission look ready when the server will refuse it.
   */
  private async hydrateVerificationCase(row: VerificationCaseRow): Promise<VerificationCaseRecord> {
    const { data, error } = await this.client
      .from("verification_documents")
      .select("id,kind,storage_path,created_at")
      .eq("case_id", row.id)
      .order("created_at", { ascending: true });
    fail("startVerification.documents", error);

    const since = row.decided_at ? new Date(row.decided_at).getTime() : Number.NEGATIVE_INFINITY;
    const documents = (
      (data ?? []) as ReadonlyArray<{
        id: string;
        kind: string;
        storage_path: string;
        created_at: string;
      }>
    )
      .filter((doc) => new Date(doc.created_at).getTime() > since)
      .map((doc) => ({
        id: doc.id,
        kind: doc.kind as VerificationDocumentKind,
        storagePath: doc.storage_path,
        createdAt: doc.created_at,
      }));

    return {
      id: row.id,
      status: row.status,
      version: row.version,
      submittedAt: row.submitted_at,
      decidedAt: row.decided_at,
      decisionReason: row.decision_reason,
      documents,
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

  async unreadNotificationCount(userId: string): Promise<number> {
    // `head: true` + `count: exact` returns only the count (no rows), so the
    // global header badge never transfers the whole notification list.
    const { count, error } = await this.client
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);
    fail("unreadNotificationCount", error);
    return count ?? 0;
  }

  /**
   * Stream notifications addressed to this user (migration 0022 publication).
   *
   * The `notifications` SELECT policy is `user_id = auth.uid()`, so the filter
   * and the policy agree; a tampered id would just yield an empty stream.
   */
  async registerPushDevice(input: {
    userId: string;
    platform: "ios" | "android";
    tokenReference: string;
  }): Promise<void> {
    // RLS (`devices_own`) already restricts writes to the caller's own rows;
    // the userId is used for the upsert key, not as the authorization decision.
    const { error } = await this.client.from("devices").upsert(
      {
        user_id: input.userId,
        platform: input.platform,
        token_reference: input.tokenReference,
        enabled: true,
      },
      { onConflict: "user_id,token_reference" },
    );
    fail("registerPushDevice", error);
  }

  async disablePushDevice(userId: string, tokenReference: string): Promise<void> {
    const { error } = await this.client
      .from("devices")
      .update({ enabled: false })
      .eq("user_id", userId)
      .eq("token_reference", tokenReference);
    fail("disablePushDevice", error);
  }

  subscribeToNotifications(userId: string, onChange: () => void): () => void {
    // A UNIQUE topic per call: multiple independent subscribers (the
    // notifications screen and the header-badge provider) must not share a
    // channel, or the second `.on(...)` lands on an already-subscribed channel.
    realtimeChannelSeq += 1;
    const channel = this.client
      .channel(`notifications:${userId}:${realtimeChannelSeq}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => onChange(),
      )
      .subscribe();

    return () => {
      void this.client.removeChannel(channel);
    };
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
    const { error } = await this.client.from("notification_preferences").upsert(
      {
        user_id: userId,
        category,
        in_app: next.inApp,
        push: next.push,
      },
      { onConflict: "user_id,category" },
    );
    // Swallowing this used to hide a real defect: the table's CHECK constraint
    // rejected the 'reviews' category, so the toggle silently reverted.
    fail("setNotificationPreference", error);
    return this.getNotificationPreferences(userId);
  }

  // =========================================================================
  // Support
  // =========================================================================

  async submitReport(input: {
    reporterId: string;
    resourceType: "task" | "user" | "message" | "offer" | "booking";
    resourceId: string;
    category: "fraud" | "harassment" | "inappropriate" | "safety" | "spam" | "other";
    narrative: string;
  }): Promise<ReportRecord> {
    // Every rule (may I see this resource, is this a duplicate, is the narrative
    // in bounds) lives in `submit_report`; `reporterId` is not sent because the
    // RPC resolves the reporter from `auth.uid()` and would ignore it anyway.
    const { data, error } = await this.client.rpc("submit_report", {
      p_resource_type: input.resourceType,
      p_resource_id: input.resourceId,
      p_category: input.category,
      p_narrative: input.narrative,
    });
    if (error) throw new MarketplaceRequestError("submitReport", detailOf(error.message));
    const row = data as {
      id: string;
      reporter_id: string;
      resource_type: string;
      resource_id: string;
      category: string;
      narrative: string;
      status: string;
      created_at: string;
    };
    return {
      id: row.id as unknown as ReportRecord["id"],
      reporterId: row.reporter_id as UserId,
      resourceType: row.resource_type as ReportRecord["resourceType"],
      resourceId: row.resource_id,
      category: row.category as ReportRecord["category"],
      narrative: row.narrative,
      status: row.status as ReportRecord["status"],
      createdAt: row.created_at,
    };
  }

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
      storagePath?: string;
    }>;
  }): Promise<SupportTicketRecord> {
    // The concrete subject is persisted as first-class columns (migration 0037)
    // so a ticket opened from a booking stays linked to that booking on later
    // reads, instead of the id being lost the moment it is submitted. A non-uuid
    // subject id (the "general" sentinel) is stored as no subject at all.
    const subjectId = isSubjectUuid(input.subjectId) ? input.subjectId : null;
    const subjectType = subjectId ? input.subjectType : null;
    // `support_tickets.category` has no 'quality' member, so it is stored under
    // its 'task' home; the read path (`toAppSupportCategory`) maps it back so the
    // requester still sees exactly the category they chose.
    const dbCategory = input.category === "quality" ? "task" : input.category;
    const { data, error } = await this.client
      .from("support_tickets")
      .insert({
        user_id: input.reporterId,
        subject: `${input.subjectType} concern`,
        subject_type: subjectType,
        subject_id: subjectId,
        narrative: input.narrative,
        category: dbCategory,
        status: "OPEN",
      })
      .select(TICKET_COLUMNS)
      .single();
    if (error) throw new MarketplaceRequestError("submitSupportTicket", detailOf(error.message));
    const row = data as RawTicketRow;

    // Same encoding as completion evidence: a note becomes a `note:` sentinel,
    // a file records its real object key, and a file with no uploaded object is
    // dropped rather than stored as an unopenable attachment.
    const evidencePaths = input.evidence
      .map((item) =>
        item.kind === "note" ? `note:${item.note ?? ""}` : (item.storagePath ?? null),
      )
      .filter((path): path is string => path !== null);
    if (evidencePaths.length > 0) {
      const { error: evidenceError } = await this.client.from("evidence").insert(
        evidencePaths.map((path) => ({
          owner_id: input.reporterId,
          resource_type: "ticket",
          resource_id: row.id,
          storage_path: path,
        })),
      );
      fail("submitSupportTicket.evidence", evidenceError);
    }

    // Reflect the just-persisted attachments in the returned record. The row-id
    // prefix keeps the synthetic keys unique across tickets for list rendering.
    const evidence = evidencePaths.map((path, index) =>
      decodeTicketEvidence(`${row.id}:${index}`, path),
    );
    return this.mapTicket(row, evidence);
  }

  async listMySupportTickets(userId: string): Promise<ReadonlyArray<SupportTicketRecord>> {
    const { data, error } = await this.client
      .from("support_tickets")
      .select(TICKET_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    fail("listMySupportTickets", error);
    const rows = (data ?? []) as ReadonlyArray<RawTicketRow>;
    if (rows.length === 0) return [];

    // One batched read of the requester's own ticket evidence (RLS restricts
    // `evidence` to owner_id = the caller) so the history reflects real
    // attachment counts instead of always showing none.
    const evidenceByTicket = new Map<string, ReportEvidenceItem[]>();
    const { data: evidenceData, error: evidenceError } = await this.client
      .from("evidence")
      .select("id,resource_id,storage_path")
      .eq("resource_type", "ticket")
      .in(
        "resource_id",
        rows.map((row) => row.id),
      );
    fail("listMySupportTickets.evidence", evidenceError);
    for (const ev of (evidenceData ?? []) as ReadonlyArray<RawTicketEvidenceRow>) {
      const list = evidenceByTicket.get(ev.resource_id) ?? [];
      list.push(decodeTicketEvidence(ev.id, ev.storage_path));
      evidenceByTicket.set(ev.resource_id, list);
    }

    return rows.map((row) => this.mapTicket(row, evidenceByTicket.get(row.id) ?? []));
  }

  private mapTicket(
    row: RawTicketRow,
    evidence: ReadonlyArray<ReportEvidenceItem>,
  ): SupportTicketRecord {
    const status = ["OPEN", "PENDING", "RESOLVED", "CLOSED"].includes(row.status)
      ? (row.status as SupportTicketRecord["status"])
      : "OPEN";
    // Prefer the first-class column; fall back to the legacy subject-text prefix
    // for tickets created before migration 0037.
    const subjectType: "task" | "booking" =
      row.subject_type === "booking" || row.subject_type === "task"
        ? row.subject_type
        : row.subject.startsWith("booking")
          ? "booking"
          : "task";
    return {
      id: row.id as SupportTicketRecord["id"],
      reporterId: row.user_id as UserId,
      subjectType,
      subjectId: row.subject_id ?? "",
      category: toAppSupportCategory(row.category),
      narrative: row.narrative,
      evidence,
      status,
      createdAt: row.created_at,
      history: [],
    };
  }

  // =========================================================================
  // Service catalog
  // =========================================================================

  /**
   * Active categories from the real catalog. RLS exposes active rows to any
   * authenticated user, so this needs no privileged path — and the ids returned
   * are exactly what `tasks.category_id` must reference.
   */
  async listCategories(): Promise<ReadonlyArray<MarketplaceCategory>> {
    const { data, error } = await this.client
      .from("categories")
      .select("id,slug,name,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    fail("listCategories", error);
    return ((data ?? []) as ReadonlyArray<{ id: string; slug: string; name: string }>).map(
      (row) => ({ id: row.id, slug: row.slug, name: row.name }),
    );
  }

  async listCategoryQuestions(categoryId: string): Promise<ReadonlyArray<TaskQuestionDefinition>> {
    const { data, error } = await this.client
      .from("task_question_definitions")
      .select("id,category_id,code,label,input_kind,options,placeholder,required,sort_order")
      .eq("category_id", categoryId)
      .eq("active", true)
      .order("sort_order", { ascending: true });
    fail("listCategoryQuestions", error);
    type Row = {
      id: string;
      category_id: string;
      code: string;
      label: string;
      input_kind: TaskQuestionInputKind;
      options: unknown;
      placeholder: string | null;
      required: boolean;
      sort_order: number;
    };
    return ((data ?? []) as ReadonlyArray<Row>).map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      code: row.code,
      label: row.label,
      inputKind: row.input_kind,
      // `options` is a jsonb array; keep only the string entries so a malformed
      // row degrades to "no choices" instead of rendering `undefined` chips.
      options: Array.isArray(row.options)
        ? row.options.filter((option): option is string => typeof option === "string")
        : [],
      placeholder: row.placeholder,
      required: row.required,
      sortOrder: row.sort_order,
    }));
  }

  async listTaskAnswers(taskId: TaskId): Promise<ReadonlyArray<TaskAnswerRecord>> {
    const { data, error } = await this.client
      .from("task_answers")
      .select("answer,question_id,task_question_definitions(code,label,sort_order)")
      .eq("task_id", taskId);
    fail("listTaskAnswers", error);
    type DefinitionJoin = { code: string; label: string; sort_order: number };
    type Row = {
      answer: string;
      question_id: string;
      // A to-one embed: typed as an array by the client, an object at runtime.
      task_question_definitions: DefinitionJoin | ReadonlyArray<DefinitionJoin> | null;
    };
    return (
      ((data ?? []) as ReadonlyArray<Row>)
        .map((row) => {
          const joined = row.task_question_definitions;
          const definition = Array.isArray(joined) ? joined[0] : joined;
          return {
            questionId: row.question_id,
            code: definition?.code ?? "",
            label: definition?.label ?? "",
            answer: row.answer,
            sortOrder: definition?.sort_order ?? 0,
          };
        })
        // A retired question keeps its stored answer but has no label to show.
        .filter((row) => row.label.length > 0)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    );
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
      return {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Check the details entered.",
      };
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
    // Avatar is a storage object path we control (owner-partitioned), not free
    // user text, so it is applied directly rather than through the shared text
    // schema. RLS on `profiles` still gates the row to its owner.
    if (input.avatarPath !== undefined) fields["avatar_path"] = input.avatarPath;

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

  async getMyTaskerApplication(userId: string): Promise<TaskerApplicationRecord | null> {
    const { data, error } = await this.client
      .from("tasker_applications")
      .select("id,status,bio,experience,payout_provider,decision_reason,submitted_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    fail("getMyTaskerApplication", error);
    const row = data as {
      id: string;
      status: TaskerApplicationRecord["status"];
      bio: string;
      experience: string;
      payout_provider: string | null;
      decision_reason: string | null;
      submitted_at: string | null;
    } | null;
    if (!row) return null;

    const [specialtiesResult, areasResult] = await Promise.all([
      this.client.from("tasker_specialties").select("specialty_id").eq("user_id", userId),
      this.client
        .from("service_areas")
        .select("city_code,barangay_code")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1),
    ]);
    fail("getMyTaskerApplication", specialtiesResult.error);
    fail("getMyTaskerApplication", areasResult.error);
    const specialtyIds = (
      (specialtiesResult.data ?? []) as ReadonlyArray<{ specialty_id: string }>
    ).map((specialty) => specialty.specialty_id);
    const area = (
      (areasResult.data ?? []) as ReadonlyArray<{
        city_code: string;
        barangay_code: string | null;
      }>
    )[0];

    return {
      id: row.id,
      status: row.status,
      bio: row.bio,
      experience: row.experience,
      specialtyIds,
      cityCode: area?.city_code ?? null,
      barangayCode: area?.barangay_code ?? null,
      payoutProvider: row.payout_provider ?? null,
      decisionReason: row.decision_reason ?? null,
      submittedAt: row.submitted_at ?? null,
    };
  }

  async submitTaskerApplication(
    userId: string,
    input: SubmitTaskerApplicationInput,
  ): Promise<SubmitTaskerApplicationOutcome> {
    const authedId = await this.currentUserId();
    if (!authedId || authedId !== userId) {
      return { ok: false, message: "You are not signed in as this user." };
    }
    const { error } = await this.client.rpc("submit_tasker_application", {
      p_bio: input.bio,
      p_experience: input.experience,
      p_specialty_ids: [...new Set(input.specialtyIds)],
      p_city_code: input.cityCode,
      p_barangay_code: input.barangayCode ?? null,
      p_payout_provider: input.payoutProvider ?? null,
    });
    if (error) return { ok: false, message: detailOf(error.message) };
    const application = await this.getMyTaskerApplication(userId);
    if (!application) return { ok: false, message: "Application could not be read back." };
    return { ok: true, application };
  }

  async getPublicTaskerProfile(userId: string): Promise<PublicTaskerProfile | null> {
    return this.reads.getPublicTaskerProfile(userId as UserId);
  }

  async listMyPortfolio(userId: string): Promise<ReadonlyArray<PortfolioItemRecord>> {
    const { data, error } = await this.client
      .from("portfolio_items")
      .select("id,storage_path,caption,moderation_status,created_at")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    fail("listMyPortfolio", error);
    return (
      (data ?? []) as ReadonlyArray<{
        id: string;
        storage_path: string;
        caption: string | null;
        moderation_status: PortfolioItemRecord["moderationStatus"];
        created_at: string;
      }>
    ).map((row) => ({
      id: row.id,
      storagePath: row.storage_path,
      caption: row.caption,
      moderationStatus: row.moderation_status,
      createdAt: row.created_at,
    }));
  }

  /**
   * Another Tasker's approved work samples.
   *
   * The `moderation_status` filter is applied here as well as in RLS: the
   * policy already restricts a non-owner to approved rows, and asking for
   * exactly that keeps the intent explicit at the call site (and keeps the
   * result identical when the caller happens to be the owner).
   */
  async listPublicPortfolio(userId: string): Promise<ReadonlyArray<PortfolioItemRecord>> {
    const { data, error } = await this.client
      .from("portfolio_items")
      .select("id,storage_path,caption,moderation_status,created_at")
      .eq("user_id", userId)
      .eq("moderation_status", "APPROVED")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    fail("listPublicPortfolio", error);
    return (
      (data ?? []) as ReadonlyArray<{
        id: string;
        storage_path: string;
        caption: string | null;
        moderation_status: PortfolioItemRecord["moderationStatus"];
        created_at: string;
      }>
    ).map((row) => ({
      id: row.id,
      storagePath: row.storage_path,
      caption: row.caption,
      moderationStatus: row.moderation_status,
      createdAt: row.created_at,
    }));
  }

  async addPortfolioItem(
    userId: string,
    input: { storagePath: string; caption?: string | null },
  ): Promise<{ ok: boolean; reason?: string }> {
    const authedId = await this.currentUserId();
    if (!authedId || authedId !== userId) {
      return { ok: false, reason: "You are not signed in as this user." };
    }
    // Defense in depth: the object must live in the caller's own partition. The
    // storage RLS enforces this too, but rejecting here gives a clear message.
    if (!input.storagePath.startsWith(`${userId}/`)) {
      return { ok: false, reason: "That image is not in your storage area." };
    }
    const caption = input.caption?.trim() ? input.caption.trim().slice(0, 280) : null;
    const { error } = await this.client
      .from("portfolio_items")
      .insert({ user_id: userId, storage_path: input.storagePath, caption });
    if (error) return { ok: false, reason: detailOf(error.message) };
    return { ok: true };
  }

  async removePortfolioItem(userId: string, itemId: string): Promise<{ ok: boolean }> {
    const authedId = await this.currentUserId();
    if (!authedId || authedId !== userId) return { ok: false };
    const { data } = await this.client
      .from("portfolio_items")
      .select("storage_path")
      .eq("id", itemId)
      .eq("user_id", userId)
      .maybeSingle();
    const path = (data as { storage_path: string } | null)?.storage_path ?? null;
    const { error } = await this.client
      .from("portfolio_items")
      .delete()
      .eq("id", itemId)
      .eq("user_id", userId);
    if (error) return { ok: false };
    if (path) await this.client.storage.from("portfolios").remove([path]);
    return { ok: true };
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
  readonly time_of_day?: string | null;
  readonly location_type?: string | null;
  readonly status: string;
  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

type RawPublicLocRow = {
  readonly task_id: string;
  readonly city_code: string;
  readonly barangay_code: string;
  readonly landmark: string;
  readonly approximate_lat: number;
  readonly approximate_lng: number;
  readonly dropoff_landmark?: string | null;
};

type RawPrivateLocRow = {
  readonly task_id: string;
  readonly exact_address: string;
  readonly exact_lat: number;
  readonly exact_lng: number;
};

type RawTaskMediaRow = {
  readonly task_id: string;
  readonly id: string;
  readonly kind: string;
  readonly storage_path: string;
  readonly sort_order: number;
};

type RawLatestBookingRow = {
  readonly id: string;
  readonly accepted_offer_id: string | null;
  readonly status: string;
};

type OwnedTaskCounts = {
  readonly questionCount: number;
  readonly offerCount: number;
  readonly assignedOfferId: OfferId | null;
  readonly activeBookingId: BookingId | null;
};

/** Derive the owner-view counts from already-fetched offer/booking rows. */
function deriveOwnedTaskCounts(
  questionCount: number,
  offerRows: ReadonlyArray<{ id: string; status: string }>,
  bookingRow: RawLatestBookingRow | null,
): OwnedTaskCounts {
  const selected = offerRows.find((offer) => offer.status === "SELECTED");
  return {
    questionCount,
    // Withdrawn/rejected offers are not live competition for the Client.
    offerCount: offerRows.filter((offer) => offer.status === "SUBMITTED").length,
    assignedOfferId: (selected?.id ?? bookingRow?.accepted_offer_id ?? null) as OfferId | null,
    activeBookingId: (bookingRow?.id ?? null) as BookingId | null,
  };
}

/**
 * Assemble the owner view from a task row plus its already-fetched location,
 * media, and count data. Shared by the single-task path (`buildOwnedTask`) and
 * the batched list path (`listMyTasks`) so both produce identical records.
 */
function assembleOwnedTask(
  row: RawTaskRow,
  pub: RawPublicLocRow | null,
  priv: RawPrivateLocRow | null,
  mediaRows: ReadonlyArray<RawTaskMediaRow>,
  counts: OwnedTaskCounts,
): OwnedTaskRecord {
  const draft: DraftTaskInput = {
    categoryId: row.category_id,
    title: row.title,
    description: row.description,
    budgetCentavos: Number(row.budget_centavos),
    scheduledFor: row.scheduled_for,
    sameDay: row.same_day,
    timeOfDay: (row.time_of_day ?? null) as TaskTimeOfDay | null,
    locationType: (row.location_type ?? "in_person") as TaskLocationType,
    landmark: pub?.landmark ?? "",
    dropoffLandmark: pub?.dropoff_landmark ?? null,
    cityCode: pub?.city_code ?? "",
    barangayCode: pub?.barangay_code ?? "",
    approximateLat: Number(pub?.approximate_lat ?? 0),
    approximateLng: Number(pub?.approximate_lng ?? 0),
    exactAddress: priv?.exact_address ?? "",
    exactLat: Number(priv?.exact_lat ?? 0),
    exactLng: Number(priv?.exact_lng ?? 0),
    media: mediaRows.map((item) => ({
      id: item.id,
      kind: item.kind === "video" ? ("video" as const) : ("image" as const),
      fileName: item.storage_path.split("/").pop() ?? item.id,
      // `task_media` stores neither size nor MIME type; the owner UI shows the
      // file name and a thumbnail, so nothing here is invented to fill them.
      sizeBytes: 0,
      mimeType: item.kind === "video" ? "video/mp4" : "image/jpeg",
      storagePath: item.storage_path,
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

type RawTicketRow = {
  readonly id: string;
  readonly user_id: string;
  readonly subject: string;
  readonly subject_type: string | null;
  readonly subject_id: string | null;
  readonly narrative: string;
  readonly category: string;
  readonly status: string;
  readonly created_at: string;
};

type RawTicketEvidenceRow = {
  readonly id: string;
  readonly resource_id: string;
  readonly storage_path: string;
};

/** Columns read for every support-ticket projection (kept in one place so the
 * insert-returning and the list query never drift out of sync). */
const TICKET_COLUMNS =
  "id,user_id,subject,subject_type,subject_id,narrative,category,status,created_at" as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A support subject id is only persisted when it is a real uuid; the "general"
 * sentinel (and any other non-uuid) is stored as no subject at all. */
function isSubjectUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Map the database category domain
 * (`account | payment | task | safety | other`) back onto the four categories
 * the mobile app models. 'quality' has no dedicated database member and is
 * stored under its 'task' home on write, so 'task' reads back as 'quality';
 * database-only values the app has no concept of collapse to 'other'.
 */
function toAppSupportCategory(dbCategory: string): SupportTicketRecord["category"] {
  switch (dbCategory) {
    case "payment":
      return "payment";
    case "safety":
      return "safety";
    case "quality":
    case "task":
      return "quality";
    default:
      return "other";
  }
}

/**
 * Decode a stored evidence object key back into a display item. Notes are held
 * as a `note:` sentinel (mirroring completion evidence); everything else is a
 * real object key in the private `evidence` bucket. The stored row carries no
 * mime kind, so a file is surfaced as an image — the requester's history only
 * uses the count and note text, never the concrete file kind.
 */
function decodeTicketEvidence(id: string, storagePath: string): ReportEvidenceItem {
  if (storagePath.startsWith("note:")) {
    return {
      id,
      kind: "note",
      storagePath: null,
      note: storagePath.slice("note:".length),
      fileName: null,
    };
  }
  return { id, kind: "image", storagePath, note: null, fileName: null };
}

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

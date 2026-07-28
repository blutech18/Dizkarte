import {
  acceptsOffers,
  canSubmitOffer,
  isActiveBooking,
  isCommunicationUnlocked,
  paginate,
  profileUpdateSchema,
  taskSearchSchema,
  type ActorContext,
  type BookingId,
  type BookingStatus,
  type ConversationId,
  type DisputeId,
  type NotificationId,
  type OfferId,
  type Paginated,
  type PublicTaskerProfile,
  type PublicTaskFeedItem,
  type ReviewId,
  type SupportTicketId,
  type TaskId,
  type TaskQuestionId,
} from "@dizkarte/domain";
import type { MobileMarketplacePort } from "./port";
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
  MarketplaceCategory,
  MessageMediaAttachment,
  MessageRecord,
  MyOfferHistoryItem,
  MyProfileRecord,
  MyProfileUpdateInput,
  NotificationPreferenceCategory,
  NotificationPreferences,
  NotificationRecord,
  NotificationType,
  OfferRecord,
  OpenDisputeInput,
  OwnedTaskRecord,
  RequestCompletionInput,
  RequestWithdrawalOutcome,
  ReviewInput,
  ReviewPairView,
  ReviewRecord,
  SelectOfferOutcome,
  SpecialtyOption,
  SupportTicketRecord,
  TaskerDashboardSnapshot,
  TaskQuestionRecord,
  UpdateProfileOutcome,
  WithdrawalRecord,
} from "./types";
import { SYNTHETIC_CATEGORIES } from "./categories";
import {
  listAllSyntheticTasks,
  getPublicTaskSynthetic,
  filterAndSortTasks,
} from "../synthetic-task-feed";
import { getMapProvider } from "../map/factory";
import { validateChatMessageInput, type ChatMediaAttachmentInput } from "./chat-message-validation";

/** Fixed synthetic reveal deadline for blind reviews in development (task R10). */
const DEV_REVIEW_REVEAL_DEADLINE_MS = 24 * 60 * 60 * 1000; // 24h after first submission

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string, counter: number): string {
  // Deterministic UUID-shaped synthetic id so it satisfies `idSchema` UUID checks.
  const hex = counter.toString(16).padStart(12, "0");
  return `${prefix}0000-0000-4000-8000-${hex}`;
}

let idCounter = 1;
function nextId(prefix: string): string {
  return makeId(prefix, idCounter++);
}

type InternalTasker = {
  readonly userId: string;
  readonly displayName: string;
  readonly profile: PublicTaskerProfile;
};

const SYNTHETIC_TASKERS: ReadonlyArray<InternalTasker> = [
  {
    userId: "10000000-0000-4000-8000-000000000003",
    displayName: "Ramon Bautista",
    profile: {
      userId: "10000000-0000-4000-8000-000000000003" as unknown as PublicTaskerProfile["userId"],
      displayName: "Ramon Bautista",
      avatarPath: null,
      publicBio: "Handyman with 6 years of home repair experience across Quezon City.",
      publicExperience: "Plumbing, minor electrical, furniture assembly.",
      completionCount: 42,
      ratingAverage: 4.8,
      ratingCount: 37,
      specialties: ["Plumbing", "Assembly"],
      serviceCityCodes: ["137404"],
      verifiedIdentity: true,
      suspended: false,
    },
  },
  {
    userId: "10000000-0000-4000-8000-000000000005",
    displayName: "Liza Fernandez",
    profile: {
      userId: "10000000-0000-4000-8000-000000000005" as unknown as PublicTaskerProfile["userId"],
      displayName: "Liza Fernandez",
      avatarPath: null,
      publicBio: "Professional home cleaner, detail-oriented and punctual.",
      publicExperience: "Deep cleaning, move-out cleaning, laundry.",
      completionCount: 18,
      ratingAverage: 4.6,
      ratingCount: 15,
      specialties: ["Cleaning"],
      serviceCityCodes: ["137404"],
      verifiedIdentity: true,
      suspended: false,
    },
  },
  {
    userId: "10000000-0000-4000-8000-000000000006",
    displayName: "Noel Cruz",
    profile: {
      userId: "10000000-0000-4000-8000-000000000006" as unknown as PublicTaskerProfile["userId"],
      displayName: "Noel Cruz",
      avatarPath: null,
      publicBio: "New to the platform, eager to help with small errands and repairs.",
      publicExperience: "General labor.",
      completionCount: 0,
      ratingAverage: null,
      ratingCount: 0,
      specialties: ["General"],
      serviceCityCodes: ["137404"],
      verifiedIdentity: false,
      suspended: false,
    },
  },
];

/**
 * Deterministic server-authority-style actor directory for this dev/test
 * adapter.
 *
 * This intentionally mirrors `synthetic-auth.ts`'s `DEV_DIRECTORY` sessions
 * (same userIds/capabilities/statuses) but is looked up independently here so
 * that `submitOffer`/`askQuestion` never trust a caller-supplied "am I
 * eligible" boolean — the repository re-derives the actor's authorization
 * from this directory, the same way a real backend would re-check
 * `user_capabilities`/verification/application state server-side rather than
 * accept a client-asserted flag. A userId absent from this directory (e.g. a
 * spoofed/unknown id) is always denied.
 */
const SYNTHETIC_ACTOR_DIRECTORY: ReadonlyMap<string, ActorContext> = new Map<string, ActorContext>([
  [
    "10000000-0000-4000-8000-000000000001", // new-user@dev.dizkarte.invalid — no capabilities yet
    {
      userId: "10000000-0000-4000-8000-000000000001" as unknown as ActorContext["userId"],
      capabilities: [],
      accountStatus: "active",
      identityVerified: false,
      taskerApproved: false,
    },
  ],
  [
    "10000000-0000-4000-8000-000000000002", // client@dev.dizkarte.invalid
    {
      userId: "10000000-0000-4000-8000-000000000002" as unknown as ActorContext["userId"],
      capabilities: ["CLIENT"],
      accountStatus: "active",
      identityVerified: true,
      taskerApproved: false,
    },
  ],
  [
    "10000000-0000-4000-8000-000000000003", // tasker@dev.dizkarte.invalid — approved Tasker
    {
      userId: "10000000-0000-4000-8000-000000000003" as unknown as ActorContext["userId"],
      capabilities: ["TASKER"],
      accountStatus: "active",
      identityVerified: true,
      taskerApproved: true,
    },
  ],
  [
    "10000000-0000-4000-8000-000000000004", // tasker-applicant@dev.dizkarte.invalid — IN_REVIEW
    {
      userId: "10000000-0000-4000-8000-000000000004" as unknown as ActorContext["userId"],
      capabilities: [],
      accountStatus: "active",
      identityVerified: true,
      taskerApproved: false,
    },
  ],
  [
    "10000000-0000-4000-8000-000000000005", // second approved Tasker used by existing tests (Liza Fernandez)
    {
      userId: "10000000-0000-4000-8000-000000000005" as unknown as ActorContext["userId"],
      capabilities: ["TASKER"],
      accountStatus: "active",
      identityVerified: true,
      taskerApproved: true,
    },
  ],
  [
    "10000000-0000-4000-8000-000000000006", // synthetic Tasker fixture — not yet approved/verified
    {
      userId: "10000000-0000-4000-8000-000000000006" as unknown as ActorContext["userId"],
      capabilities: ["TASKER"],
      accountStatus: "active",
      identityVerified: false,
      taskerApproved: false,
    },
  ],
  [
    "10000000-0000-4000-8000-000000000007", // reserved: suspended Tasker fixture for denial tests
    {
      userId: "10000000-0000-4000-8000-000000000007" as unknown as ActorContext["userId"],
      capabilities: ["TASKER"],
      accountStatus: "suspended",
      identityVerified: true,
      taskerApproved: true,
    },
  ],
  [
    "10000000-0000-4000-8000-000000000099", // OTHER_CLIENT_ID fixture used by repository tests
    {
      userId: "10000000-0000-4000-8000-000000000099" as unknown as ActorContext["userId"],
      capabilities: ["CLIENT"],
      accountStatus: "active",
      identityVerified: true,
      taskerApproved: false,
    },
  ],
]);

/**
 * Looks up the deterministic actor record for `userId`. Returns `null` for
 * any id not present in the directory — this is the "unknown actor" denial
 * case; the caller must treat `null` as unauthorized rather than falling
 * back to a permissive default.
 */
function lookupSyntheticActor(userId: string): ActorContext | null {
  return SYNTHETIC_ACTOR_DIRECTORY.get(userId) ?? null;
}

/**
 * Deterministic in-memory synthetic marketplace repository.
 *
 * Construction is gated by `factory.ts` (development/test only). All ids are
 * UUID-shaped so they satisfy shared Zod schemas. State lives only in memory
 * per app session — this is a development/test convenience, not persistence.
 *
 * Public vs private projections are kept separate on purpose:
 *  - `getPublicTask` / `searchOpenTasks` return only `PublicTaskFeedItem`.
 *  - `getOwnedTask` / `listMyTasks` return `OwnedTaskRecord`, which is only
 *    ever returned to the owning Client (enforced by the `clientId` check).
 *  - `getBooking` strips exact address/coordinates unless the viewer is a
 *    participant of a communication-unlocked booking.
 */
export class SyntheticMarketplaceRepository implements MobileMarketplacePort {
  private readonly tasks = new Map<string, OwnedTaskRecord>();
  private readonly questions = new Map<string, TaskQuestionRecord[]>();
  private readonly offers = new Map<string, OfferRecord[]>();
  private readonly bookings = new Map<string, BookingRecord>();
  private readonly bookingEvents = new Map<string, BookingEventRecord[]>();
  private readonly checkoutSessions = new Map<
    string,
    { bookingId: string; amountCentavos: number }
  >();
  private readonly conversations = new Map<string, ConversationRecord>();
  private readonly conversationByBooking = new Map<string, string>();
  private readonly messages = new Map<string, MessageRecord[]>();
  private readonly notifications = new Map<string, NotificationRecord[]>();
  private readonly preferences = new Map<string, NotificationPreferences>();
  private readonly disputes = new Map<string, DisputeRecord>();
  private readonly reviews = new Map<string, ReviewRecord[]>(); // keyed by bookingId
  private readonly supportTickets = new Map<string, SupportTicketRecord[]>();
  private readonly profiles = new Map<string, MyProfileRecord>(); // keyed by userId
  private readonly withdrawals = new Map<string, WithdrawalRecord[]>(); // keyed by userId

  // ---------------------------------------------------------------------
  // Client "My Tasks"
  // ---------------------------------------------------------------------

  async listMyTasks(clientId: string): Promise<ReadonlyArray<OwnedTaskRecord>> {
    await delay();
    return [...this.tasks.values()]
      .filter((task) => task.clientId === clientId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getOwnedTask(taskId: TaskId, clientId: string): Promise<OwnedTaskRecord | null> {
    await delay();
    const task = this.tasks.get(taskId as unknown as string);
    if (!task || task.clientId !== clientId) return null;
    return task;
  }

  async saveDraftTask(
    clientId: string,
    draft: DraftTaskInput,
    existingTaskId?: TaskId,
  ): Promise<OwnedTaskRecord> {
    await delay();
    const id = existingTaskId ? (existingTaskId as unknown as string) : nextId("20");
    const existing = this.tasks.get(id);
    if (existing && existing.clientId !== clientId) {
      throw new Error("Forbidden: task belongs to a different Client.");
    }
    const record: OwnedTaskRecord = {
      id: id as unknown as TaskId,
      clientId: clientId as unknown as OwnedTaskRecord["clientId"],
      status: existing?.status ?? "DRAFT",
      draft,
      publishedAt: existing?.publishedAt ?? null,
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      questionCount: existing?.questionCount ?? 0,
      offerCount: existing?.offerCount ?? 0,
      assignedOfferId: existing?.assignedOfferId ?? null,
      activeBookingId: existing?.activeBookingId ?? null,
    };
    this.tasks.set(id, record);
    return record;
  }

  async publishTask(
    taskId: TaskId,
    clientId: string,
    verified: boolean,
  ): Promise<
    | { ok: true; task: OwnedTaskRecord }
    | { ok: false; reason: "NOT_VERIFIED" | "FORBIDDEN" | "INVALID_STATE" }
  > {
    await delay();
    const id = taskId as unknown as string;
    const task = this.tasks.get(id);
    if (!task || task.clientId !== clientId) {
      return { ok: false, reason: "FORBIDDEN" };
    }
    if (!verified) {
      return { ok: false, reason: "NOT_VERIFIED" };
    }
    if (task.status !== "DRAFT" && task.status !== "OPEN") {
      return { ok: false, reason: "INVALID_STATE" };
    }
    const published: OwnedTaskRecord = {
      ...task,
      status: "OPEN",
      publishedAt: task.publishedAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    this.tasks.set(id, published);
    return { ok: true, task: published };
  }

  // ---------------------------------------------------------------------
  // Public discovery — delegates to the existing synthetic feed for parity
  // ---------------------------------------------------------------------

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
    await delay();
    const bounded = validateSearchBounds(input);
    // Merge in this repository's own published tasks so newly published
    // Client tasks appear in the same feed the Tasker side reads from, then
    // apply the exact same filter/sort pass used by the synthetic feed to
    // the combined set — this is what guarantees feed/map result parity.
    const ownPublished = [...this.tasks.values()]
      .filter((t) => t.status === "OPEN")
      .map(toPublicProjection);
    const all = [...listAllSyntheticTasks(), ...ownPublished];
    const mapProvider = getMapProvider() ?? undefined;
    const filtered = filterAndSortTasks(all, bounded, mapProvider);
    const start = (bounded.page - 1) * bounded.pageSize;
    const pageItems = filtered.slice(start, start + bounded.pageSize);
    return paginate(pageItems, bounded.page, bounded.pageSize, filtered.length);
  }

  async getPublicTask(taskId: TaskId): Promise<PublicTaskFeedItem | null> {
    const own = this.tasks.get(taskId as unknown as string);
    if (own && own.status === "OPEN") return toPublicProjection(own);
    return getPublicTaskSynthetic(taskId);
  }

  // ---------------------------------------------------------------------
  // Questions & offers
  // ---------------------------------------------------------------------

  async listQuestions(taskId: TaskId): Promise<ReadonlyArray<TaskQuestionRecord>> {
    await delay();
    return this.questions.get(taskId as unknown as string) ?? [];
  }

  async askQuestion(
    taskId: TaskId,
    authorId: string,
    authorDisplayName: string,
    body: string,
  ): Promise<TaskQuestionRecord> {
    await delay();
    const key = taskId as unknown as string;
    const actor = lookupSyntheticActor(authorId);
    if (!actor) {
      throw new Error("Forbidden: unknown actor.");
    }
    const targetStatus = this.resolveTaskStatus(key);
    if (targetStatus === null) {
      throw new Error("Task not found.");
    }
    if (!acceptsOffers(targetStatus)) {
      throw new Error("This task is not open for questions.");
    }
    const record: TaskQuestionRecord = {
      id: nextId("40") as unknown as TaskQuestionId,
      taskId,
      authorId: authorId as unknown as TaskQuestionRecord["authorId"],
      authorDisplayName,
      body,
      answer: null,
      createdAt: nowIso(),
    };
    const list = this.questions.get(key) ?? [];
    list.push(record);
    this.questions.set(key, list);
    const task = this.tasks.get(key);
    if (task) this.tasks.set(key, { ...task, questionCount: list.length });
    return record;
  }

  /**
   * Offer visibility is private: only the task's owning Client may compare
   * every offer; a Tasker may see only their own offer(s) on this task;
   * anyone else (unrelated viewer, unknown actor) is denied and receives no
   * offers at all.
   */
  async listOffers(taskId: TaskId, viewerId: string): Promise<ReadonlyArray<OfferRecord>> {
    await delay();
    const key = taskId as unknown as string;
    const all = this.offers.get(key) ?? [];
    const task = this.tasks.get(key);
    if (task && task.clientId === viewerId) {
      return all;
    }
    const ownOffersOnly = all.filter((offer) => offer.taskerId === viewerId);
    return ownOffersOnly;
  }

  async listMyOffers(taskerId: string): Promise<ReadonlyArray<MyOfferHistoryItem>> {
    await delay();
    const items: MyOfferHistoryItem[] = [];
    for (const [taskKey, offerList] of this.offers.entries()) {
      const resolved = this.resolveTaskTitleAndStatus(taskKey);
      for (const offer of offerList) {
        if (offer.taskerId !== taskerId) continue;
        items.push({
          offer,
          taskTitle: resolved.title,
          taskStatus: resolved.status,
          canWithdraw: offer.status === "SUBMITTED",
        });
      }
    }
    return items.sort((a, b) => b.offer.createdAt.localeCompare(a.offer.createdAt));
  }

  /**
   * Resolves a task's current status by key, checking this repository's own
   * published/draft tasks first, then falling back to the base synthetic
   * feed (`listAllSyntheticTasks`) so tasks that only exist as seed fixtures
   * are still recognized as existing/open. Returns `null` if the task does
   * not exist in either source.
   */
  private resolveTaskStatus(taskKey: string): OwnedTaskRecord["status"] | null {
    const own = this.tasks.get(taskKey);
    if (own) return own.status;
    const synthetic = listAllSyntheticTasks().find((t) => (t.id as unknown as string) === taskKey);
    return synthetic ? synthetic.status : null;
  }

  /**
   * Resolves a task's display title and current status for offer-history
   * purposes, checking this repository's own tasks first and falling back to
   * the base synthetic feed. Only reports "Task no longer available"/REMOVED
   * when the task genuinely does not exist in either source.
   */
  private resolveTaskTitleAndStatus(taskKey: string): {
    title: string;
    status: OwnedTaskRecord["status"];
  } {
    const own = this.tasks.get(taskKey);
    if (own) return { title: own.draft.title, status: own.status };
    const synthetic = listAllSyntheticTasks().find((t) => (t.id as unknown as string) === taskKey);
    if (synthetic) return { title: synthetic.title, status: synthetic.status };
    return { title: "Task no longer available", status: "REMOVED" };
  }

  async withdrawOffer(offerId: string, taskerId: string): Promise<{ ok: boolean }> {
    await delay();
    for (const [taskKey, offerList] of this.offers.entries()) {
      const index = offerList.findIndex((o) => o.id === offerId);
      if (index === -1) continue;
      const offer = offerList[index]!;
      if (offer.taskerId !== taskerId) return { ok: false };
      if (offer.status !== "SUBMITTED") return { ok: false };
      const updated = [...offerList];
      updated[index] = { ...offer, status: "WITHDRAWN" };
      this.offers.set(taskKey, updated);
      return { ok: true };
    }
    return { ok: false };
  }

  /**
   * Server-authority-style offer submission gate.
   *
   * The dev/synthetic adapter never trusts a client-supplied "am I eligible"
   * boolean here: it independently re-derives the actor's authorization from
   * `SYNTHETIC_ACTOR_DIRECTORY` (mirroring `canSubmitOffer` from
   * `@dizkarte/domain`, the same predicate a real backend command handler
   * would apply) and independently re-checks that the target task exists and
   * is still open for offers. Unknown actors, non-Tasker actors, unapproved
   * applicants, suspended/banned/deactivated accounts, and non-open/
   * non-existent tasks are all rejected before any offer is recorded. This is
   * a development/test convenience only — real backend authorization
   * (RLS + `SECURITY DEFINER` commands) remains authoritative in production.
   */
  async submitOffer(
    taskId: TaskId,
    taskerId: string,
    taskerDisplayName: string,
    input: {
      amountCentavos: number;
      message: string;
      etaText: string;
      availabilityText: string;
      experienceText: string;
    },
  ): Promise<OfferRecord> {
    await delay();
    const key = taskId as unknown as string;

    const actor = lookupSyntheticActor(taskerId);
    if (!actor || !canSubmitOffer(actor)) {
      throw new Error("Forbidden: this actor is not an eligible Tasker.");
    }

    const targetStatus = this.resolveTaskStatus(key);
    if (targetStatus === null) {
      throw new Error("Task not found.");
    }
    if (!acceptsOffers(targetStatus)) {
      throw new Error("This task is not open for offers.");
    }

    // Prevent a duplicate active offer by the same Tasker on the same task:
    // resubmission is only permitted once the Tasker's prior offer reached a
    // terminal/withdrawn state (WITHDRAWN, REJECTED, EXPIRED), never while a
    // SUBMITTED or SELECTED offer from them is still outstanding.
    const existingList = this.offers.get(key) ?? [];
    const activeExisting = existingList.find(
      (o) => o.taskerId === taskerId && (o.status === "SUBMITTED" || o.status === "SELECTED"),
    );
    if (activeExisting) {
      throw new Error(
        "You already have an active offer on this task. Withdraw it before submitting a new one.",
      );
    }

    const taskerMeta =
      SYNTHETIC_TASKERS.find((t) => t.userId === taskerId) ??
      buildFallbackTaskerMeta(taskerId, taskerDisplayName);
    const record: OfferRecord = {
      id: nextId("50") as unknown as OfferId,
      taskId,
      taskerId: taskerId as unknown as OfferRecord["taskerId"],
      taskerDisplayName,
      taskerProfile: taskerMeta.profile,
      amountCentavos: input.amountCentavos,
      message: input.message,
      etaText: input.etaText,
      availabilityText: input.availabilityText,
      experienceText: input.experienceText,
      status: "SUBMITTED",
      createdAt: nowIso(),
    };
    const list = this.offers.get(key) ?? [];
    list.push(record);
    this.offers.set(key, list);
    const task = this.tasks.get(key);
    if (task) {
      this.tasks.set(key, { ...task, offerCount: list.length });
      await this.notify(task.clientId, "OFFER_RECEIVED", "New offer received", {
        resourceType: "task",
        resourceId: key,
        body: `${taskerDisplayName} submitted an offer on "${task.draft.title}".`,
      });
    }
    return record;
  }

  async selectOffer(
    taskId: TaskId,
    offerId: string,
    clientId: string,
    idempotencyKey: string,
  ): Promise<SelectOfferOutcome> {
    await delay();
    const key = taskId as unknown as string;
    const task = this.tasks.get(key);
    if (!task || task.clientId !== clientId) {
      return { ok: false, reason: "FORBIDDEN" };
    }

    // Idempotency takes priority over conflict/eligibility checks: a retried
    // request with the same key must return the same booking rather than be
    // rejected because the offer/task state has already moved on.
    const existingByKey = [...this.bookings.values()].find(
      (b) => b.taskId === taskId && b.idempotencyKey === idempotencyKey,
    );
    if (existingByKey) {
      return { ok: true, bookingId: existingByKey.id };
    }

    // Conflict-safe single selection: reject if a booking already active for this task.
    if (task.activeBookingId) {
      const existingBooking = this.bookings.get(task.activeBookingId as unknown as string);
      if (existingBooking && isActiveBooking(existingBooking.status)) {
        return { ok: false, reason: "ALREADY_ASSIGNED" };
      }
    }
    const offerList = this.offers.get(key) ?? [];
    const offer = offerList.find((o) => o.id === offerId);
    if (!offer || offer.status !== "SUBMITTED") {
      return { ok: false, reason: "OFFER_NOT_ELIGIBLE" };
    }

    const updatedOffers = offerList.map((o) =>
      o.id === offer.id
        ? { ...o, status: "SELECTED" as const }
        : o.status === "SUBMITTED"
          ? { ...o, status: "REJECTED" as const }
          : o,
    );
    this.offers.set(key, updatedOffers);

    const bookingId = nextId("60") as unknown as string;
    const booking: BookingRecord = {
      id: bookingId as unknown as BookingId,
      taskId,
      taskTitle: task.draft.title,
      clientId: clientId as unknown as BookingRecord["clientId"],
      clientDisplayName: "You",
      taskerId: offer.taskerId,
      taskerDisplayName: offer.taskerDisplayName,
      agreedCentavos: offer.amountCentavos,
      status: "PAYMENT_PENDING",
      idempotencyKey,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      paymentIntentId: null,
      exactAddress: task.draft.exactAddress,
      exactLat: task.draft.exactLat,
      exactLng: task.draft.exactLng,
      clientContactMasked: "Client contact — hidden until payment is confirmed",
      taskerContactMasked: "Tasker contact — hidden until payment is confirmed",
      completionEvidence: [],
      disputeId: null,
    };
    this.bookings.set(bookingId, booking);
    this.appendBookingEvent(booking.id, null, "PAYMENT_PENDING", clientId, "client");

    this.tasks.set(key, {
      ...task,
      status: "BOOKING_PENDING",
      assignedOfferId: offer.id,
      activeBookingId: booking.id,
      updatedAt: nowIso(),
    });

    await this.notify(offer.taskerId, "OFFER_SELECTED", "Your offer was selected", {
      resourceType: "booking",
      resourceId: bookingId,
      body: `Your offer for "${task.draft.title}" was selected. Waiting for payment confirmation.`,
    });

    return { ok: true, bookingId: booking.id };
  }

  // ---------------------------------------------------------------------
  // Checkout boundary
  // ---------------------------------------------------------------------

  async createCheckoutSession(
    bookingId: BookingId,
    clientId: string,
  ): Promise<CheckoutSessionRecord> {
    await delay();
    const booking = this.bookings.get(bookingId as unknown as string);
    if (!booking || booking.clientId !== clientId) {
      throw new Error("Booking not found for this Client.");
    }
    if (booking.status !== "PAYMENT_PENDING") {
      throw new Error("Booking is not awaiting payment.");
    }
    const providerReference = `synckt_${nextId("70")}`;
    const paymentIntentId = `synpi_${nextId("71")}`;
    this.checkoutSessions.set(providerReference, {
      bookingId: booking.id as unknown as string,
      amountCentavos: booking.agreedCentavos,
    });
    this.bookings.set(bookingId as unknown as string, { ...booking, paymentIntentId });
    return {
      bookingId: booking.id,
      paymentIntentId,
      providerReference,
      checkoutUrl: `https://synthetic.dizkarte.invalid/checkout/${providerReference}`,
      amountCentavos: booking.agreedCentavos,
      synthetic: true,
      mode: "synthetic",
    };
  }

  /**
   * Development-only checkout simulator step. This NEVER marks a booking
   * confirmed itself — it only records the user's chosen outcome so that
   * `processAuthoritativeWebhook` (modeling the provider webhook) can apply
   * it as a separate, distinct step. This mirrors the real architecture
   * where client-side navigation/callback is never authoritative for payment.
   */
  async simulateCheckout(
    providerReference: string,
    choice: CheckoutSimulationChoice,
  ): Promise<{ accepted: boolean }> {
    await delay();
    const session = this.checkoutSessions.get(providerReference);
    if (!session) return { accepted: false };
    this.pendingWebhookOutcomes.set(providerReference, choice);
    return { accepted: true };
  }

  private readonly pendingWebhookOutcomes = new Map<string, CheckoutSimulationChoice>();

  async processAuthoritativeWebhook(
    providerReference: string,
  ): Promise<{ bookingId: BookingId; status: "CONFIRMED" | "FAILED" } | null> {
    // Simulate provider processing latency distinct from the client's own request.
    await delay(120);
    const session = this.checkoutSessions.get(providerReference);
    const choice = this.pendingWebhookOutcomes.get(providerReference);
    if (!session || !choice) return null;
    if (choice === "cancel" || choice === "retry") {
      // No authoritative effect yet; client may retry checkout.
      return null;
    }
    const bookingId = session.bookingId as unknown as BookingId;
    const booking = this.bookings.get(session.bookingId);
    if (!booking) return null;

    if (choice === "success") {
      const confirmed: BookingRecord = {
        ...booking,
        status: "CONFIRMED",
        updatedAt: nowIso(),
        clientContactMasked: "Available in chat",
        taskerContactMasked: "Available in chat",
      };
      this.bookings.set(session.bookingId, confirmed);
      this.appendBookingEvent(bookingId, "PAYMENT_PENDING", "CONFIRMED", null, "webhook");
      this.ensureConversation(bookingId, booking.clientId, booking.taskerId);
      await this.notify(booking.clientId, "PAYMENT_CONFIRMED", "Payment confirmed", {
        resourceType: "booking",
        resourceId: session.bookingId,
        body: `Payment for "${booking.taskTitle}" is confirmed. You can now chat with your Tasker.`,
      });
      await this.notify(booking.taskerId, "PAYMENT_CONFIRMED", "Payment confirmed", {
        resourceType: "booking",
        resourceId: session.bookingId,
        body: `Payment for "${booking.taskTitle}" is confirmed. You can now chat with the Client.`,
      });
      this.pendingWebhookOutcomes.delete(providerReference);
      return { bookingId, status: "CONFIRMED" };
    }

    // failure
    const failed: BookingRecord = { ...booking, status: "PAYMENT_FAILED", updatedAt: nowIso() };
    this.bookings.set(session.bookingId, failed);
    this.appendBookingEvent(bookingId, "PAYMENT_PENDING", "PAYMENT_FAILED", null, "webhook");
    await this.notify(booking.clientId, "PAYMENT_FAILED", "Payment failed", {
      resourceType: "booking",
      resourceId: session.bookingId,
      body: `Payment for "${booking.taskTitle}" failed. You can retry checkout.`,
    });
    this.pendingWebhookOutcomes.delete(providerReference);
    return { bookingId, status: "FAILED" };
  }

  // ---------------------------------------------------------------------
  // Bookings
  // ---------------------------------------------------------------------

  async listMyBookings(userId: string): Promise<ReadonlyArray<BookingRecord>> {
    await delay();
    return [...this.bookings.values()]
      .filter((b) => b.clientId === userId || b.taskerId === userId)
      .map((b) => this.projectBooking(b, userId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getBooking(bookingId: BookingId, viewerId: string): Promise<BookingRecord | null> {
    await delay();
    const booking = this.bookings.get(bookingId as unknown as string);
    if (!booking) return null;
    if (booking.clientId !== viewerId && booking.taskerId !== viewerId) return null;
    return this.projectBooking(booking, viewerId);
  }

  /** Strips exact address/contact unless the booking is communication-unlocked. */
  private projectBooking(booking: BookingRecord, _viewerId: string): BookingRecord {
    if (isCommunicationUnlocked(booking.status)) return booking;
    return {
      ...booking,
      exactAddress: null,
      exactLat: null,
      exactLng: null,
      clientContactMasked: "Hidden until payment is confirmed",
      taskerContactMasked: "Hidden until payment is confirmed",
    };
  }

  async listBookingEvents(bookingId: BookingId): Promise<ReadonlyArray<BookingEventRecord>> {
    await delay();
    return this.bookingEvents.get(bookingId as unknown as string) ?? [];
  }

  private appendBookingEvent(
    bookingId: BookingId,
    fromStatus: BookingStatus | null,
    toStatus: BookingStatus,
    actorId: string | null,
    source: BookingEventRecord["source"],
  ): void {
    const key = bookingId as unknown as string;
    const list = this.bookingEvents.get(key) ?? [];
    list.push({
      id: nextId("80"),
      bookingId,
      fromStatus,
      toStatus,
      actorId: actorId as unknown as BookingEventRecord["actorId"],
      source,
      createdAt: nowIso(),
    });
    this.bookingEvents.set(key, list);
  }

  async startWork(bookingId: BookingId, taskerId: string): Promise<{ ok: boolean }> {
    await delay();
    const key = bookingId as unknown as string;
    const booking = this.bookings.get(key);
    if (!booking || booking.taskerId !== taskerId || booking.status !== "CONFIRMED") {
      return { ok: false };
    }
    this.bookings.set(key, { ...booking, status: "IN_PROGRESS", updatedAt: nowIso() });
    this.appendBookingEvent(bookingId, "CONFIRMED", "IN_PROGRESS", taskerId, "tasker");
    await this.notify(booking.clientId, "BOOKING_STARTED", "Work has started", {
      resourceType: "booking",
      resourceId: key,
      body: `${booking.taskerDisplayName} started work on "${booking.taskTitle}".`,
    });
    return { ok: true };
  }

  async requestCompletion(
    input: RequestCompletionInput,
    taskerId: string,
  ): Promise<{ ok: boolean }> {
    await delay();
    const key = input.bookingId as unknown as string;
    const booking = this.bookings.get(key);
    if (!booking || booking.taskerId !== taskerId || booking.status !== "IN_PROGRESS") {
      return { ok: false };
    }
    const evidence: CompletionEvidenceItem[] = input.evidence.map((item) => ({
      id: nextId("90"),
      kind: item.kind,
      note: item.note ?? null,
      fileName: item.fileName ?? null,
      submittedAt: nowIso(),
    }));
    if (input.note.trim().length > 0) {
      evidence.push({
        id: nextId("91"),
        kind: "note",
        note: input.note.trim(),
        fileName: null,
        submittedAt: nowIso(),
      });
    }
    this.bookings.set(key, {
      ...booking,
      status: "COMPLETION_REQUESTED",
      completionEvidence: evidence,
      updatedAt: nowIso(),
    });
    this.appendBookingEvent(
      input.bookingId,
      "IN_PROGRESS",
      "COMPLETION_REQUESTED",
      taskerId,
      "tasker",
    );
    await this.notify(booking.clientId, "COMPLETION_REQUESTED", "Completion requested", {
      resourceType: "booking",
      resourceId: key,
      body: `${booking.taskerDisplayName} marked "${booking.taskTitle}" as complete. Please review and confirm.`,
    });
    return { ok: true };
  }

  async confirmCompletion(bookingId: BookingId, clientId: string): Promise<{ ok: boolean }> {
    await delay();
    const key = bookingId as unknown as string;
    const booking = this.bookings.get(key);
    if (!booking || booking.clientId !== clientId || booking.status !== "COMPLETION_REQUESTED") {
      return { ok: false };
    }
    this.bookings.set(key, { ...booking, status: "COMPLETED", updatedAt: nowIso() });
    this.appendBookingEvent(bookingId, "COMPLETION_REQUESTED", "COMPLETED", clientId, "client");
    const task = this.tasks.get(booking.taskId as unknown as string);
    if (task) {
      this.tasks.set(booking.taskId as unknown as string, {
        ...task,
        status: "COMPLETED",
        updatedAt: nowIso(),
      });
    }
    await this.notify(booking.taskerId, "BOOKING_COMPLETED", "Booking completed & released", {
      resourceType: "booking",
      resourceId: key,
      body: `The Client confirmed completion of "${booking.taskTitle}". Funds have been released.`,
    });
    return { ok: true };
  }

  async openDispute(input: OpenDisputeInput, actorId: string): Promise<DisputeRecord | null> {
    await delay();
    const key = input.bookingId as unknown as string;
    const booking = this.bookings.get(key);
    if (!booking) return null;
    if (booking.clientId !== actorId && booking.taskerId !== actorId) return null;
    const disputable: ReadonlyArray<BookingStatus> = [
      "CONFIRMED",
      "IN_PROGRESS",
      "COMPLETION_REQUESTED",
      "COMPLETED",
    ];
    if (!disputable.includes(booking.status)) return null;

    const dispute: DisputeRecord = {
      id: nextId("A0") as unknown as DisputeId,
      bookingId: input.bookingId,
      openedBy: actorId as unknown as DisputeRecord["openedBy"],
      reason: input.reason,
      status: "OPEN",
      createdAt: nowIso(),
    };
    this.disputes.set(dispute.id as unknown as string, dispute);
    this.bookings.set(key, {
      ...booking,
      status: "DISPUTED",
      disputeId: dispute.id,
      updatedAt: nowIso(),
    });
    this.appendBookingEvent(input.bookingId, booking.status, "DISPUTED", actorId, "client");
    const counterpart = booking.clientId === actorId ? booking.taskerId : booking.clientId;
    await this.notify(counterpart, "DISPUTE_OPENED", "A dispute was opened", {
      resourceType: "dispute",
      resourceId: dispute.id as unknown as string,
      body: `A dispute was opened on "${booking.taskTitle}". Financial activity is frozen pending review.`,
    });
    return dispute;
  }

  // ---------------------------------------------------------------------
  // Ledger-derived summary (read-only)
  // ---------------------------------------------------------------------

  async getLedgerSummary(userId: string): Promise<LedgerSummary> {
    await delay();
    const myBookings = [...this.bookings.values()].filter(
      (b) => b.clientId === userId || b.taskerId === userId,
    );
    let pending = 0;
    let protectedCentavos = 0;
    let available = 0;
    for (const booking of myBookings) {
      if (booking.taskerId !== userId) continue;
      if (booking.status === "PAYMENT_PENDING") pending += booking.agreedCentavos;
      else if (
        booking.status === "CONFIRMED" ||
        booking.status === "IN_PROGRESS" ||
        booking.status === "COMPLETION_REQUESTED"
      ) {
        protectedCentavos += booking.agreedCentavos;
      } else if (booking.status === "COMPLETED") {
        available += booking.agreedCentavos;
      }
    }
    const myWithdrawals = this.withdrawals.get(userId) ?? [];
    let reserved = 0;
    let withdrawn = 0;
    for (const w of myWithdrawals) {
      if (w.status === "RESERVED" || w.status === "PROCESSING") reserved += w.amountCentavos;
      else if (w.status === "PAID") withdrawn += w.amountCentavos;
    }
    // Reserved/in-flight withdrawal amounts are earmarked out of the
    // available-to-withdraw balance so the same centavos are never both
    // "available" and "reserved" at once.
    available = Math.max(0, available - reserved);
    return {
      userId: userId as unknown as LedgerSummary["userId"],
      pendingCentavos: pending,
      protectedCentavos,
      availableCentavos: available,
      reservedCentavos: reserved,
      withdrawnCentavos: withdrawn,
      derived: true,
    };
  }

  // ---------------------------------------------------------------------
  // Tasker Dashboard (aggregated, read-only projection)
  // ---------------------------------------------------------------------

  async getTaskerDashboard(taskerId: string): Promise<TaskerDashboardSnapshot> {
    await delay();
    const myBookings = (await this.listMyBookings(taskerId)).filter((b) => b.taskerId === taskerId);
    const activeBookings = myBookings.filter(
      (b) => b.status === "CONFIRMED" || b.status === "IN_PROGRESS",
    );
    const completionRequested = myBookings.filter((b) => b.status === "COMPLETION_REQUESTED");
    const completedWork = myBookings.filter((b) => b.status === "COMPLETED");
    const availableWork = (await this.searchOpenTasks({ page: 1, pageSize: 20 })).items;
    const ledger = await this.getLedgerSummary(taskerId);
    const taskerMeta = SYNTHETIC_TASKERS.find((t) => t.userId === taskerId);
    return {
      availableWork,
      activeBookings,
      completionRequested,
      completedWork,
      ledger,
      ratingAverage: taskerMeta?.profile.ratingAverage ?? null,
      ratingCount: taskerMeta?.profile.ratingCount ?? 0,
      completionCount: taskerMeta?.profile.completionCount ?? completedWork.length,
      // No live payout provider is configured in this pass (task 9.1) — the
      // dashboard/UI must always fail closed on this flag.
      payoutProviderAvailable: false,
    };
  }

  // ---------------------------------------------------------------------
  // Withdrawals — no live payout provider is configured in this pass
  // (task 9.1). Requests are recorded as REQUESTED then deterministically
  // resolved to PROVIDER_UNAVAILABLE rather than a fabricated payout.
  // ---------------------------------------------------------------------

  async listWithdrawals(userId: string): Promise<ReadonlyArray<WithdrawalRecord>> {
    await delay();
    return (this.withdrawals.get(userId) ?? [])
      .slice()
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }

  async requestWithdrawal(
    userId: string,
    amountCentavos: number,
  ): Promise<RequestWithdrawalOutcome> {
    await delay();
    if (!Number.isInteger(amountCentavos) || amountCentavos <= 0) {
      return { ok: false, reason: "INSUFFICIENT_AVAILABLE_BALANCE" };
    }
    const ledger = await this.getLedgerSummary(userId);
    if (amountCentavos > ledger.availableCentavos) {
      return { ok: false, reason: "INSUFFICIENT_AVAILABLE_BALANCE" };
    }
    const record: WithdrawalRecord = {
      id: nextId("W0"),
      userId: userId as unknown as WithdrawalRecord["userId"],
      amountCentavos,
      // No approved payout provider is configured (task 9.1) — the request
      // is recorded, then immediately and deterministically marked FAILED
      // with an explicit provider-unavailable reason. This is never a live
      // payout and never silently reports success.
      status: "FAILED",
      requestedAt: nowIso(),
      settledAt: nowIso(),
      failureReason: "No payout provider is configured in this environment.",
    };
    const list = this.withdrawals.get(userId) ?? [];
    list.push(record);
    this.withdrawals.set(userId, list);
    return { ok: false, reason: "PROVIDER_UNAVAILABLE" };
  }

  // ---------------------------------------------------------------------
  // Messaging
  // ---------------------------------------------------------------------

  private ensureConversation(
    bookingId: BookingId,
    clientId: string,
    taskerId: string,
  ): ConversationRecord {
    const bookingKey = bookingId as unknown as string;
    const existingId = this.conversationByBooking.get(bookingKey);
    if (existingId) return this.conversations.get(existingId)!;
    const conversationId = nextId("B0");
    const record: ConversationRecord = {
      id: conversationId as unknown as ConversationId,
      bookingId,
      participantIds: [clientId, taskerId] as unknown as ConversationRecord["participantIds"],
    };
    this.conversations.set(conversationId, record);
    this.conversationByBooking.set(bookingKey, conversationId);
    return record;
  }

  async getConversationForBooking(
    bookingId: BookingId,
    viewerId: string,
  ): Promise<ConversationRecord | null> {
    await delay();
    const booking = this.bookings.get(bookingId as unknown as string);
    if (!booking) return null;
    if (booking.clientId !== viewerId && booking.taskerId !== viewerId) return null;
    if (!isCommunicationUnlocked(booking.status)) return null;
    return this.ensureConversation(bookingId, booking.clientId, booking.taskerId);
  }

  async listMessages(
    conversationId: ConversationId,
    viewerId: string,
  ): Promise<ReadonlyArray<MessageRecord>> {
    await delay();
    const conversation = this.conversations.get(conversationId as unknown as string);
    if (!conversation || !conversation.participantIds.includes(viewerId as never)) return [];
    const booking = this.bookings.get(conversation.bookingId as unknown as string);
    if (!booking || !isCommunicationUnlocked(booking.status)) return [];
    return this.messages.get(conversationId as unknown as string) ?? [];
  }

  async sendMessage(
    conversationId: ConversationId,
    senderId: string,
    body: string | null,
    clientNonce: string,
    media: ReadonlyArray<{
      kind: "image" | "video";
      fileName: string;
      sizeBytes: number;
      mimeType: string;
    }> = [],
  ): Promise<MessageRecord> {
    const key = conversationId as unknown as string;
    const conversation = this.conversations.get(key);
    if (!conversation || !conversation.participantIds.includes(senderId as never)) {
      throw new Error("Forbidden: not a conversation participant.");
    }
    const booking = this.bookings.get(conversation.bookingId as unknown as string);
    if (!booking || !isCommunicationUnlocked(booking.status)) {
      throw new Error("Forbidden: chat is not unlocked for this booking.");
    }

    // Idempotent re-send: an identical clientNonce for an already-recorded,
    // non-failed message returns the existing record rather than appending a
    // duplicate. A `sending`/failed record with the same nonce is treated as
    // the same logical attempt and is updated in place, never duplicated.
    const existingList = this.messages.get(key) ?? [];
    const existing = existingList.find((m) => m.clientNonce === clientNonce);
    if (existing && existing.deliveryStatus === "sent") {
      return existing;
    }

    // Validate at the adapter boundary before any state or notification is
    // written. Never trust caller-supplied media metadata.
    const validation = validateChatMessageInput({ body, media });
    if (!validation.ok) {
      throw new Error(validation.reason);
    }
    const normalizedBody = validation.body;

    const attachments: MessageMediaAttachment[] = media.map((item: ChatMediaAttachmentInput) => ({
      id: nextId("C1"),
      kind: item.kind,
      fileName: item.fileName.trim(),
      sizeBytes: item.sizeBytes,
      mimeType: item.mimeType,
    }));

    // Optimistic "sending" record: update the existing record for this nonce
    // in place if present (retry path), otherwise append a new one.
    const pendingBase: Omit<MessageRecord, "deliveryStatus"> = {
      id: existing?.id ?? (nextId("C0") as unknown as MessageRecord["id"]),
      conversationId,
      senderId: senderId as unknown as MessageRecord["senderId"],
      body: normalizedBody,
      media: attachments,
      createdAt: existing?.createdAt ?? nowIso(),
      clientNonce,
    };
    const pending: MessageRecord = { ...pendingBase, deliveryStatus: "sending" };
    const listWithPending = existing
      ? existingList.map((m) => (m.clientNonce === clientNonce ? pending : m))
      : [...existingList, pending];
    this.messages.set(key, listWithPending);

    await delay(200);
    // Deterministic failure for a reserved test trigger phrase, so retry UI
    // is exercisable: the *first* attempt for a given nonce fails; a
    // subsequent explicit retry of that same (already-failed) nonce succeeds
    // deterministically, since `existing.deliveryStatus === "failed"` marks
    // this call as a retry rather than an initial send.
    const isRetryOfFailedRecord = existing?.deliveryStatus === "failed";
    const shouldFail = normalizedBody?.trim() === "__force_fail__" && !isRetryOfFailedRecord;
    const resolved: MessageRecord = { ...pending, deliveryStatus: shouldFail ? "failed" : "sent" };
    this.messages.set(
      key,
      (this.messages.get(key) ?? []).map((m) => (m.clientNonce === clientNonce ? resolved : m)),
    );
    if (!shouldFail && !existing) {
      const other = conversation.participantIds.find((id) => id !== senderId);
      if (other) {
        await this.notify(other as unknown as string, "MESSAGE_RECEIVED", "New message", {
          resourceType: "conversation",
          resourceId: key,
          body: normalizedBody ?? "Sent an attachment.",
        });
      }
    }
    return resolved;
  }

  async retryMessage(
    conversationId: ConversationId,
    clientNonce: string,
    requesterId: string,
  ): Promise<MessageRecord | null> {
    const key = conversationId as unknown as string;
    const conversation = this.conversations.get(key);
    if (!conversation || !conversation.participantIds.includes(requesterId as never)) return null;
    const booking = this.bookings.get(conversation.bookingId as unknown as string);
    if (!booking || !isCommunicationUnlocked(booking.status)) return null;

    const list = this.messages.get(key) ?? [];
    const target = list.find((m) => m.clientNonce === clientNonce);
    if (!target) return null;
    // Only the original sender may retry their own message, and only a
    // message that actually failed.
    if (target.senderId !== (requesterId as unknown as MessageRecord["senderId"])) return null;
    if (target.deliveryStatus !== "failed") return null;

    return this.sendMessage(
      conversationId,
      target.senderId as unknown as string,
      target.body,
      clientNonce,
      target.media.map((m) => ({
        kind: m.kind,
        fileName: m.fileName,
        sizeBytes: m.sizeBytes,
        mimeType: m.mimeType,
      })),
    );
  }

  // ---------------------------------------------------------------------
  // Reviews (blind bilateral)
  // ---------------------------------------------------------------------

  async submitReview(
    input: ReviewInput,
    reviewerId: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    await delay();
    const key = input.bookingId as unknown as string;
    const booking = this.bookings.get(key);
    if (!booking) return { ok: false, reason: "NOT_FOUND" };
    if (booking.status !== "COMPLETED") return { ok: false, reason: "NOT_COMPLETED" };
    if (booking.clientId !== reviewerId && booking.taskerId !== reviewerId) {
      return { ok: false, reason: "FORBIDDEN" };
    }
    const existing = this.reviews.get(key) ?? [];
    if (existing.some((r) => r.reviewerId === reviewerId)) {
      return { ok: false, reason: "ALREADY_SUBMITTED" };
    }
    const revieweeId = booking.clientId === reviewerId ? booking.taskerId : booking.clientId;
    const review: ReviewRecord = {
      id: nextId("D0") as unknown as ReviewId,
      bookingId: input.bookingId,
      reviewerId: reviewerId as unknown as ReviewRecord["reviewerId"],
      revieweeId,
      score: input.score,
      comment: input.comment,
      status: "HIDDEN",
      submittedAt: nowIso(),
      revealedAt: null,
    };
    const next = [...existing, review];
    // Reveal once both sides have submitted.
    if (next.length >= 2) {
      const revealedAt = nowIso();
      for (let i = 0; i < next.length; i += 1) {
        next[i] = { ...next[i]!, status: "REVEALED", revealedAt };
      }
      for (const r of next) {
        await this.notify(
          r.revieweeId as unknown as string,
          "REVIEW_RECEIVED",
          "A review is now visible",
          {
            resourceType: "review",
            resourceId: r.id as unknown as string,
            body: `Both reviews for "${booking.taskTitle}" are now visible.`,
          },
        );
      }
    }
    this.reviews.set(key, next);
    return { ok: true };
  }

  async getReviewPair(bookingId: BookingId, viewerId: string): Promise<ReviewPairView | null> {
    await delay();
    const key = bookingId as unknown as string;
    const booking = this.bookings.get(key);
    if (!booking) return null;
    if (booking.clientId !== viewerId && booking.taskerId !== viewerId) return null;
    const list = this.reviews.get(key) ?? [];
    const myReview = list.find((r) => r.reviewerId === viewerId) ?? null;
    const bothSubmitted = list.length >= 2;
    const firstSubmittedAt = list[0]?.submittedAt;
    const revealDeadline = firstSubmittedAt
      ? new Date(new Date(firstSubmittedAt).getTime() + DEV_REVIEW_REVEAL_DEADLINE_MS).toISOString()
      : null;
    const deadlinePassed = revealDeadline
      ? new Date(revealDeadline).getTime() <= Date.now()
      : false;
    const revealed = bothSubmitted || deadlinePassed;
    const counterpartReview = revealed
      ? (list.find((r) => r.reviewerId !== viewerId) ?? null)
      : null;
    return {
      bookingId,
      myReview,
      counterpartReview,
      bothSubmitted,
      revealDeadline,
    };
  }

  // ---------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------

  private defaultPreferences(): NotificationPreferences {
    return {
      offers: { inApp: true, push: true },
      payments: { inApp: true, push: true },
      bookings: { inApp: true, push: true },
      messages: { inApp: true, push: true },
      disputes: { inApp: true, push: true },
      reviews: { inApp: true, push: true },
    };
  }

  private categoryForType(type: NotificationType): NotificationPreferenceCategory {
    switch (type) {
      case "OFFER_RECEIVED":
      case "OFFER_SELECTED":
        return "offers";
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_FAILED":
        return "payments";
      case "BOOKING_STARTED":
      case "COMPLETION_REQUESTED":
      case "BOOKING_COMPLETED":
        return "bookings";
      case "MESSAGE_RECEIVED":
        return "messages";
      case "DISPUTE_OPENED":
        return "disputes";
      case "REVIEW_RECEIVED":
        return "reviews";
      case "VERIFICATION_DECISION":
        return "bookings";
      default:
        return "bookings";
    }
  }

  /** Committed-event notification: only ever called after a state change has already committed above. */
  private async notify(
    userId: string,
    type: NotificationType,
    title: string,
    detail: { resourceType: NotificationRecord["resourceType"]; resourceId: string; body: string },
  ): Promise<void> {
    const prefs = this.preferences.get(userId) ?? this.defaultPreferences();
    this.preferences.set(userId, prefs);
    const category = this.categoryForType(type);
    // In-app notifications are legally/operationally essential for state
    // visibility, so they are always recorded; only push respects preference.
    const record: NotificationRecord = {
      id: nextId("E0") as unknown as NotificationId,
      userId: userId as unknown as NotificationRecord["userId"],
      type,
      title,
      body: detail.body,
      resourceType: detail.resourceType,
      resourceId: detail.resourceId,
      readAt: null,
      createdAt: nowIso(),
    };
    const list = this.notifications.get(userId) ?? [];
    // Idempotency: do not duplicate an identical committed event record.
    const duplicate = list.some(
      (n) => n.type === type && n.resourceId === detail.resourceId && n.body === detail.body,
    );
    if (!duplicate) {
      list.push(record);
      this.notifications.set(userId, list);
    }
    void prefs[category].push; // push outcome computed on demand via getPushOutcomeForTests if needed
  }

  async listNotifications(userId: string): Promise<ReadonlyArray<NotificationRecord>> {
    await delay();
    return (this.notifications.get(userId) ?? [])
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async markNotificationRead(notificationId: string, userId: string): Promise<void> {
    await delay();
    const list = this.notifications.get(userId) ?? [];
    this.notifications.set(
      userId,
      list.map((n) => (n.id === notificationId && !n.readAt ? { ...n, readAt: nowIso() } : n)),
    );
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await delay();
    const list = this.notifications.get(userId) ?? [];
    const readAt = nowIso();
    this.notifications.set(
      userId,
      list.map((n) => (n.readAt ? n : { ...n, readAt })),
    );
  }

  async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    await delay();
    return this.preferences.get(userId) ?? this.defaultPreferences();
  }

  async setNotificationPreference(
    userId: string,
    category: NotificationPreferenceCategory,
    channel: "inApp" | "push",
    value: boolean,
  ): Promise<NotificationPreferences> {
    await delay();
    const current = this.preferences.get(userId) ?? this.defaultPreferences();
    const next: NotificationPreferences = {
      ...current,
      [category]: {
        ...current[category],
        [channel === "inApp" ? "inApp" : "push"]: value,
      },
    };
    this.preferences.set(userId, next);
    return next;
  }

  // ---------------------------------------------------------------------
  // Support / reports
  // ---------------------------------------------------------------------

  async submitSupportTicket(input: {
    reporterId: string;
    subjectType: "task" | "booking";
    subjectId: string;
    category: "payment" | "safety" | "quality" | "other";
    narrative: string;
    evidence: ReadonlyArray<{ kind: "image" | "video" | "note"; fileName?: string; note?: string }>;
  }): Promise<SupportTicketRecord> {
    await delay();
    const record: SupportTicketRecord = {
      id: nextId("F0") as unknown as SupportTicketId,
      reporterId: input.reporterId as unknown as SupportTicketRecord["reporterId"],
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      category: input.category,
      narrative: input.narrative,
      evidence: input.evidence.map((e) => ({
        id: nextId("F1"),
        kind: e.kind,
        note: e.note ?? null,
        fileName: e.fileName ?? null,
      })),
      status: "OPEN",
      createdAt: nowIso(),
      history: [{ at: nowIso(), note: "Ticket submitted." }],
    };
    const list = this.supportTickets.get(input.reporterId) ?? [];
    list.push(record);
    this.supportTickets.set(input.reporterId, list);
    return record;
  }

  async listMySupportTickets(userId: string): Promise<ReadonlyArray<SupportTicketRecord>> {
    await delay();
    return (this.supportTickets.get(userId) ?? [])
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // --- Service catalog ---

  async listCategories(): Promise<ReadonlyArray<MarketplaceCategory>> {
    await delay();
    return SYNTHETIC_CATEGORIES;
  }

  // --- Profiles (self-service) ---

  /**
   * In-memory profile edits, kept per user so the editor round-trips the same
   * way it does against the real backend. The Tasker section is only offered to
   * a known synthetic Tasker, mirroring the backend rule that only an approved,
   * unsuspended Tasker profile is editable.
   */
  async getMyProfile(userId: string): Promise<MyProfileRecord | null> {
    await delay();
    const existing = this.profiles.get(userId);
    if (existing) return existing;

    const tasker = SYNTHETIC_TASKERS.find((entry) => entry.userId === userId);
    const seeded: MyProfileRecord = {
      userId: userId as unknown as MyProfileRecord["userId"],
      displayName: tasker?.displayName ?? "Development user",
      mobile: null,
      cityCode: null,
      barangayCode: null,
      language: "en",
      bio: "",
      avatarPath: null,
      tasker: tasker
        ? {
            publicBio: tasker.profile.publicBio,
            publicExperience: tasker.profile.publicExperience,
            specialtyIds: [],
            serviceCityCodes: tasker.profile.serviceCityCodes,
          }
        : null,
    };
    this.profiles.set(userId, seeded);
    return seeded;
  }

  async updateMyProfile(
    userId: string,
    input: MyProfileUpdateInput,
  ): Promise<UpdateProfileOutcome> {
    const current = await this.getMyProfile(userId);
    if (!current) return { ok: false, message: "No profile for this account." };

    // Validated with the same shared schema the real adapter uses, so the
    // synthetic path cannot accept input the backend would reject.
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

    if (
      current.tasker === null &&
      (input.publicBio !== undefined ||
        input.publicExperience !== undefined ||
        input.specialtyIds !== undefined ||
        input.serviceCityCodes !== undefined)
    ) {
      return { ok: false, message: "Only an approved Tasker profile can be edited." };
    }

    const next: MyProfileRecord = {
      ...current,
      displayName: parsed.data.displayName ?? current.displayName,
      mobile: parsed.data.mobile ?? current.mobile,
      cityCode: parsed.data.cityCode ?? current.cityCode,
      barangayCode: parsed.data.barangayCode ?? current.barangayCode,
      language: parsed.data.language ?? current.language,
      bio: parsed.data.bio ?? current.bio,
      tasker: current.tasker
        ? {
            publicBio: input.publicBio ?? current.tasker.publicBio,
            publicExperience: input.publicExperience ?? current.tasker.publicExperience,
            specialtyIds: input.specialtyIds
              ? [...new Set(input.specialtyIds)]
              : current.tasker.specialtyIds,
            serviceCityCodes: input.serviceCityCodes
              ? [...new Set(input.serviceCityCodes.filter((code: string) => code.trim().length > 0))]
              : current.tasker.serviceCityCodes,
          }
        : null,
    };
    this.profiles.set(userId, next);
    return { ok: true, profile: next };
  }

  async listSpecialtyOptions(): Promise<ReadonlyArray<SpecialtyOption>> {
    await delay();
    return SYNTHETIC_SPECIALTIES;
  }

  async getPublicTaskerProfile(userId: string): Promise<PublicTaskerProfile | null> {
    await delay();
    const tasker = SYNTHETIC_TASKERS.find((entry) => entry.userId === userId);
    if (!tasker) return null;
    const edited = this.profiles.get(userId);
    if (!edited?.tasker) return tasker.profile;
    // Reflect self-service edits in the public projection, while the
    // platform-authoritative trust signals stay as seeded.
    return {
      ...tasker.profile,
      displayName: edited.displayName,
      publicBio: edited.tasker.publicBio,
      publicExperience: edited.tasker.publicExperience,
      serviceCityCodes: edited.tasker.serviceCityCodes,
    };
  }
}

/** Deterministic specialty options for the development profile editor. */
const SYNTHETIC_SPECIALTIES: ReadonlyArray<SpecialtyOption> = [
  { id: "60000000-0000-4000-8000-000000000001", slug: "home-cleaning", name: "Home Cleaning" },
  { id: "60000000-0000-4000-8000-000000000002", slug: "basic-plumbing", name: "Basic Plumbing" },
  { id: "60000000-0000-4000-8000-000000000003", slug: "handyman", name: "Handyman" },
  { id: "60000000-0000-4000-8000-000000000004", slug: "errands", name: "Errands & Delivery" },
];

function toPublicProjection(task: OwnedTaskRecord): PublicTaskFeedItem {
  return {
    id: task.id,
    categoryId: task.draft.categoryId as unknown as PublicTaskFeedItem["categoryId"],
    title: task.draft.title,
    description: task.draft.description,
    budgetCentavos: task.draft.budgetCentavos,
    currency: "PHP",
    status: task.status,
    sameDay: task.draft.sameDay,
    scheduledFor: task.draft.scheduledFor,
    cityCode: task.draft.cityCode,
    barangayCode: task.draft.barangayCode,
    landmark: task.draft.landmark,
    approximateLat: task.draft.approximateLat,
    approximateLng: task.draft.approximateLng,
    publishedAt: task.publishedAt,
    offerCount: task.offerCount,
  };
}

function buildFallbackTaskerMeta(taskerId: string, displayName: string): InternalTasker {
  return {
    userId: taskerId,
    displayName,
    profile: {
      userId: taskerId as unknown as PublicTaskerProfile["userId"],
      displayName,
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
    },
  };
}

function delay(ms = 60): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Re-validates a `searchOpenTasks` call against the shared
 * `taskSearchSchema` bounds (pagination, budget, radius, cross-field
 * `nearLat`/`nearLng` coupling) so an out-of-bounds query can never reach the
 * filter/sort pass just because a caller skipped/bypassed UI-side
 * validation. Mirrors the backend contract: the repository is the last line
 * of defense, not just the form.
 */
function validateSearchBounds(input: {
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
}): typeof input {
  const result = taskSearchSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid task search query: ${result.error.message}`);
  }
  if (
    typeof input.minBudgetCentavos === "number" &&
    typeof input.maxBudgetCentavos === "number" &&
    input.minBudgetCentavos > input.maxBudgetCentavos
  ) {
    throw new Error("Invalid task search query: minBudgetCentavos exceeds maxBudgetCentavos.");
  }
  if (
    typeof input.scheduledFrom === "string" &&
    typeof input.scheduledTo === "string" &&
    new Date(input.scheduledFrom).getTime() > new Date(input.scheduledTo).getTime()
  ) {
    throw new Error("Invalid task search query: scheduledFrom is after scheduledTo.");
  }
  if (
    typeof input.radiusKm === "number" &&
    (typeof input.nearLat !== "number" || typeof input.nearLng !== "number")
  ) {
    throw new Error("Invalid task search query: radiusKm requires nearLat/nearLng.");
  }
  return input;
}

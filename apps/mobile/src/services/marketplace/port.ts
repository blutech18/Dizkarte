import type {
  Paginated,
  PublicTaskerProfile,
  PublicTaskFeedItem,
  TaskId,
  BookingId,
  ConversationId,
} from "@dizkarte/domain";
import type {
  BookingEventRecord,
  BookingRecord,
  CheckoutSessionRecord,
  CheckoutSimulationChoice,
  ConversationRecord,
  DisputeRecord,
  DraftTaskInput,
  EvidenceUploadInput,
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
  OpenDisputeInput,
  OwnedTaskRecord,
  RequestCompletionInput,
  RequestWithdrawalOutcome,
  ReviewInput,
  ReviewPairView,
  SelectOfferOutcome,
  SpecialtyOption,
  SubmitVerificationOutcome,
  SupportTicketRecord,
  TaskerDashboardSnapshot,
  TaskQuestionRecord,
  UpdateProfileOutcome,
  VerificationCaseRecord,
  VerificationDocumentKind,
  WithdrawalRecord,
} from "./types";

/**
 * MobileMarketplacePort.
 *
 * Typed repository/service boundary for the Client task-to-booking lifecycle
 * and the shared post-payment journey (chat, completion, disputes, reviews,
 * notifications, support). A concrete implementation must be either:
 *
 *  - `SyntheticMarketplaceRepository` (development/test only, deterministic,
 *    in-memory), or
 *  - a future real Supabase-backed adapter (task 9) implementing the exact
 *    same port so screens do not change.
 *
 * No implementation of this port may be constructed outside development/test
 * without real backend wiring — `createMarketplaceRepository()` in
 * `factory.ts` is the single place that enforces this.
 */
export interface MobileMarketplacePort {
  // Client "My Tasks"
  listMyTasks(clientId: string): Promise<ReadonlyArray<OwnedTaskRecord>>;
  getOwnedTask(taskId: TaskId, clientId: string): Promise<OwnedTaskRecord | null>;
  saveDraftTask(
    clientId: string,
    draft: DraftTaskInput,
    existingTaskId?: TaskId,
  ): Promise<OwnedTaskRecord>;
  publishTask(
    taskId: TaskId,
    clientId: string,
    verified: boolean,
  ): Promise<
    | { ok: true; task: OwnedTaskRecord }
    | { ok: false; reason: "NOT_VERIFIED" | "FORBIDDEN" | "INVALID_STATE" }
  >;

  // Public discovery (delegates to existing synthetic task feed for parity)
  searchOpenTasks(input: {
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
  }): Promise<Paginated<PublicTaskFeedItem>>;
  getPublicTask(taskId: TaskId): Promise<PublicTaskFeedItem | null>;

  // Questions & offers
  listQuestions(taskId: TaskId): Promise<ReadonlyArray<TaskQuestionRecord>>;
  askQuestion(
    taskId: TaskId,
    authorId: string,
    authorDisplayName: string,
    body: string,
  ): Promise<TaskQuestionRecord>;
  listOffers(taskId: TaskId, viewerId: string): Promise<ReadonlyArray<OfferRecord>>;
  /** Every offer the current Tasker has ever submitted, across all tasks, newest first. */
  listMyOffers(taskerId: string): Promise<ReadonlyArray<MyOfferHistoryItem>>;
  /** Withdraws a still-`SUBMITTED` offer; no-op/false for any other state or non-owner. */
  withdrawOffer(offerId: string, taskerId: string): Promise<{ ok: boolean }>;
  submitOffer(
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
  ): Promise<OfferRecord>;
  selectOffer(
    taskId: TaskId,
    offerId: string,
    clientId: string,
    idempotencyKey: string,
  ): Promise<SelectOfferOutcome>;

  // Checkout boundary
  createCheckoutSession(bookingId: BookingId, clientId: string): Promise<CheckoutSessionRecord>;
  simulateCheckout(
    providerReference: string,
    choice: CheckoutSimulationChoice,
  ): Promise<{ accepted: boolean }>;
  /** Authoritative outcome step — models the provider webhook, distinct from client navigation. */
  processAuthoritativeWebhook(
    providerReference: string,
  ): Promise<{ bookingId: BookingId; status: "CONFIRMED" | "FAILED" } | null>;

  // Bookings
  listMyBookings(userId: string): Promise<ReadonlyArray<BookingRecord>>;
  getBooking(bookingId: BookingId, viewerId: string): Promise<BookingRecord | null>;
  listBookingEvents(bookingId: BookingId): Promise<ReadonlyArray<BookingEventRecord>>;
  startWork(bookingId: BookingId, taskerId: string): Promise<{ ok: boolean }>;
  requestCompletion(input: RequestCompletionInput, taskerId: string): Promise<{ ok: boolean }>;
  confirmCompletion(bookingId: BookingId, clientId: string): Promise<{ ok: boolean }>;
  openDispute(input: OpenDisputeInput, actorId: string): Promise<DisputeRecord | null>;

  // Ledger-derived summary
  getLedgerSummary(userId: string): Promise<LedgerSummary>;

  // Tasker Dashboard (aggregated, read-only projection)
  getTaskerDashboard(taskerId: string): Promise<TaskerDashboardSnapshot>;

  // Withdrawals — provider-backed payout is out of scope (task 9.1); requests
  // always resolve PROVIDER_UNAVAILABLE in this pass, never a fabricated payout.
  listWithdrawals(userId: string): Promise<ReadonlyArray<WithdrawalRecord>>;
  requestWithdrawal(userId: string, amountCentavos: number): Promise<RequestWithdrawalOutcome>;

  // Messaging
  getConversationForBooking(
    bookingId: BookingId,
    viewerId: string,
  ): Promise<ConversationRecord | null>;
  listMessages(
    conversationId: ConversationId,
    viewerId: string,
  ): Promise<ReadonlyArray<MessageRecord>>;
  sendMessage(
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
  ): Promise<MessageRecord>;
  /**
   * Retries a failed send. Only the original sender may retry their own
   * message, only while still a participant of a communication-unlocked
   * booking, and only when the target message's delivery status is
   * `"failed"` — otherwise returns `null` without mutating state.
   */
  retryMessage(
    conversationId: ConversationId,
    clientNonce: string,
    requesterId: string,
  ): Promise<MessageRecord | null>;
  /**
   * Notifies when the conversation gains a message, so the screen can refetch.
   *
   * Signals a change rather than delivering the row: a message and its media
   * commit together but arrive as separate events, and the list read already
   * applies the privacy projection. Returns the unsubscribe function.
   */
  subscribeToConversation(
    conversationId: ConversationId,
    viewerId: string,
    onChange: () => void,
  ): () => void;

  // Reviews
  submitReview(input: ReviewInput, reviewerId: string): Promise<{ ok: boolean; reason?: string }>;
  getReviewPair(bookingId: BookingId, viewerId: string): Promise<ReviewPairView | null>;

  // Identity verification (self-service)
  /**
   * The caller's active verification case, created as a DRAFT if none exists.
   *
   * Returns the case id, which doubles as the storage scope for document
   * uploads, so this must be called before any document is attached.
   */
  startVerification(): Promise<VerificationCaseRecord>;
  /** Records an uploaded document against the caller's active case. */
  addVerificationDocument(input: {
    caseId: string;
    kind: VerificationDocumentKind;
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<{ ok: boolean; reason?: string }>;
  /** Hands the case to the Admin review queue. Fails closed if documents are missing. */
  submitVerification(): Promise<SubmitVerificationOutcome>;

  // Notifications
  listNotifications(userId: string): Promise<ReadonlyArray<NotificationRecord>>;
  markNotificationRead(notificationId: string, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  /** Notifies when a notification is created for this user. Returns the unsubscribe function. */
  subscribeToNotifications(userId: string, onChange: () => void): () => void;
  getNotificationPreferences(userId: string): Promise<NotificationPreferences>;
  setNotificationPreference(
    userId: string,
    category: NotificationPreferenceCategory,
    channel: "inApp" | "push",
    value: boolean,
  ): Promise<NotificationPreferences>;

  // Support / reports
  submitSupportTicket(input: {
    reporterId: string;
    subjectType: "task" | "booking";
    subjectId: string;
    category: "payment" | "safety" | "quality" | "other";
    narrative: string;
    evidence: ReadonlyArray<EvidenceUploadInput>;
  }): Promise<SupportTicketRecord>;
  listMySupportTickets(userId: string): Promise<ReadonlyArray<SupportTicketRecord>>;

  /**
   * Active service categories, newest catalog state first-ordered by the
   * platform's display order. Used by task creation and the browse filters, so
   * the ids returned here are the real `tasks.category_id` references.
   */
  listCategories(): Promise<ReadonlyArray<MarketplaceCategory>>;

  // Profiles (self-service)
  /** The signed-in user's own editable profile, plus their Tasker section when approved. */
  getMyProfile(userId: string): Promise<MyProfileRecord | null>;
  /**
   * Update only the supplied fields. Validation and authorization are re-applied
   * server-side, so a rejected update returns a message rather than throwing.
   */
  updateMyProfile(userId: string, input: MyProfileUpdateInput): Promise<UpdateProfileOutcome>;
  /** Active specialties a Tasker may claim, for the profile editor's picker. */
  listSpecialtyOptions(): Promise<ReadonlyArray<SpecialtyOption>>;
  /** Any Tasker's public trust profile, as shown on offers and task detail. */
  getPublicTaskerProfile(userId: string): Promise<PublicTaskerProfile | null>;
}

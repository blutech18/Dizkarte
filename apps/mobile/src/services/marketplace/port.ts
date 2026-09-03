import type {
  Paginated,
  PublicTaskerProfile,
  PublicTaskFeedItem,
  TaskId,
  BookingId,
  ConversationId,
} from "@dizkarte/domain";
import type {
  AddVerificationDocumentOutcome,
  BookingEventRecord,
  BookingRecord,
  CheckoutSessionRecord,
  CheckoutSimulationChoice,
  ConversationRecord,
  ConversationSummary,
  ReportRecord,
  DisputeRecord,
  DraftTaskInput,
  EvidenceUploadInput,
  LedgerSummary,
  MarketplaceCategory,
  MessageRecord,
  MyOfferHistoryItem,
  MyProfileRecord,
  MyProfileUpdateInput,
  AddPayoutMethodInput,
  BillingAddressInput,
  BillingAddressRecord,
  OfferRegistrationStatus,
  PayoutMethodSummary,
  PsgcBarangay,
  PsgcCity,
  RegistrationActionOutcome,
  NotificationPreferenceCategory,
  NotificationPreferences,
  NotificationRecord,
  OfferRecord,
  OpenDisputeInput,
  OwnedTaskRecord,
  PortfolioItemRecord,
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
  TaskAnswerRecord,
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
  /**
   * Retire the caller's own task before it carries any booking.
   *
   * Only a DRAFT or OPEN task can be cancelled here: from BOOKING_PENDING
   * onward there is money or a commitment attached, and the outcome depends on
   * the cancellation/refund policy that is still an open decision (D13). Any
   * still-live offer is rejected so no Tasker is left believing they are still
   * in the running. Idempotent — cancelling twice succeeds.
   */
  cancelOwnTask(
    taskId: TaskId,
    clientId: string,
  ): Promise<{ readonly ok: boolean; readonly reason?: string }>;

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
    /** Only tasks with zero offers (migration 0047 p_no_offers_only). */
    noOffersOnly?: boolean;
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
  /**
   * Owner replies to a Tasker's question. Only the owning Client may answer;
   * once answered the record is updated in-place (one answer per question).
   */
  answerQuestion(
    questionId: string,
    taskId: TaskId,
    clientId: string,
    answer: string,
  ): Promise<TaskQuestionRecord>;
  /**
   * Owner removes their reply to a question, clearing `answer` and `answered_at`.
   */
  deleteAnswer(
    questionId: string,
    taskId: TaskId,
    clientId: string,
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
  /** The current dispute for a booking (if any), scoped to a booking participant. */
  getDisputeForBooking(bookingId: BookingId, viewerId: string): Promise<DisputeRecord | null>;
  /**
   * Abandon an unpaid booking: cancels it, reopens the task, and returns the
   * chosen offer to the pool so the Client can re-pay or pick another Tasker.
   * Only the booking's Client, and only while it is still PAYMENT_PENDING.
   */
  cancelUnpaidBooking(bookingId: BookingId, clientId: string): Promise<{ ok: boolean }>;

  // Ledger-derived summary
  getLedgerSummary(userId: string): Promise<LedgerSummary>;

  // The signed-in Tasker's own work + earnings projection (aggregated, read-only)
  getTaskerWorkSnapshot(taskerId: string): Promise<TaskerWorkSnapshot>;

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
  /**
   * Every conversation this user participates in, with its last message and
   * their own unread count — the read model behind the Bookings list.
   *
   * Deliberately a separate bounded read rather than "list messages per
   * booking": a list screen must not pull whole threads, and the preview is
   * truncated server-side. Conversations only exist for a payment-confirmed
   * booking, so this exposes no pre-payment content.
   */
  listConversationSummaries(userId: string): Promise<ReadonlyArray<ConversationSummary>>;
  /**
   * Move this viewer's read high-water mark to now. Participant-only,
   * idempotent, and monotonic — a stale or retried call cannot make already-read
   * messages unread again.
   */
  markConversationRead(conversationId: ConversationId, viewerId: string): Promise<void>;

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
  }): Promise<AddVerificationDocumentOutcome>;
  /** Removes one of the caller's documents while the case remains editable. */
  removeVerificationDocument(input: {
    caseId: string;
    documentId: string;
  }): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }>;
  /** Hands the case to the Admin review queue. Fails closed if documents are missing. */
  submitVerification(): Promise<SubmitVerificationOutcome>;

  // Notifications
  listNotifications(userId: string): Promise<ReadonlyArray<NotificationRecord>>;
  markNotificationRead(notificationId: string, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  /** Count of the user's unread (`read_at IS NULL`) notifications, for the header badge. */
  unreadNotificationCount(userId: string): Promise<number>;
  /** Notifies when a notification is created for this user. Returns the unsubscribe function. */
  subscribeToNotifications(userId: string, onChange: () => void): () => void;

  /**
   * Register (or re-enable) a device push token for the signed-in user.
   *
   * The token is what the push-dispatch function delivers to. Idempotent on
   * (user, token): re-registering the same token re-enables it rather than
   * duplicating. The token itself is acquired by the native layer once a
   * development/production build with push entitlements exists.
   */
  registerPushDevice(input: {
    userId: string;
    platform: "ios" | "android";
    tokenReference: string;
  }): Promise<void>;
  /** Disable a device token, e.g. on sign-out or when permission is revoked. */
  disablePushDevice(userId: string, tokenReference: string): Promise<void>;
  getNotificationPreferences(userId: string): Promise<NotificationPreferences>;
  setNotificationPreference(
    userId: string,
    category: NotificationPreferenceCategory,
    channel: "inApp" | "push",
    value: boolean,
  ): Promise<NotificationPreferences>;

  // Support / reports
  /**
   * File a report for Admin review (migration 0048).
   *
   * Server-side rules, not UI conventions: the caller must be able to see the
   * resource (a message only inside a conversation they participate in), a
   * second report for the same resource returns the existing open case instead of
   * stacking duplicates, and reporting yourself or your own message is refused.
   *
   * Opens a case; it does not hide, block, or moderate anything.
   */
  submitReport(input: {
    reporterId: string;
    resourceType: "task" | "user" | "message" | "offer" | "booking";
    resourceId: string;
    category: "fraud" | "harassment" | "inappropriate" | "safety" | "spam" | "other";
    narrative: string;
  }): Promise<ReportRecord>;
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

  /**
   * The active category-guided questions for one category, in display order.
   *
   * Definitions live in the database, so the posting flow asks whatever the
   * catalogue currently defines rather than a hard-coded list.
   */
  listCategoryQuestions(categoryId: string): Promise<ReadonlyArray<TaskQuestionDefinition>>;

  /**
   * The structured answers stored against a task, joined to their question
   * labels and ordered for display. Readable by anyone who can see the task, so
   * a Tasker quoting on an open task gets the specifics.
   */
  listTaskAnswers(taskId: TaskId): Promise<ReadonlyArray<TaskAnswerRecord>>;

  // Offer registration ("Finish registration" gate)
  /** Live completion flags for the three pre-offer registration items. */
  getOfferRegistrationStatus(userId: string): Promise<OfferRegistrationStatus>;
  /** Validate + persist the caller's mobile number (PH format). */
  saveRegistrationMobile(userId: string, mobile: string): Promise<RegistrationActionOutcome>;
  /** The caller's payout methods (masked, owner-only). */
  listPayoutMethods(userId: string): Promise<ReadonlyArray<PayoutMethodSummary>>;
  /** Add a tokenized payout method. The raw account never leaves the device. */
  addPayoutMethod(userId: string, input: AddPayoutMethodInput): Promise<RegistrationActionOutcome>;
  /** The caller's billing address, or null if not set. */
  getBillingAddress(userId: string): Promise<BillingAddressRecord | null>;
  /** Upsert the caller's billing address. */
  saveBillingAddress(
    userId: string,
    input: BillingAddressInput,
  ): Promise<RegistrationActionOutcome>;

  // PSGC localities (canonical city/barangay lookup — decision D14)
  /** Search cities/municipalities by name. */
  searchCities(keyword: string): Promise<ReadonlyArray<PsgcCity>>;
  /** Search barangays within a city (by its 6-digit code) by name. */
  searchBarangays(city6: string, keyword: string): Promise<ReadonlyArray<PsgcBarangay>>;
  /** Resolve a stored 6-digit city code back to its record (for prefill display). */
  getCityByCode(city6: string): Promise<PsgcCity | null>;
  /** Resolve a stored 9-digit barangay code back to its record (for prefill display). */
  getBarangayByCode(code: string): Promise<PsgcBarangay | null>;

  // Profiles (self-service)
  /** The signed-in user's own editable profile, plus their Tasker section when approved. */
  getMyProfile(userId: string): Promise<MyProfileRecord | null> /**
   * Update only the supplied fields. Validation and authorization are re-applied
   * server-side, so a rejected update returns a message rather than throwing.
   */;
  updateMyProfile(userId: string, input: MyProfileUpdateInput): Promise<UpdateProfileOutcome>;
  /** Active specialties a Tasker may claim, for the profile editor's picker. */
  listSpecialtyOptions(): Promise<ReadonlyArray<SpecialtyOption>>;
  /** Any Tasker's public trust profile, as shown on offers and task detail. */
  getPublicTaskerProfile(userId: string): Promise<PublicTaskerProfile | null>;

  // Tasker application (self-service onboarding)
  /**
   * The signed-in user's current Tasker application, or `null` if they have
   * never applied. Used to show the review status and to prefill a resubmission.
   */
  getMyTaskerApplication(userId: string): Promise<TaskerApplicationRecord | null>;
  /**
   * Assemble and submit the caller's Tasker application in one atomic step:
   * validates the details, sets (or resubmits) the application to SUBMITTED, and
   * replaces the specialty set and service area. Re-applied server-side, so a
   * rejected submission returns a message rather than throwing.
   */
  submitTaskerApplication(
    userId: string,
    input: SubmitTaskerApplicationInput,
  ): Promise<SubmitTaskerApplicationOutcome>;

  // Portfolio (Tasker self-service work samples)
  /** The signed-in Tasker's own portfolio items, newest first. */
  listMyPortfolio(userId: string): Promise<ReadonlyArray<PortfolioItemRecord>>;
  /**
   * Any Tasker's *approved* portfolio items, for the public profile and offer
   * comparison (requirement R3 / Phase 2 Wave 2C).
   *
   * Only `APPROVED` items are returned: a pending or rejected work sample has
   * not cleared moderation, so it must never be shown to anyone but its owner.
   * This mirrors the `portfolio_items_select` policy, which already allows any
   * authenticated user to read approved rows.
   */
  listPublicPortfolio(userId: string): Promise<ReadonlyArray<PortfolioItemRecord>>;
  /**
   * Record an already-uploaded portfolio image. The object must already exist in
   * the owner's partition of the private `portfolios` bucket; new items enter
   * moderation as PENDING.
   */
  addPortfolioItem(
    userId: string,
    input: { storagePath: string; caption?: string | null },
  ): Promise<{ ok: boolean; reason?: string }>;
  /** Remove one of the caller's own portfolio items and its stored object. */
  removePortfolioItem(userId: string, itemId: string): Promise<{ ok: boolean }>;
}

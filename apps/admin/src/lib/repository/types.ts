import "server-only";
import type { AdminCapability, Paginated } from "@dizkarte/domain";

/**
 * Admin repository port.
 *
 * Mirrors the design doc's `MarketplaceRepository` pattern: the Admin app
 * depends on this narrow interface, not directly on a data source.
 *
 * Two adapters implement it:
 *  - `supabase-admin-repository.ts` — the real adapter. Reads go through the
 *    signed-in Admin's JWT (anon key + RLS, never the service-role key) using
 *    the capability-scoped base tables and the `admin_*_queue` views; every
 *    mutation and every sensitive detail read calls a privileged SECURITY
 *    DEFINER RPC from `supabase/migrations/0011`–`0013` and `0016`, so each is
 *    capability-checked, reason-bound, and audited in the database.
 *  - `synthetic-admin-repository.ts` — deterministic in-memory adapter, kept
 *    for tests and for offline development.
 */

export type VerificationCaseRow = {
  readonly id: string;
  readonly userDisplayName: string;
  readonly status: "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "RESUBMISSION_REQUIRED";
  readonly submittedAt: string;
  readonly documentCount: number;
};

export type VerificationCaseDetail = VerificationCaseRow & {
  readonly userId: string;
  readonly history: ReadonlyArray<{
    readonly fromStatus: string;
    readonly toStatus: string;
    readonly actor: string;
    readonly reason: string | null;
    readonly at: string;
  }>;
  readonly documents: ReadonlyArray<{ readonly kind: string; readonly signedUrlPreview: string }>;
};

export type TaskerApplicationRow = {
  readonly id: string;
  readonly userDisplayName: string;
  readonly status:
    | "SUBMITTED"
    | "IN_REVIEW"
    | "APPROVED"
    | "REJECTED"
    | "RESUBMISSION_REQUIRED"
    | "SUSPENDED";
  readonly specialties: ReadonlyArray<string>;
  readonly submittedAt: string;
};

export type TaskerApplicationDetail = TaskerApplicationRow & {
  readonly bio: string;
  readonly experience: string;
  readonly serviceAreas: ReadonlyArray<string>;
  readonly portfolioCount: number;
  readonly payoutTokenBoundaryLabel: string;
};

export type UserRow = {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly accountStatus: "active" | "suspended" | "banned" | "deactivated";
  readonly identityVerified: boolean;
  readonly createdAt: string;
};

export type TaskRow = {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly budgetCentavos: number;
  readonly cityCode: string;
  readonly categorySlug: string;
  readonly flagged: boolean;
  readonly createdAt: string;
};

export type ReportStatus = "OPEN" | "TRIAGED" | "ACTIONED" | "DISMISSED";

export type ReportRow = {
  readonly id: string;
  readonly resourceType: string;
  readonly category: string;
  readonly status: ReportStatus;
  readonly reporterDisplayName: string;
  readonly createdAt: string;
  readonly assignee: string | null;
};

export type DisputeStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "REJECTED" | "CANCELLED";

export type DisputeRow = {
  readonly id: string;
  readonly bookingId: string;
  readonly status: DisputeStatus;
  readonly amountCentavos: number;
  readonly openedAt: string;
  readonly assignee: string | null;
};

export type MediaModerationStatus = "PENDING" | "APPROVED" | "REJECTED" | "HIDDEN";

/**
 * One task photo or clip awaiting or holding a moderation decision.
 *
 * `storagePath` is present because deciding on an image means looking at it, and
 * the bucket is private: the Admin UI exchanges this key for a short-lived
 * signed URL. It is never rendered as text.
 */
export type TaskMediaRow = {
  readonly id: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly kind: "image" | "video";
  readonly storagePath: string;
  readonly moderationStatus: MediaModerationStatus;
  readonly createdAt: string;
};

/** A refund record. Requesting one is a payment-detail action; this is oversight. */
export type RefundRow = {
  readonly id: string;
  readonly paymentIntentId: string;
  readonly bookingId: string | null;
  readonly amountCentavos: number;
  readonly status: "REQUESTED" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  readonly reason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ReviewModerationStatus = "HIDDEN" | "REVEALED" | "MODERATED";

/**
 * A review as the moderation queue shows it.
 *
 * The comment text is included because moderating a review is impossible without
 * reading it — unlike evidence and chat, where the Admin surfaces deliberately
 * show metadata only.
 */
export type ReviewRow = {
  readonly id: string;
  readonly bookingId: string;
  readonly taskTitle: string;
  readonly reviewerDisplayName: string;
  readonly revieweeDisplayName: string;
  readonly score: number;
  readonly comment: string;
  readonly status: ReviewModerationStatus;
  readonly submittedAt: string;
};

export type TicketStatus = "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";

export type TicketRow = {
  readonly id: string;
  readonly subject: string;
  readonly category: string;
  readonly status: TicketStatus;
  readonly requesterDisplayName: string;
  readonly updatedAt: string;
  readonly assignee: string | null;
};

/**
 * Privacy-safe evidence metadata.
 *
 * Never a raw storage path, exact location, chat body, government ID, or
 * provider payload: an attachment is identified by its file name only, and the
 * bytes stay behind `admin_authorize_object_read`.
 *
 * MIME type, size, and a review state were previously carried here and filled
 * with constants, because `public.evidence` stores none of them. Fields that can
 * only ever be invented are worse than absent — a reviewer reading
 * "application/octet-stream, 0 bytes, pending" would reasonably believe it.
 */
export type EvidenceMetadata = {
  readonly kind: "attachment" | "note";
  /** Final path segment of the stored object; `null` for a note. */
  readonly fileName: string | null;
  /** Text the submitter typed; `null` for an attachment. */
  readonly note: string | null;
  readonly submittedAt: string;
};

export type CaseHistoryEvent = {
  readonly type: "status" | "assignment";
  readonly fromValue: string | null;
  readonly toValue: string;
  readonly actor: string;
  readonly capability: AdminCapability | null;
  readonly reason: string | null;
  readonly at: string;
};

/**
 * Sensitive-detail access is assignment-gated (requirement 4.6.6): only the
 * explicitly assigned Admin may read `narrative`/`evidence`. Callers that are
 * not the assignee receive `restricted: true` and zero narrative/evidence,
 * even when they hold `ADMIN_SUPER` — capability grants queue visibility, not
 * implicit sensitive-detail read.
 */
export type CaseDetailAccess =
  | { readonly restricted: false }
  | { readonly restricted: true; readonly reason: "unassigned" | "assigned-to-other" };

export type ReportDetail = ReportRow & {
  readonly access: CaseDetailAccess;
  readonly caseSubject: { readonly resourceType: string; readonly resourceLabel: string };
  readonly narrative: string | null;
  readonly evidence: ReadonlyArray<EvidenceMetadata>;
  readonly history: ReadonlyArray<CaseHistoryEvent>;
};

export type DisputeDetail = DisputeRow & {
  readonly access: CaseDetailAccess;
  readonly caseSubject: { readonly resourceType: "booking"; readonly resourceLabel: string };
  readonly narrative: string | null;
  readonly evidence: ReadonlyArray<EvidenceMetadata>;
  readonly history: ReadonlyArray<CaseHistoryEvent>;
};

export type TicketDetail = TicketRow & {
  readonly access: CaseDetailAccess;
  readonly caseSubject: { readonly resourceType: string; readonly resourceLabel: string };
  readonly narrative: string | null;
  readonly evidence: ReadonlyArray<EvidenceMetadata>;
  readonly history: ReadonlyArray<CaseHistoryEvent>;
};

/**
 * One message from a booking conversation, as the assigned Admin sees it.
 *
 * Attachment bytes are never included — only how many are attached and their
 * metadata — matching the rule that Admin surfaces do not render underlying
 * media. Reading a transcript is an audited event, not a passive view.
 */
export type ConversationMessage = {
  readonly id: string;
  readonly senderDisplayName: string;
  readonly body: string | null;
  readonly attachmentCount: number;
  readonly sentAt: string;
};

export type ConversationTranscript =
  | { readonly ok: true; readonly messages: ReadonlyArray<ConversationMessage> }
  | { readonly ok: false; readonly message: string };

export type CategoryRow = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly active: boolean;
  readonly displayOrder: number;
  readonly taskCount: number;
  readonly updatedAt: string;
};

export type CategoryHistoryEvent = {
  readonly type: "create" | "rename" | "slug" | "activate" | "deactivate" | "reorder";
  readonly fromValue: string | null;
  readonly toValue: string;
  readonly actor: string;
  readonly capability: AdminCapability | null;
  readonly reason: string | null;
  readonly at: string;
};

export type CategoryDetail = CategoryRow & {
  readonly history: ReadonlyArray<CategoryHistoryEvent>;
};

export type PaymentEventRow = {
  readonly id: string;
  readonly bookingId: string;
  readonly type: string;
  readonly amountCentavos: number;
  readonly status: "RECEIVED" | "PROCESSED" | "DUPLICATE" | "QUARANTINED";
  readonly receivedAt: string;
};

/**
 * Safe provider-event reference metadata (requirement 9/finance privacy):
 * a stable reference id and hash-shaped label only — never the raw provider
 * payload, signature, or secret. Consumers must not attempt to reconstruct
 * the original payload from these fields.
 */
export type ProviderEventRow = {
  readonly id: string;
  readonly bookingId: string;
  readonly type: string;
  readonly amountCentavos: number;
  readonly status: "RECEIVED" | "PROCESSED" | "DUPLICATE" | "QUARANTINED";
  readonly providerReferenceLabel: string;
  readonly payloadHashPreview: string;
  readonly receivedAt: string;
};

/**
 * Union of the real `payment_status` enum plus the derived lifecycle labels the
 * console shows. `CREATED`/`PENDING`/`CONFIRMED`/`FAILED` come straight from
 * `public.payment_intents.status`; `PROTECTED`/`CAPTURED`/`RELEASED`/`REFUNDED`
 * are derived from the balanced ledger transactions recorded against the
 * booking, because the payment row alone does not say where the money sits.
 */
export type PaymentIntentStatus =
  | "CREATED"
  | "PENDING"
  | "CONFIRMED"
  | "PROTECTED"
  | "CAPTURED"
  | "RELEASED"
  | "REFUNDED"
  | "FAILED";

/** Privacy-safe payment intent summary row for `/payments`. */
export type PaymentIntentRow = {
  readonly id: string;
  readonly bookingId: string;
  readonly status: PaymentIntentStatus;
  readonly amountCentavos: number;
  readonly platformFeeCentavos: number;
  readonly createdAt: string;
};

export type RefundSummary = {
  readonly totalRefundedCentavos: number;
  readonly refundCount: number;
};

export type RefundHistoryEntry = {
  readonly id: string;
  readonly amountCentavos: number;
  readonly status: "REQUESTED" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  readonly reason: string | null;
  readonly at: string;
};

/** Privacy-safe payment intent detail for `/payments/[id]`. Never a raw provider payload/secret. */
export type PaymentIntentDetail = PaymentIntentRow & {
  readonly refundSummary: RefundSummary;
  readonly refundHistory: ReadonlyArray<RefundHistoryEntry>;
  readonly providerEvents: ReadonlyArray<ProviderEventRow>;
  readonly ledgerTransactionIds: ReadonlyArray<string>;
  readonly reconciliationStatus: ReconciliationStatus;
  readonly history: ReadonlyArray<CaseHistoryEvent>;
};

/**
 * Ledger account classification. The upper-case members are the real
 * `ledger_account_type` enum values from `supabase/migrations/0001`; the
 * lower-case members are the legacy development-synthetic labels retained so
 * the synthetic adapter and its tests keep working alongside the real adapter.
 */
export type LedgerAccountType =
  | "CLIENT_FUNDING"
  | "PROTECTED_HOLD"
  | "TASKER_AVAILABLE"
  | "PLATFORM_FEE"
  | "PAYOUT_CLEARING"
  | "REFUND_CLEARING"
  | "platform_revenue"
  | "platform_fee"
  | "client_protected"
  | "tasker_payable";

export type LedgerEntryRow = {
  readonly id: string;
  readonly accountType: LedgerAccountType;
  readonly ownerLabel: string;
  readonly amountCentavos: number;
};

/**
 * Ledger transaction classification. Upper-case snake members are the real
 * `ledger_transaction_type` enum values; the short members are the legacy
 * development-synthetic labels kept for the synthetic adapter.
 */
export type LedgerTransactionType =
  | "PAYMENT_CAPTURE"
  | "RELEASE_TO_TASKER"
  | "FEE_CHARGE"
  | "WITHDRAWAL_RESERVE"
  | "WITHDRAWAL_SETTLE"
  | "WITHDRAWAL_REVERSE"
  | "UNFREEZE"
  | "PROTECT"
  | "CAPTURE"
  | "RELEASE"
  | "REFUND"
  | "FREEZE"
  | "FEE";

/**
 * A single append-only, balanced-to-zero synthetic ledger transaction.
 * `entries` must always sum to zero centavos — this is asserted by the
 * repository on every write and covered by a dedicated balance test.
 */
export type LedgerTransactionRow = {
  readonly id: string;
  readonly type: LedgerTransactionType;
  readonly bookingId: string | null;
  readonly paymentIntentId: string | null;
  readonly entries: ReadonlyArray<LedgerEntryRow>;
  readonly createdAt: string;
};

export type FinanceSummary = {
  /**
   * True for the development-synthetic projection (labeled as such in the UI),
   * false when the totals are derived from the real Supabase ledger.
   */
  readonly synthetic: boolean;
  readonly protectedCentavos: number;
  readonly capturedCentavos: number;
  readonly releasedCentavos: number;
  readonly refundedCentavos: number;
  /** Configured platform fee. Zero in this pass — never a hard-coded illustrative rate. */
  readonly platformFeeCentavos: number;
  readonly platformFeeBps: number;
  readonly ledgerBalanceCentavos: number;
};

export type ReconciliationStatus =
  | "MATCHED"
  | "DUPLICATE"
  | "QUARANTINED"
  | "MISMATCH"
  | "UNMATCHED";

/** A single deterministic synthetic reconciliation comparison row. */
export type ReconciliationRow = {
  readonly id: string;
  readonly bookingId: string;
  readonly paymentIntentId: string | null;
  readonly providerEventId: string | null;
  readonly ledgerTransactionId: string | null;
  readonly paymentAmountCentavos: number | null;
  readonly providerEventAmountCentavos: number | null;
  readonly ledgerAmountCentavos: number | null;
  readonly status: ReconciliationStatus;
  readonly differenceCentavos: number;
  readonly checkedAt: string;
};

export type ReconciliationSummary = {
  readonly matched: number;
  readonly duplicate: number;
  readonly quarantined: number;
  readonly mismatch: number;
  readonly unmatched: number;
  readonly total: number;
};

export type WithdrawalRow = {
  readonly id: string;
  readonly taskerDisplayName: string;
  readonly amountCentavos: number;
  readonly status: "REQUESTED" | "RESERVED" | "PROCESSING" | "PAID" | "FAILED" | "CANCELLED";
  readonly requestedAt: string;
};

/**
 * Provider-availability flags surfaced to the UI so unavailable live actions
 * are disabled with an explicit reason rather than silently omitted or, worse,
 * simulated as if they were live (fail-closed finance requirement).
 */
export type FinanceProviderAvailability = {
  readonly paymentProviderAvailable: boolean;
  readonly payoutProviderAvailable: boolean;
  readonly reason: string;
};

/** Well-known error code returned instead of any mutation when a live provider is required but unavailable. */
export const PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE" as const;

export type AuditLogRow = {
  readonly id: string;
  readonly actor: string;
  readonly capability: AdminCapability | null;
  readonly action: string;
  readonly resource: string;
  readonly reason: string | null;
  readonly at: string;
};

export type DashboardSnapshot = {
  readonly pendingVerificationCount: number;
  readonly pendingTaskerApplicationCount: number;
  readonly openReportCount: number;
  readonly openDisputeCount: number;
  readonly openTicketCount: number;
  readonly quarantinedPaymentEventCount: number;
  readonly pendingWithdrawalCount: number;
  /** Bookings in a state that needs human attention (disputed or payment-failed). */
  readonly attentionBookingCount: number;
  readonly revenueTodayCentavos: number;
  readonly netLedgerBalanceCentavos: number;
};

export type PageInput = { readonly page: number; readonly pageSize: number };

// --- Bookings (marketplace workflow oversight) ---

export type BookingStatusValue =
  | "PAYMENT_PENDING"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "COMPLETION_REQUESTED"
  | "COMPLETED"
  | "PAYMENT_FAILED"
  | "CANCELLED"
  | "DISPUTED"
  | "REFUNDED";

/**
 * Booking queue row. Money and identity are shown as display names and agreed
 * amounts only — never contact details, never the exact address.
 */
export type BookingRow = {
  readonly id: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly clientDisplayName: string;
  readonly taskerDisplayName: string;
  readonly agreedCentavos: number;
  readonly status: BookingStatusValue;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type BookingTimelineEvent = {
  readonly id: string;
  readonly fromStatus: string | null;
  readonly toStatus: string;
  readonly actor: string;
  readonly source: string;
  readonly at: string;
};

/**
 * Booking detail for workflow oversight. The accepted offer amount is read from
 * the booking's own `agreed_centavos`, not from the `offers` table: offer rows
 * are assignment-scoped by RLS and are deliberately not exposed here.
 */
export type BookingDetail = BookingRow & {
  readonly currency: string;
  readonly paymentIntentId: string | null;
  readonly paymentStatus: string | null;
  readonly disputeId: string | null;
  readonly timeline: ReadonlyArray<BookingTimelineEvent>;
};

// --- User detail ---

export type UserCapabilityGrant = {
  readonly capability: string;
  readonly grantedAt: string;
  readonly revokedAt: string | null;
};

export type UserModerationEntry = {
  readonly id: string;
  readonly action: string;
  readonly reason: string;
  readonly actor: string;
  readonly capability: AdminCapability | null;
  readonly at: string;
};

/**
 * Consolidated user record for the Admin user detail page. Verification state
 * comes from the capability-scoped `admin_verification_queue` view, which is the
 * only Admin-visible source for another user's verification status.
 */
export type UserDetail = UserRow & {
  readonly language: string;
  readonly cityCode: string | null;
  readonly capabilities: ReadonlyArray<UserCapabilityGrant>;
  readonly verificationStatus: string | null;
  readonly taskerApplicationStatus: string | null;
  readonly taskCount: number;
  readonly bookingCountAsClient: number;
  readonly bookingCountAsTasker: number;
  readonly moderationHistory: ReadonlyArray<UserModerationEntry>;
};

export interface AdminRepository {
  readonly synthetic: boolean;
  getDashboardSnapshot(): Promise<DashboardSnapshot>;

  listVerificationCases(
    input: PageInput & { status?: string },
  ): Promise<Paginated<VerificationCaseRow>>;
  getVerificationCase(id: string): Promise<VerificationCaseDetail | null>;
  decideVerificationCase(input: {
    caseId: string;
    decision: "APPROVED" | "REJECTED" | "RESUBMISSION_REQUIRED";
    reason: string;
    actor: string;
  }): Promise<{ ok: boolean; message?: string }>;

  listTaskerApplications(
    input: PageInput & { status?: string },
  ): Promise<Paginated<TaskerApplicationRow>>;
  getTaskerApplication(id: string): Promise<TaskerApplicationDetail | null>;
  decideTaskerApplication(input: {
    applicationId: string;
    decision: "APPROVED" | "REJECTED" | "RESUBMISSION_REQUIRED" | "SUSPENDED";
    reason: string;
    actor: string;
  }): Promise<{ ok: boolean; message?: string }>;

  /**
   * Users, optionally narrowed by display name and account status.
   *
   * The status filter is what makes suspended and banned accounts reviewable as a
   * set; without it, finding them meant paging the whole directory.
   */
  listUsers(input: PageInput & { query?: string; status?: string }): Promise<Paginated<UserRow>>;
  /** Consolidated user record for the detail page. */
  getUser(userId: string): Promise<UserDetail | null>;
  setUserAccountStatus(input: {
    userId: string;
    status: "active" | "suspended" | "banned";
    reason: string;
    actor: string;
  }): Promise<{ ok: boolean; message?: string }>;

  listTasks(
    input: PageInput & {
      status?: string;
      query?: string;
      categoryId?: string;
      cityCode?: string;
    },
  ): Promise<Paginated<TaskRow>>;
  moderateTask(input: {
    taskId: string;
    action: "remove" | "restore";
    reason: string;
    actor: string;
  }): Promise<{ ok: boolean; message?: string }>;

  /** Task photos and clips for moderation, newest first. Filterable by status. */
  listTaskMedia(input: PageInput & { status?: string }): Promise<Paginated<TaskMediaRow>>;
  /**
   * Approve or hide a single attachment.
   *
   * Distinct from `moderateTask`, which flips every attachment on a task at once.
   * One bad photo should not require removing the Client's whole listing.
   */
  moderateTaskMedia(input: {
    mediaId: string;
    action: "approve" | "hide";
    reason: string;
    actor: string;
  }): Promise<{ ok: boolean; message?: string }>;
  /**
   * Short-lived signed URL for one moderation-queue attachment.
   *
   * Returns `null` when the caller is not authorized or the object is gone, so
   * the queue shows an unavailable placeholder rather than failing the page.
   */
  getMediaPreviewUrl(input: { storagePath: string; actor: string }): Promise<string | null>;

  /** Refund records across all payments, newest first. Filterable by status. */
  listRefunds(input: PageInput & { status?: string }): Promise<Paginated<RefundRow>>;

  /** Reviews for moderation, newest first. Filterable by moderation status. */
  listReviews(input: PageInput & { status?: string }): Promise<Paginated<ReviewRow>>;
  /**
   * Hide an abusive review, or restore one that was hidden in error.
   *
   * Hiding also withdraws the score from the reviewee's rating aggregate, so a
   * retracted review stops affecting their average as well as disappearing.
   */
  moderateReview(input: {
    reviewId: string;
    action: "hide" | "restore";
    reason: string;
    actor: string;
  }): Promise<{ ok: boolean; message?: string }>;

  listReports(input: PageInput & { status?: string }): Promise<Paginated<ReportRow>>;
  getReport(input: { reportId: string; actor: string }): Promise<ReportDetail | null>;
  listDisputes(input: PageInput & { status?: string }): Promise<Paginated<DisputeRow>>;
  getDispute(input: { disputeId: string; actor: string }): Promise<DisputeDetail | null>;
  /**
   * The booking conversation behind a dispute, for the assigned Admin only.
   *
   * Backed by `admin_read_conversation_messages`, which writes an audit entry
   * before returning anything: reading a private transcript is itself a
   * recorded action. A caller who is not the assigned Admin is refused.
   */
  readDisputeConversation(input: {
    disputeId: string;
    reason: string;
    actor: string;
  }): Promise<ConversationTranscript>;
  listTickets(input: PageInput & { status?: string }): Promise<Paginated<TicketRow>>;
  getTicket(input: { ticketId: string; actor: string }): Promise<TicketDetail | null>;

  /**
   * Assign a report, dispute, or ticket to an Admin. Rejects reassignment
   * away from an existing, different assignee (unsafe reassignment) unless
   * `force` is set by a caller that has already confirmed the takeover.
   * Writes a history entry and an audit log entry.
   */
  assignCase(input: {
    resourceType: "report" | "dispute" | "ticket" | "verification";
    resourceId: string;
    assignee: string;
    actor: string;
    capability: AdminCapability | null;
    force?: boolean;
  }): Promise<{ ok: boolean; message?: string }>;

  /**
   * Validate and apply an allowed status transition for a report, dispute,
   * or ticket. Idempotent: re-applying the same target status on a case
   * already in that status succeeds as a no-op rather than erroring.
   */
  transitionCaseStatus(input: {
    resourceType: "report" | "dispute" | "ticket";
    resourceId: string;
    toStatus: string;
    reason: string;
    actor: string;
    capability: AdminCapability | null;
  }): Promise<{ ok: boolean; message?: string }>;

  listPaymentEvents(input: PageInput & { status?: string }): Promise<Paginated<PaymentEventRow>>;

  getFinanceProviderAvailability(): FinanceProviderAvailability;
  getFinanceSummary(): Promise<FinanceSummary>;
  listPaymentIntents(
    input: PageInput & { status?: PaymentIntentStatus },
  ): Promise<Paginated<PaymentIntentRow>>;
  getPaymentIntent(id: string): Promise<PaymentIntentDetail | null>;
  /** Look up the payment intent for a booking, used by dispute/payment detail cross-links. */
  getPaymentIntentByBooking(bookingId: string): Promise<PaymentIntentRow | null>;
  listProviderEvents(input: PageInput & { status?: string }): Promise<Paginated<ProviderEventRow>>;

  /**
   * Refund/release provider action. Must return `PROVIDER_UNAVAILABLE`
   * before any booking/refund/ledger/audit mutation because no approved
   * payment provider or refund policy is configured (fail-closed).
   */
  requestRefund(input: {
    paymentIntentId: string;
    reason: string;
    actor: string;
    idempotencyKey: string;
  }): Promise<{ ok: boolean; message?: string; code?: string }>;

  /**
   * Development synthetic freeze command represented by `admin_freeze`.
   * Requires a bounded reason and idempotency key, validates the booking's
   * payment intent is in an eligible state, and appends a balanced FREEZE
   * ledger transaction without rewriting prior entries.
   */
  freezePaymentIntent(input: {
    paymentIntentId: string;
    reason: string;
    actor: string;
    capability: AdminCapability | null;
    idempotencyKey: string;
  }): Promise<{ ok: boolean; message?: string; code?: string }>;

  listReconciliationRows(
    input: PageInput & { status?: ReconciliationStatus },
  ): Promise<Paginated<ReconciliationRow>>;
  getReconciliationSummary(): Promise<ReconciliationSummary>;

  /**
   * Deterministic, auditable, idempotent re-run of the synthetic
   * reconciliation classification. Makes no network/provider call; purely
   * recomputes classifications from the in-memory synthetic ledger/payment/
   * provider-event state.
   */
  rerunReconciliation(input: {
    reason: string;
    actor: string;
    capability: AdminCapability | null;
    idempotencyKey: string;
  }): Promise<{ ok: boolean; message?: string; summary?: ReconciliationSummary }>;

  listWithdrawals(input: PageInput & { status?: string }): Promise<Paginated<WithdrawalRow>>;

  /**
   * Fail-closed payout approval. Must return `PROVIDER_UNAVAILABLE` before
   * any mutation/provider request/audit entry because no approved payout
   * provider is configured.
   */
  approveWithdrawal(input: { withdrawalId: string; reason: string; actor: string }): Promise<{
    ok: boolean;
    message?: string;
    code?: string;
  }>;

  listCategories(
    input: PageInput & { status?: "active" | "inactive" },
  ): Promise<Paginated<CategoryRow>>;
  getCategory(id: string): Promise<CategoryDetail | null>;
  createCategory(input: {
    name: string;
    slug: string;
    actor: string;
    capability: AdminCapability | null;
  }): Promise<{ ok: boolean; message?: string; categoryId?: string }>;
  renameCategory(input: {
    categoryId: string;
    name: string;
    slug: string;
    reason: string;
    actor: string;
    capability: AdminCapability | null;
  }): Promise<{ ok: boolean; message?: string }>;
  setCategoryActive(input: {
    categoryId: string;
    active: boolean;
    reason: string;
    actor: string;
    capability: AdminCapability | null;
  }): Promise<{ ok: boolean; message?: string }>;
  reorderCategory(input: {
    categoryId: string;
    displayOrder: number;
    reason: string;
    actor: string;
    capability: AdminCapability | null;
  }): Promise<{ ok: boolean; message?: string }>;

  /**
   * Booking queue for marketplace-workflow oversight. `bookings` and
   * `booking_events` already carry an `app.is_admin()` read policy, so this is a
   * capability-scoped read with no privileged escalation.
   */
  listBookings(input: PageInput & { status?: string }): Promise<Paginated<BookingRow>>;
  getBooking(bookingId: string): Promise<BookingDetail | null>;

  listAuditLogs(input: PageInput): Promise<Paginated<AuditLogRow>>;
}

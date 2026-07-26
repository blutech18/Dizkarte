import type {
  BookingId,
  BookingStatus,
  ConversationId,
  DisputeId,
  DisputeStatus,
  MessageId,
  NotificationId,
  OfferId,
  OfferStatus,
  PublicTaskerProfile,
  PublicTaskFeedItem,
  ReportId,
  ReviewId,
  ReviewStatus,
  SupportTicketId,
  TaskId,
  TaskQuestionId,
  TaskStatus,
  UserId,
} from "@dizkarte/domain";

/**
 * Mobile marketplace domain-shaped types.
 *
 * These extend the shared `@dizkarte/domain` public DTOs/ids with the extra
 * interactive-state fields the mobile client needs (owner-only task detail,
 * offers, bookings, chat, notifications, disputes, reviews). They are kept
 * mobile-local because the backend RPC/view contract for this exact shape has
 * not been finalized (task 9); when Supabase wiring lands, a real adapter
 * implements the same `MobileMarketplacePort` without UI changes.
 *
 * Public vs private projections are kept structurally separate: an owner-only
 * task record (`OwnedTaskRecord`) is a distinct type from the public feed
 * item and is only ever returned to the task's own Client.
 */

// --- Client "My Tasks" (owner-only) ---

export type DraftTaskInput = {
  readonly categoryId: string;
  readonly title: string;
  readonly description: string;
  readonly budgetCentavos: number;
  readonly scheduledFor: string | null;
  readonly sameDay: boolean;
  readonly landmark: string;
  readonly cityCode: string;
  readonly barangayCode: string;
  readonly approximateLat: number;
  readonly approximateLng: number;
  readonly exactAddress: string;
  readonly exactLat: number;
  readonly exactLng: number;
  readonly media: ReadonlyArray<TaskMediaAttachment>;
};

export type TaskMediaAttachment = {
  readonly id: string;
  readonly kind: "image" | "video";
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
};

export type VerificationDenialReason =
  | "IDENTITY_NOT_VERIFIED"
  | "ACCOUNT_NOT_ACTIVE"
  | "MISSING_CLIENT_CAPABILITY";

/** Owner-only task record — never returned to any user other than the owning Client. */
export type OwnedTaskRecord = {
  readonly id: TaskId;
  readonly clientId: UserId;
  readonly status: TaskStatus;
  readonly draft: DraftTaskInput;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly questionCount: number;
  readonly offerCount: number;
  readonly assignedOfferId: OfferId | null;
  readonly activeBookingId: BookingId | null;
};

// --- Questions & offers ---

export type TaskQuestionRecord = {
  readonly id: TaskQuestionId;
  readonly taskId: TaskId;
  readonly authorId: UserId;
  readonly authorDisplayName: string;
  readonly body: string;
  readonly answer: string | null;
  readonly createdAt: string;
};

export type OfferRecord = {
  readonly id: OfferId;
  readonly taskId: TaskId;
  readonly taskerId: UserId;
  readonly taskerDisplayName: string;
  readonly taskerProfile: PublicTaskerProfile;
  readonly amountCentavos: number;
  readonly message: string;
  readonly etaText: string;
  readonly availabilityText: string;
  readonly experienceText: string;
  readonly status: OfferStatus;
  readonly createdAt: string;
};

export type SelectOfferOutcome =
  | { readonly ok: true; readonly bookingId: BookingId }
  | {
      readonly ok: false;
      readonly reason: "ALREADY_ASSIGNED" | "OFFER_NOT_ELIGIBLE" | "FORBIDDEN";
    };

// --- Bookings ---

export type BookingRecord = {
  readonly id: BookingId;
  readonly taskId: TaskId;
  readonly taskTitle: string;
  readonly clientId: UserId;
  readonly clientDisplayName: string;
  readonly taskerId: UserId;
  readonly taskerDisplayName: string;
  readonly agreedCentavos: number;
  readonly status: BookingStatus;
  readonly idempotencyKey: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly paymentIntentId: string | null;
  readonly exactAddress: string | null;
  readonly exactLat: number | null;
  readonly exactLng: number | null;
  readonly clientContactMasked: string;
  readonly taskerContactMasked: string;
  readonly completionEvidence: ReadonlyArray<CompletionEvidenceItem>;
  readonly disputeId: DisputeId | null;
};

export type CompletionEvidenceItem = {
  readonly id: string;
  readonly kind: "image" | "video" | "note";
  readonly note: string | null;
  readonly fileName: string | null;
  readonly submittedAt: string;
};

export type BookingEventRecord = {
  readonly id: string;
  readonly bookingId: BookingId;
  readonly fromStatus: BookingStatus | null;
  readonly toStatus: BookingStatus;
  readonly actorId: UserId | null;
  readonly source: "client" | "tasker" | "webhook" | "system";
  readonly createdAt: string;
};

// --- Payment (checkout boundary) ---

export type CheckoutSimulationChoice = "success" | "failure" | "cancel" | "retry";

export type CheckoutSessionRecord = {
  readonly bookingId: BookingId;
  readonly paymentIntentId: string;
  readonly providerReference: string;
  readonly checkoutUrl: string;
  readonly amountCentavos: number;
  readonly synthetic: boolean;
  readonly mode: "synthetic" | "sandbox" | "live";
};

export type PaymentOutcome = "PENDING" | "CONFIRMED" | "FAILED";

// --- Messaging ---

export type ConversationRecord = {
  readonly id: ConversationId;
  readonly bookingId: BookingId;
  readonly participantIds: ReadonlyArray<UserId>;
};

export type MessageMediaAttachment = {
  readonly id: string;
  readonly kind: "image" | "video";
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
};

export type MessageDeliveryStatus = "sending" | "sent" | "failed";

export type MessageRecord = {
  readonly id: MessageId;
  readonly conversationId: ConversationId;
  readonly senderId: UserId;
  readonly body: string | null;
  readonly media: ReadonlyArray<MessageMediaAttachment>;
  readonly createdAt: string;
  readonly deliveryStatus: MessageDeliveryStatus;
  readonly clientNonce: string;
};

// --- Notifications ---

export type NotificationType =
  | "OFFER_RECEIVED"
  | "OFFER_SELECTED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_FAILED"
  | "BOOKING_STARTED"
  | "COMPLETION_REQUESTED"
  | "BOOKING_COMPLETED"
  | "DISPUTE_OPENED"
  | "REVIEW_RECEIVED"
  | "MESSAGE_RECEIVED"
  | "VERIFICATION_DECISION";

export type NotificationRecord = {
  readonly id: NotificationId;
  readonly userId: UserId;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly resourceType: "task" | "booking" | "conversation" | "dispute" | "review" | null;
  readonly resourceId: string | null;
  readonly readAt: string | null;
  readonly createdAt: string;
};

export type NotificationPreferenceCategory =
  | "offers"
  | "payments"
  | "bookings"
  | "messages"
  | "disputes"
  | "reviews";

export type NotificationPreferences = Readonly<
  Record<NotificationPreferenceCategory, { readonly inApp: boolean; readonly push: boolean }>
>;

export type PushDeliveryOutcome = {
  readonly attempted: boolean;
  readonly delivered: boolean;
  readonly synthetic: boolean;
  readonly reason: "not_configured" | "delivered" | "suppressed_by_preference";
};

// --- Completion, disputes, reviews ---

export type RequestCompletionInput = {
  readonly bookingId: BookingId;
  readonly note: string;
  readonly evidence: ReadonlyArray<{
    kind: "image" | "video" | "note";
    fileName?: string;
    note?: string;
  }>;
};

export type OpenDisputeInput = {
  readonly bookingId: BookingId;
  readonly reason: string;
};

export type DisputeRecord = {
  readonly id: DisputeId;
  readonly bookingId: BookingId;
  readonly openedBy: UserId;
  readonly reason: string;
  readonly status: DisputeStatus;
  readonly createdAt: string;
};

export type ReviewInput = {
  readonly bookingId: BookingId;
  readonly score: number;
  readonly comment: string;
};

export type ReviewRecord = {
  readonly id: ReviewId;
  readonly bookingId: BookingId;
  readonly reviewerId: UserId;
  readonly revieweeId: UserId;
  readonly score: number;
  readonly comment: string;
  readonly status: ReviewStatus;
  readonly submittedAt: string;
  readonly revealedAt: string | null;
};

/** What the *current* viewer is allowed to see for a booking's review pair. */
export type ReviewPairView = {
  readonly bookingId: BookingId;
  readonly myReview: ReviewRecord | null;
  /** Only populated once both reviews are submitted or the dev reveal deadline has passed. */
  readonly counterpartReview: ReviewRecord | null;
  readonly bothSubmitted: boolean;
  readonly revealDeadline: string | null;
};

// --- Support / reports ---

export type ReportEvidenceItem = {
  readonly id: string;
  readonly kind: "image" | "video" | "note";
  readonly note: string | null;
  readonly fileName: string | null;
};

export type SupportTicketRecord = {
  readonly id: SupportTicketId;
  readonly reporterId: UserId;
  readonly subjectType: "task" | "booking";
  readonly subjectId: string;
  readonly category: "payment" | "safety" | "quality" | "other";
  readonly narrative: string;
  readonly evidence: ReadonlyArray<ReportEvidenceItem>;
  readonly status: "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
  readonly createdAt: string;
  readonly history: ReadonlyArray<{ readonly at: string; readonly note: string }>;
};

export type ReportId_ = ReportId;

// --- Ledger-facing summaries (read-only, derived) ---

export type LedgerSummary = {
  readonly userId: UserId;
  readonly pendingCentavos: number;
  readonly protectedCentavos: number;
  readonly availableCentavos: number;
  readonly reservedCentavos: number;
  readonly withdrawnCentavos: number;
  /** Always true: this is a derived read projection, never directly mutable. */
  readonly derived: true;
};

// --- Withdrawals ---

export type WithdrawalRecord = {
  readonly id: string;
  readonly userId: UserId;
  readonly amountCentavos: number;
  readonly status: WithdrawalRequestStatus;
  readonly requestedAt: string;
  readonly settledAt: string | null;
  readonly failureReason: string | null;
};

export type WithdrawalRequestStatus =
  | "REQUESTED"
  | "RESERVED"
  | "PROCESSING"
  | "PAID"
  | "FAILED"
  | "CANCELLED";

export type RequestWithdrawalOutcome =
  | { readonly ok: true; readonly withdrawal: WithdrawalRecord }
  | {
      readonly ok: false;
      readonly reason: "PROVIDER_UNAVAILABLE" | "INSUFFICIENT_AVAILABLE_BALANCE" | "FORBIDDEN";
    };

// --- Tasker offer history ---

export type MyOfferHistoryItem = {
  readonly offer: OfferRecord;
  readonly taskTitle: string;
  readonly taskStatus: TaskStatus;
  /** True only for a SUBMITTED offer that the Tasker may still withdraw. */
  readonly canWithdraw: boolean;
};

// --- Tasker Dashboard projection ---

export type TaskerDashboardSnapshot = {
  readonly availableWork: ReadonlyArray<PublicTaskFeedItem>;
  readonly activeBookings: ReadonlyArray<BookingRecord>;
  readonly completionRequested: ReadonlyArray<BookingRecord>;
  readonly completedWork: ReadonlyArray<BookingRecord>;
  readonly ledger: LedgerSummary;
  readonly ratingAverage: number | null;
  readonly ratingCount: number;
  readonly completionCount: number;
  /**
   * Always `false` in this pass: no live payout provider is configured
   * (task 9.1). The UI must fail closed on this flag — never render a
   * control that suggests a withdrawal request can actually be paid out —
   * regardless of ledger balance or withdrawal history contents.
   */
  readonly payoutProviderAvailable: false;
};

export { type PublicTaskFeedItem };

// --- Profiles (self-service) ---

export type SpecialtyOption = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
};

/**
 * The signed-in user's own profile.
 *
 * `tasker` is only present for an approved Tasker. The platform-authoritative
 * trust signals (rating, completion count, approval/suspension) are deliberately
 * excluded from the editable shape — they are read through
 * `PublicTaskerProfile`, never round-tripped through an update.
 */
export type MyProfileRecord = {
  readonly userId: UserId;
  readonly displayName: string;
  readonly mobile: string | null;
  readonly cityCode: string | null;
  readonly barangayCode: string | null;
  readonly language: "en" | "fil";
  readonly bio: string;
  readonly avatarPath: string | null;
  readonly tasker: {
    readonly publicBio: string;
    readonly publicExperience: string;
    readonly specialtyIds: ReadonlyArray<string>;
    readonly serviceCityCodes: ReadonlyArray<string>;
  } | null;
};

/**
 * Editable profile fields. Every member is optional so a screen can submit only
 * what changed; omitted fields are left untouched rather than cleared.
 */
export type MyProfileUpdateInput = {
  readonly displayName?: string;
  readonly mobile?: string;
  readonly cityCode?: string;
  readonly barangayCode?: string;
  readonly language?: "en" | "fil";
  readonly bio?: string;
  readonly publicBio?: string;
  readonly publicExperience?: string;
  readonly specialtyIds?: ReadonlyArray<string>;
  readonly serviceCityCodes?: ReadonlyArray<string>;
};

export type UpdateProfileOutcome =
  | { readonly ok: true; readonly profile: MyProfileRecord }
  | { readonly ok: false; readonly message: string };

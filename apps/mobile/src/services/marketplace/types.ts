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
  TaskLocationType,
  TaskQuestionId,
  TaskStatus,
  TaskTimeOfDay,
  UserId,
  VerificationStatus,
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
  /**
   * Coarse preferred time of day, or null/absent when the Client is flexible
   * within the day. Optional so existing callers/records that predate the field
   * remain valid — an absent value is read as "no specific time".
   */
  readonly timeOfDay?: TaskTimeOfDay | null;
  /**
   * Whether the work happens at a place or can be done remotely. Optional so
   * records that predate the field stay valid — absent reads as `in_person`,
   * which is what every task posted before it was physical.
   */
  readonly locationType?: TaskLocationType;
  readonly landmark: string;
  /**
   * Public, area-level drop-off for a removals/delivery task, or null when the
   * task has a single location. Never an exact address.
   */
  readonly dropoffLandmark?: string | null;
  readonly cityCode: string;
  readonly barangayCode: string;
  readonly approximateLat: number;
  readonly approximateLng: number;
  readonly exactAddress: string;
  readonly exactLat: number;
  readonly exactLng: number;
  readonly media: ReadonlyArray<TaskMediaAttachment>;
  /**
   * Answers to the category-guided questions.
   *
   * Optional on purpose: `undefined` means "leave whatever is stored alone".
   * The single-page edit form does not collect answers, so an absent list must
   * never be read as "the Client cleared them".
   */
  readonly answers?: ReadonlyArray<TaskAnswerInput>;
};

/** How a category question is rendered and answered. */
export type TaskQuestionInputKind = "select" | "boolean" | "number" | "text";

/**
 * A category-guided question, defined in the database
 * (`task_question_definitions`) rather than hard-coded in the app, so the set
 * can be reworded or extended without shipping a release.
 */
export type TaskQuestionDefinition = {
  readonly id: string;
  readonly categoryId: string;
  readonly code: string;
  readonly label: string;
  readonly inputKind: TaskQuestionInputKind;
  /** Ordered choice labels; empty unless `inputKind` is "select". */
  readonly options: ReadonlyArray<string>;
  readonly placeholder: string | null;
  readonly required: boolean;
  readonly sortOrder: number;
};

/** One answer written against a task. */
export type TaskAnswerInput = {
  readonly questionId: string;
  readonly answer: string;
};

/** A stored answer joined to the question it belongs to, ready to display. */
export type TaskAnswerRecord = {
  readonly questionId: string;
  readonly code: string;
  readonly label: string;
  readonly answer: string;
  readonly sortOrder: number;
};

export type TaskMediaAttachment = {
  readonly id: string;
  readonly kind: "image" | "video";
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  /** Object key in the private `task-media` bucket; rendered through a signed URL. */
  readonly storagePath: string;
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
  readonly taskDescription?: string | null;
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
  /** Object key in the private `evidence` bucket; `null` for a note-only item. */
  readonly storagePath: string | null;
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
  /** Object key in the private `chat-media` bucket; rendered through a signed URL. */
  readonly storagePath: string;
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

/**
 * One conversation's activity, for a list that must not fetch whole threads.
 *
 * Mirrors `public.conversation_summaries()` (migration 0046). The preview is
 * already truncated server-side, and `unreadCount` counts only the counterpart's
 * messages newer than this viewer's own read high-water mark — a participant's
 * own message is never unread to themselves.
 */
export type ConversationSummary = {
  readonly conversationId: ConversationId;
  readonly bookingId: BookingId;
  /** Null only for a conversation that exists with no message yet. */
  readonly lastMessageAt: string | null;
  /** Truncated body; null when the last message carried media only. */
  readonly lastMessagePreview: string | null;
  readonly lastMessageSenderId: UserId | null;
  readonly lastMessageHasMedia: boolean;
  readonly unreadCount: number;
};

// --- Notifications ---

export type NotificationType =
  | "OFFER_RECEIVED"
  | "OFFER_SELECTED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_FAILED"
  | "BOOKING_STARTED"
  | "COMPLETION_REQUESTED"
  /** Completion is waiting on the Client (migration 0044 timeout sweep). */
  | "COMPLETION_REMINDER"
  | "BOOKING_COMPLETED"
  | "DISPUTE_OPENED"
  | "REVIEW_RECEIVED"
  /** The blind review window is still open and this user has not reviewed (0043). */
  | "REVIEW_REMINDER"
  /** A task was published in an area this Tasker serves (0043). */
  | "NEARBY_TASK"
  | "MESSAGE_RECEIVED"
  | "VERIFICATION_DECISION"
  // A trust & safety report the Dizkarte team decided (0050).
  | "REPORT_RESOLVED";

export type NotificationRecord = {
  readonly id: NotificationId;
  readonly userId: UserId;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly resourceType:
    | "task"
    | "booking"
    | "conversation"
    | "dispute"
    | "review"
    | "report"
    | null;
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
  | "reviews"
  | "nearby"
  | "promotions"
  | "safety";

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
  readonly evidence: ReadonlyArray<EvidenceUploadInput>;
};

/**
 * One evidence item being submitted.
 *
 * A file item carries the key of an object already uploaded to the private
 * `evidence` bucket; a note item carries text and no object. The union is kept
 * loose (both fields optional) because the same shape is used for completion
 * evidence and support-ticket evidence, and the repository decides which
 * representation to store.
 */
export type EvidenceUploadInput = {
  readonly kind: "image" | "video" | "note";
  readonly fileName?: string;
  readonly note?: string;
  readonly storagePath?: string;
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

// --- Identity verification ---

export type VerificationDocumentKind = "government_id_front" | "government_id_back" | "selfie";

export type VerificationDocumentRecord = {
  readonly id: string;
  readonly kind: VerificationDocumentKind;
  readonly storagePath: string;
  readonly createdAt: string;
};

export type AddVerificationDocumentOutcome =
  | { readonly ok: true; readonly document: VerificationDocumentRecord }
  | { readonly ok: false; readonly reason: string };

/**
 * The caller's own verification case.
 *
 * `documents` lists only what has been attached since the last decision, which
 * is the set `submit_verification` actually validates — showing older files
 * would make a resubmission look complete when the server will reject it.
 */
export type VerificationCaseRecord = {
  readonly id: string;
  readonly status: VerificationStatus;
  readonly version: number;
  readonly submittedAt: string | null;
  readonly decidedAt: string | null;
  readonly decisionReason: string | null;
  readonly documents: ReadonlyArray<VerificationDocumentRecord>;
};

export type SubmitVerificationOutcome =
  | { readonly ok: true; readonly case: VerificationCaseRecord }
  | { readonly ok: false; readonly reason: string };

// --- Support / reports ---

export type ReportEvidenceItem = {
  readonly id: string;
  readonly kind: "image" | "video" | "note";
  /** Object key in the private `evidence` bucket; `null` for a note-only item. */
  readonly storagePath?: string | null;
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

/**
 * A trust & safety report, as returned by `submit_report` (migration 0048).
 *
 * `status` is the Admin case state; the app only ever creates OPEN reports and
 * re-submitting returns the existing open case, so a client never sees a
 * duplicate.
 */
export type ReportRecord = {
  readonly id: ReportId;
  readonly reporterId: UserId;
  readonly resourceType: "task" | "user" | "message" | "offer" | "booking";
  readonly resourceId: string;
  readonly category: "fraud" | "harassment" | "inappropriate" | "safety" | "spam" | "other";
  readonly narrative: string;
  readonly status: "OPEN" | "TRIAGED" | "ACTIONED" | "DISMISSED";
  readonly createdAt: string;
};

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

// --- Tasker work + earnings projection (the signed-in Tasker's own read model) ---

export type TaskerWorkSnapshot = {
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
  readonly avatarPath?: string | null;
  readonly publicBio?: string;
  readonly publicExperience?: string;
  readonly specialtyIds?: ReadonlyArray<string>;
  readonly serviceCityCodes?: ReadonlyArray<string>;
};

export type UpdateProfileOutcome =
  | { readonly ok: true; readonly profile: MyProfileRecord }
  | { readonly ok: false; readonly message: string };

// --- Offer registration ("Finish registration" gate) ---

/**
 * Completion flags for the three self-service items a Tasker must provide before
 * they can make an offer (mirrors the Airtasker "Finish registration" gate).
 * Read live from `my_offer_registration_status`, so the checklist is dynamic.
 */
export type OfferRegistrationStatus = {
  readonly mobileComplete: boolean;
  readonly bankComplete: boolean;
  readonly billingComplete: boolean;
};

/** True only when every required registration item is complete. */
export function isOfferRegistrationComplete(status: OfferRegistrationStatus): boolean {
  return status.mobileComplete && status.bankComplete && status.billingComplete;
}

export type BillingAddressRecord = {
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly country: string;
};

export type BillingAddressInput = {
  readonly line1: string;
  readonly line2?: string | null;
  readonly city: string;
  readonly region?: string | null;
  readonly postalCode?: string | null;
  readonly country?: string;
};

/**
 * A Tasker payout method as shown to its owner. Only the provider and a masked
 * label are ever exposed — never a raw wallet/card/account credential (the raw
 * value never leaves the device; the server stores an opaque token).
 */
export type PayoutMethodSummary = {
  readonly id: string;
  readonly provider: string;
  readonly maskedLabel: string;
  readonly status: "active" | "disabled";
};

export type AddPayoutMethodInput = {
  /** Provider key, e.g. `PH_GCASH`, `PH_MAYA`, `PH_BANK`. */
  readonly provider: string;
  /** Masked, display-only label, e.g. `GCash ••••4567`. Never the full number. */
  readonly maskedLabel: string;
};

/** Result of a registration write that fails closed with a user-facing reason. */
export type RegistrationActionOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

// --- PSGC localities (canonical city/barangay reference, decision D14) ---

/** A PSGC city or municipality. `city6` is the 6-digit code stored as `city_code`. */
export type PsgcCity = {
  readonly code: string;
  readonly city6: string;
  readonly name: string;
  readonly provinceName: string | null;
  readonly isCity: boolean;
};

/** A PSGC barangay. `code` is the 9-digit code stored as `barangay_code`. */
export type PsgcBarangay = {
  readonly code: string;
  readonly name: string;
  readonly city6: string;
};

// --- Tasker application (self-service onboarding) ---

/**
 * The signed-in user's current Tasker application, as they can see it.
 *
 * Present only once the user has submitted one. The public trust signals set at
 * approval time (rating, completion count) live in `PublicTaskerProfile`, never
 * here, and the payout token itself is never exposed — only which provider was
 * chosen.
 */
export type TaskerApplicationRecord = {
  readonly id: string;
  readonly status:
    | "DRAFT"
    | "SUBMITTED"
    | "IN_REVIEW"
    | "APPROVED"
    | "REJECTED"
    | "RESUBMISSION_REQUIRED"
    | "SUSPENDED";
  readonly bio: string;
  readonly experience: string;
  readonly specialtyIds: ReadonlyArray<string>;
  readonly cityCode: string | null;
  readonly barangayCode: string | null;
  readonly payoutProvider: string | null;
  readonly decisionReason: string | null;
  readonly submittedAt: string | null;
};

/** Everything the Tasker application form collects in a single submission. */
export type SubmitTaskerApplicationInput = {
  readonly bio: string;
  readonly experience: string;
  readonly specialtyIds: ReadonlyArray<string>;
  readonly cityCode: string;
  readonly barangayCode?: string;
  /** Preferred payout provider label only — never a raw wallet/card credential. */
  readonly payoutProvider?: string | null;
};

export type SubmitTaskerApplicationOutcome =
  | { readonly ok: true; readonly application: TaskerApplicationRecord }
  | { readonly ok: false; readonly message: string };

/** A Tasker portfolio work sample. Images live in the private `portfolios` bucket. */
export type PortfolioItemRecord = {
  readonly id: string;
  readonly storagePath: string;
  readonly caption: string | null;
  readonly moderationStatus: "PENDING" | "APPROVED" | "REJECTED" | "HIDDEN";
  readonly createdAt: string;
};

// --- Service catalog ---

/**
 * A selectable service category, as served by the real `categories` table.
 *
 * `id` is the database primary key and is what `tasks.category_id` references,
 * so it must never be a locally invented value — a placeholder id fails the
 * foreign key on task creation and makes every real task render as
 * uncategorized.
 */
export type MarketplaceCategory = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
};

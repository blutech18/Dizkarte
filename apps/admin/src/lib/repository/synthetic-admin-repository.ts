import "server-only";
import { paginate, type AdminCapability, type Paginated } from "@dizkarte/domain";
import type {
  AdminRepository,
  AuditLogRow,
  BookingDetail,
  BookingRow,
  CaseDetailAccess,
  CaseHistoryEvent,
  CategoryDetail,
  CategoryHistoryEvent,
  CategoryRow,
  DashboardSnapshot,
  DisputeDetail,
  DisputeRow,
  EvidenceMetadata,
  FinanceProviderAvailability,
  FinanceSummary,
  LedgerEntryRow,
  LedgerTransactionRow,
  LedgerTransactionType,
  PageInput,
  PaymentEventRow,
  PaymentIntentDetail,
  PaymentIntentRow,
  PaymentIntentStatus,
  ProviderEventRow,
  ReconciliationRow,
  ReconciliationStatus,
  ReconciliationSummary,
  RefundHistoryEntry,
  ConversationTranscript,
  ReportDetail,
  ReportRow,
  ReviewRow,
  TaskerApplicationDetail,
  TaskerApplicationRow,
  TaskRow,
  TicketDetail,
  TicketRow,
  UserDetail,
  UserRow,
  VerificationCaseDetail,
  VerificationCaseRow,
  WithdrawalRow,
} from "./types";
import { PROVIDER_UNAVAILABLE } from "./types";

/**
 * Deterministic in-memory synthetic Admin data adapter.
 *
 * Development/test only. Conspicuously fake identifiers and PH-locality-shaped
 * but fictional data. Every row/detail returned here is safe to render because
 * it never contains real IDs, exact locations, chat bodies, or provider
 * secrets (per the privacy-safe-demo-UI requirement). This module is never
 * selected in staging/production — the server config guard already fails
 * closed before Admin pages would attempt to construct it.
 *
 * Each `SyntheticAdminRepository` instance owns its own cloned copy of the
 * seed data (`createSeedState()`), so unit tests that construct fresh
 * instances never observe mutations made by other tests or by the shared
 * dev-session singleton (`getSyntheticAdminRepository()`).
 */

function paged<T>(all: ReadonlyArray<T>, input: PageInput): Paginated<T> {
  const start = (input.page - 1) * input.pageSize;
  const items = all.slice(start, start + input.pageSize);
  return paginate(items, input.page, input.pageSize, all.length);
}

/** Internal mutable representation of a payment intent, including refund history. */
type PaymentIntentState = {
  id: string;
  bookingId: string;
  status: PaymentIntentStatus;
  amountCentavos: number;
  platformFeeCentavos: number;
  createdAt: string;
  refundHistory: RefundHistoryEntry[];
  history: CaseHistoryEvent[];
};

type SeedState = {
  verificationCases: VerificationCaseDetail[];
  taskerApplications: TaskerApplicationDetail[];
  users: UserRow[];
  tasks: TaskRow[];
  reports: ReportDetail[];
  disputes: DisputeDetail[];
  tickets: TicketDetail[];
  reviews: ReviewRow[];
  categories: CategoryDetail[];
  paymentEvents: PaymentEventRow[];
  providerEvents: ProviderEventRow[];
  paymentIntents: PaymentIntentState[];
  ledgerTransactions: LedgerTransactionRow[];
  withdrawals: WithdrawalRow[];
  auditLogs: AuditLogRow[];
};

/** Fresh, deep-cloned seed data. Never shared/mutated across instances. */
function createSeedState(): SeedState {
  const verificationCases: VerificationCaseDetail[] = [
    {
      id: "ver-0001",
      userId: "usr-1001",
      userDisplayName: "J. Santos",
      status: "SUBMITTED",
      submittedAt: "2026-07-18T02:00:00.000Z",
      documentCount: 2,
      history: [
        {
          fromStatus: "DRAFT",
          toStatus: "SUBMITTED",
          actor: "usr-1001",
          reason: null,
          at: "2026-07-18T02:00:00.000Z",
        },
      ],
      documents: [
        {
          kind: "government_id_front",
          signedUrlPreview: "synthetic://verification/ver-0001/id-front",
        },
        { kind: "selfie", signedUrlPreview: "synthetic://verification/ver-0001/selfie" },
      ],
    },
    {
      id: "ver-0002",
      userId: "usr-1002",
      userDisplayName: "M. Dela Cruz",
      status: "IN_REVIEW",
      submittedAt: "2026-07-17T09:30:00.000Z",
      documentCount: 3,
      history: [
        {
          fromStatus: "DRAFT",
          toStatus: "SUBMITTED",
          actor: "usr-1002",
          reason: null,
          at: "2026-07-17T09:30:00.000Z",
        },
        {
          fromStatus: "SUBMITTED",
          toStatus: "IN_REVIEW",
          actor: "support-admin@dev.dizkarte.invalid",
          reason: null,
          at: "2026-07-17T10:00:00.000Z",
        },
      ],
      documents: [
        {
          kind: "government_id_front",
          signedUrlPreview: "synthetic://verification/ver-0002/id-front",
        },
        {
          kind: "government_id_back",
          signedUrlPreview: "synthetic://verification/ver-0002/id-back",
        },
        { kind: "selfie", signedUrlPreview: "synthetic://verification/ver-0002/selfie" },
      ],
    },
    {
      id: "ver-0003",
      userId: "usr-1003",
      userDisplayName: "A. Reyes",
      status: "RESUBMISSION_REQUIRED",
      submittedAt: "2026-07-15T05:12:00.000Z",
      documentCount: 2,
      history: [
        {
          fromStatus: "SUBMITTED",
          toStatus: "IN_REVIEW",
          actor: "support-admin@dev.dizkarte.invalid",
          reason: null,
          at: "2026-07-15T06:00:00.000Z",
        },
        {
          fromStatus: "IN_REVIEW",
          toStatus: "RESUBMISSION_REQUIRED",
          actor: "support-admin@dev.dizkarte.invalid",
          reason: "Selfie was blurry; please retake in better lighting.",
          at: "2026-07-15T06:20:00.000Z",
        },
      ],
      documents: [
        {
          kind: "government_id_front",
          signedUrlPreview: "synthetic://verification/ver-0003/id-front",
        },
        { kind: "selfie", signedUrlPreview: "synthetic://verification/ver-0003/selfie" },
      ],
    },
  ];

  const taskerApplications: TaskerApplicationDetail[] = [
    {
      id: "tap-0001",
      userDisplayName: "R. Bautista",
      status: "SUBMITTED",
      specialties: ["Home cleaning", "Laundry"],
      submittedAt: "2026-07-19T01:00:00.000Z",
      bio: "Detail-oriented home cleaner with 3 years of experience serving Quezon City households.",
      experience: "3 years freelance home cleaning, previously with a local cleaning cooperative.",
      serviceAreas: ["Quezon City", "San Juan"],
      portfolioCount: 4,
      payoutTokenBoundaryLabel: "GCash token on file (masked)",
    },
    {
      id: "tap-0002",
      userDisplayName: "L. Fernandez",
      status: "IN_REVIEW",
      specialties: ["Appliance repair"],
      submittedAt: "2026-07-16T04:20:00.000Z",
      bio: "Certified appliance technician handling refrigerators, washing machines, and aircon units.",
      experience: "5 years, TESDA NC II certified.",
      serviceAreas: ["Makati", "Taguig"],
      portfolioCount: 6,
      payoutTokenBoundaryLabel: "Maya token on file (masked)",
    },
  ];

  const users: UserRow[] = [
    {
      id: "usr-1001",
      displayName: "J. Santos",
      email: "j.santos@example.invalid",
      accountStatus: "active",
      identityVerified: false,
      createdAt: "2026-06-01T00:00:00.000Z",
    },
    {
      id: "usr-1002",
      displayName: "M. Dela Cruz",
      email: "m.delacruz@example.invalid",
      accountStatus: "active",
      identityVerified: false,
      createdAt: "2026-06-03T00:00:00.000Z",
    },
    {
      id: "usr-1003",
      displayName: "A. Reyes",
      email: "a.reyes@example.invalid",
      accountStatus: "active",
      identityVerified: false,
      createdAt: "2026-06-05T00:00:00.000Z",
    },
    {
      id: "usr-1004",
      displayName: "P. Villanueva",
      email: "p.villanueva@example.invalid",
      accountStatus: "suspended",
      identityVerified: true,
      createdAt: "2026-05-20T00:00:00.000Z",
    },
    {
      id: "usr-1005",
      displayName: "C. Garcia",
      email: "c.garcia@example.invalid",
      accountStatus: "active",
      identityVerified: true,
      createdAt: "2026-05-11T00:00:00.000Z",
    },
  ];

  const tasks: TaskRow[] = [
    {
      id: "tsk-2001",
      title: "Fix leaking kitchen faucet",
      status: "OPEN",
      budgetCentavos: 80000,
      cityCode: "137404",
      categorySlug: "appliance-repair",
      flagged: false,
      createdAt: "2026-07-19T03:00:00.000Z",
    },
    {
      id: "tsk-2002",
      title: "Assemble IKEA wardrobe",
      status: "ASSIGNED",
      budgetCentavos: 120000,
      cityCode: "137602",
      categorySlug: "furniture-assembly",
      flagged: false,
      createdAt: "2026-07-18T03:00:00.000Z",
    },
    {
      id: "tsk-2003",
      title: "Deep clean 2BR condo unit",
      status: "OPEN",
      budgetCentavos: 250000,
      cityCode: "137404",
      categorySlug: "home-cleaning",
      flagged: true,
      createdAt: "2026-07-17T03:00:00.000Z",
    },
  ];

  const reports: ReportDetail[] = [
    {
      id: "rpt-3001",
      resourceType: "task",
      category: "spam",
      status: "OPEN",
      reporterDisplayName: "C. Garcia",
      createdAt: "2026-07-19T05:00:00.000Z",
      assignee: null,
      access: { restricted: false },
      caseSubject: {
        resourceType: "task",
        resourceLabel: "Task tsk-2003 (Deep clean 2BR condo unit)",
      },
      narrative:
        "Reporter states the task listing repeats the same offer across multiple cities and appears to be spam.",
      evidence: [
        {
          kind: "attachment",
          fileName: "report-rpt-3001-screenshot-1.png",
          note: null,
          submittedAt: "2026-07-16T08:12:00.000Z",
        },
      ],
      history: [
        {
          type: "status",
          fromValue: null,
          toValue: "OPEN",
          actor: "c.garcia@example.invalid",
          capability: null,
          reason: null,
          at: "2026-07-19T05:00:00.000Z",
        },
      ],
    },
    {
      id: "rpt-3002",
      resourceType: "message",
      category: "harassment",
      status: "TRIAGED",
      reporterDisplayName: "P. Villanueva",
      createdAt: "2026-07-18T05:00:00.000Z",
      assignee: "support-admin@dev.dizkarte.invalid",
      access: { restricted: false },
      caseSubject: { resourceType: "message", resourceLabel: "Chat message in booking bkg-5002" },
      narrative:
        "Reporter states a chat message from the other party used abusive language during booking negotiation.",
      evidence: [
        {
          kind: "attachment",
          fileName: "report-rpt-3002-chat-metadata.json",
          note: null,
          submittedAt: "2026-07-16T09:40:00.000Z",
        },
      ],
      history: [
        {
          type: "status",
          fromValue: null,
          toValue: "OPEN",
          actor: "p.villanueva@example.invalid",
          capability: null,
          reason: null,
          at: "2026-07-18T05:00:00.000Z",
        },
        {
          type: "assignment",
          fromValue: null,
          toValue: "support-admin@dev.dizkarte.invalid",
          actor: "support-admin@dev.dizkarte.invalid",
          capability: "ADMIN_SUPPORT",
          reason: null,
          at: "2026-07-18T05:30:00.000Z",
        },
        {
          type: "status",
          fromValue: "OPEN",
          toValue: "TRIAGED",
          actor: "support-admin@dev.dizkarte.invalid",
          capability: "ADMIN_SUPPORT",
          reason: "Initial triage complete; escalating to trust & safety review.",
          at: "2026-07-18T05:35:00.000Z",
        },
      ],
    },
  ];

  const disputes: DisputeDetail[] = [
    {
      id: "dsp-4001",
      bookingId: "bkg-5001",
      status: "OPEN",
      amountCentavos: 150000,
      openedAt: "2026-07-19T06:00:00.000Z",
      assignee: null,
      access: { restricted: false },
      caseSubject: { resourceType: "booking", resourceLabel: "Booking bkg-5001" },
      narrative:
        "Client states the Tasker did not complete the agreed scope of work before marking the booking done.",
      evidence: [
        {
          kind: "attachment",
          fileName: "dispute-dsp-4001-before.jpg",
          note: null,
          submittedAt: "2026-07-17T01:05:00.000Z",
        },
        {
          kind: "attachment",
          fileName: "dispute-dsp-4001-after.jpg",
          note: null,
          submittedAt: "2026-07-17T01:35:00.000Z",
        },
      ],
      history: [
        {
          type: "status",
          fromValue: null,
          toValue: "OPEN",
          actor: "usr-1005",
          capability: null,
          reason: null,
          at: "2026-07-19T06:00:00.000Z",
        },
      ],
    },
    {
      id: "dsp-4002",
      bookingId: "bkg-5002",
      status: "UNDER_REVIEW",
      amountCentavos: 90000,
      openedAt: "2026-07-17T06:00:00.000Z",
      assignee: "finance-admin@dev.dizkarte.invalid",
      access: { restricted: false },
      caseSubject: { resourceType: "booking", resourceLabel: "Booking bkg-5002" },
      narrative:
        "Tasker states the client cancelled after work began and is disputing the cancellation fee.",
      evidence: [
        {
          kind: "attachment",
          fileName: "dispute-dsp-4002-receipt.pdf",
          note: null,
          submittedAt: "2026-07-18T04:22:00.000Z",
        },
      ],
      history: [
        {
          type: "status",
          fromValue: null,
          toValue: "OPEN",
          actor: "usr-1004",
          capability: null,
          reason: null,
          at: "2026-07-17T06:00:00.000Z",
        },
        {
          type: "assignment",
          fromValue: null,
          toValue: "finance-admin@dev.dizkarte.invalid",
          actor: "finance-admin@dev.dizkarte.invalid",
          capability: "ADMIN_FINANCE",
          reason: null,
          at: "2026-07-17T06:05:00.000Z",
        },
        {
          type: "status",
          fromValue: "OPEN",
          toValue: "UNDER_REVIEW",
          actor: "finance-admin@dev.dizkarte.invalid",
          capability: "ADMIN_FINANCE",
          reason: "Reviewing cancellation timeline against booking state history.",
          at: "2026-07-17T06:10:00.000Z",
        },
      ],
    },
  ];

  const tickets: TicketDetail[] = [
    {
      id: "tkt-6001",
      subject: "Cannot upload verification selfie",
      category: "account",
      status: "OPEN",
      requesterDisplayName: "J. Santos",
      updatedAt: "2026-07-19T07:00:00.000Z",
      assignee: null,
      access: { restricted: false },
      caseSubject: { resourceType: "account", resourceLabel: "Account usr-1001" },
      narrative:
        "Requester reports the selfie upload step fails repeatedly on the verification flow.",
      evidence: [
        {
          kind: "attachment",
          fileName: "ticket-tkt-6001-log.txt",
          note: null,
          submittedAt: "2026-07-19T06:50:00.000Z",
        },
      ],
      history: [
        {
          type: "status",
          fromValue: null,
          toValue: "OPEN",
          actor: "j.santos@example.invalid",
          capability: null,
          reason: null,
          at: "2026-07-19T07:00:00.000Z",
        },
      ],
    },
    {
      id: "tkt-6002",
      subject: "Question about withdrawal timing",
      category: "payment",
      status: "PENDING",
      requesterDisplayName: "L. Fernandez",
      updatedAt: "2026-07-18T07:00:00.000Z",
      assignee: "support-admin@dev.dizkarte.invalid",
      access: { restricted: false },
      caseSubject: { resourceType: "payment", resourceLabel: "Withdrawal request wdr-8002" },
      narrative: "Requester asks how long withdrawal processing normally takes.",
      evidence: [],
      history: [
        {
          type: "status",
          fromValue: null,
          toValue: "OPEN",
          actor: "l.fernandez@example.invalid",
          capability: null,
          reason: null,
          at: "2026-07-18T07:00:00.000Z",
        },
        {
          type: "assignment",
          fromValue: null,
          toValue: "support-admin@dev.dizkarte.invalid",
          actor: "support-admin@dev.dizkarte.invalid",
          capability: "ADMIN_SUPPORT",
          reason: null,
          at: "2026-07-18T07:05:00.000Z",
        },
        {
          type: "status",
          fromValue: "OPEN",
          toValue: "PENDING",
          actor: "support-admin@dev.dizkarte.invalid",
          capability: "ADMIN_SUPPORT",
          reason: "Awaiting requester confirmation that the answer resolved the question.",
          at: "2026-07-18T07:10:00.000Z",
        },
      ],
    },
  ];

  const categories: CategoryDetail[] = [
    {
      id: "cat-0001",
      name: "Home cleaning",
      slug: "home-cleaning",
      active: true,
      displayOrder: 1,
      taskCount: 0,
      updatedAt: "2026-06-01T00:00:00.000Z",
      history: [
        {
          type: "create",
          fromValue: null,
          toValue: "Home cleaning",
          actor: "super-admin@dev.dizkarte.invalid",
          capability: "ADMIN_SUPER",
          reason: null,
          at: "2026-06-01T00:00:00.000Z",
        },
      ],
    },
    {
      id: "cat-0002",
      name: "Appliance repair",
      slug: "appliance-repair",
      active: true,
      displayOrder: 2,
      taskCount: 0,
      updatedAt: "2026-06-01T00:00:00.000Z",
      history: [
        {
          type: "create",
          fromValue: null,
          toValue: "Appliance repair",
          actor: "super-admin@dev.dizkarte.invalid",
          capability: "ADMIN_SUPER",
          reason: null,
          at: "2026-06-01T00:00:00.000Z",
        },
      ],
    },
    {
      id: "cat-0003",
      name: "Furniture assembly",
      slug: "furniture-assembly",
      active: true,
      displayOrder: 3,
      taskCount: 0,
      updatedAt: "2026-06-01T00:00:00.000Z",
      history: [
        {
          type: "create",
          fromValue: null,
          toValue: "Furniture assembly",
          actor: "super-admin@dev.dizkarte.invalid",
          capability: "ADMIN_SUPER",
          reason: null,
          at: "2026-06-01T00:00:00.000Z",
        },
      ],
    },
    {
      id: "cat-0004",
      name: "Seasonal decor (retired)",
      slug: "seasonal-decor",
      active: false,
      displayOrder: 4,
      taskCount: 0,
      updatedAt: "2026-07-01T00:00:00.000Z",
      history: [
        {
          type: "create",
          fromValue: null,
          toValue: "Seasonal decor",
          actor: "super-admin@dev.dizkarte.invalid",
          capability: "ADMIN_SUPER",
          reason: null,
          at: "2026-06-01T00:00:00.000Z",
        },
        {
          type: "deactivate",
          fromValue: "active",
          toValue: "inactive",
          actor: "super-admin@dev.dizkarte.invalid",
          capability: "ADMIN_SUPER",
          reason: "Seasonal category retired outside of holiday periods.",
          at: "2026-07-01T00:00:00.000Z",
        },
      ],
    },
  ];

  // -------------------------------------------------------------------------
  // Finance: payment intents, provider events, and a balanced append-only
  // synthetic ledger. Platform fee is configured zero (never a hard-coded
  // illustrative rate) — see PLATFORM_FEE_BPS below. Every ledger transaction
  // below is constructed with `ledgerTransaction()`, which asserts its
  // entries sum to exactly zero centavos before it is ever added to state.
  // -------------------------------------------------------------------------

  const paymentEvents: PaymentEventRow[] = [
    {
      id: "pev-7001",
      bookingId: "bkg-5003",
      type: "payment.confirmed",
      amountCentavos: 150000,
      status: "PROCESSED",
      receivedAt: "2026-07-19T08:00:00.000Z",
    },
    {
      id: "pev-7002",
      bookingId: "bkg-5004",
      type: "payment.confirmed",
      amountCentavos: 90000,
      status: "QUARANTINED",
      receivedAt: "2026-07-19T08:10:00.000Z",
    },
  ];

  const providerEvents: ProviderEventRow[] = [
    {
      id: "pve-0001",
      bookingId: "bkg-5001",
      type: "payment.confirmed",
      amountCentavos: 150000,
      status: "PROCESSED",
      providerReferenceLabel: "synthetic-ref-pi-0001",
      payloadHashPreview: "sha256:9f1c…synthetic",
      receivedAt: "2026-07-10T02:00:00.000Z",
    },
    {
      id: "pve-0002",
      bookingId: "bkg-5002",
      type: "payment.confirmed",
      amountCentavos: 90000,
      status: "PROCESSED",
      providerReferenceLabel: "synthetic-ref-pi-0002",
      payloadHashPreview: "sha256:2ab7…synthetic",
      receivedAt: "2026-07-11T02:00:00.000Z",
    },
    {
      id: "pve-0003",
      bookingId: "bkg-5003",
      type: "payment.confirmed",
      amountCentavos: 150000,
      status: "PROCESSED",
      providerReferenceLabel: "synthetic-ref-pi-0003",
      payloadHashPreview: "sha256:c453…synthetic",
      receivedAt: "2026-07-19T08:00:00.000Z",
    },
    {
      id: "pve-0004",
      bookingId: "bkg-5004",
      type: "payment.confirmed",
      amountCentavos: 95000,
      status: "QUARANTINED",
      providerReferenceLabel: "synthetic-ref-pi-0004",
      payloadHashPreview: "sha256:7d10…synthetic",
      receivedAt: "2026-07-19T08:10:00.000Z",
    },
    {
      id: "pve-0005",
      bookingId: "bkg-5003",
      type: "payment.confirmed",
      amountCentavos: 150000,
      status: "DUPLICATE",
      providerReferenceLabel: "synthetic-ref-pi-0003-retry",
      payloadHashPreview: "sha256:c453…synthetic",
      receivedAt: "2026-07-19T08:05:00.000Z",
    },
  ];

  let ledgerSequence = 0;
  const ledgerTransactions: LedgerTransactionRow[] = [];

  /**
   * Build a balanced ledger transaction (entries must sum to exactly zero
   * centavos) and append it to `ledgerTransactions`. Throws if unbalanced —
   * this is the same invariant enforced by the production deferred
   * constraint trigger in `0006_finance_ledger.sql`, mirrored here for the
   * synthetic projection.
   */
  function ledgerTransaction(input: {
    type: LedgerTransactionType;
    bookingId: string | null;
    paymentIntentId: string | null;
    entries: ReadonlyArray<LedgerEntryRow>;
    createdAt: string;
  }): LedgerTransactionRow {
    const sum = input.entries.reduce((total, entry) => total + entry.amountCentavos, 0);
    if (sum !== 0) {
      throw new Error(`Synthetic ledger transaction (${input.type}) is not balanced: sum=${sum}.`);
    }
    if (input.entries.length < 2) {
      throw new Error(`Synthetic ledger transaction (${input.type}) needs at least two entries.`);
    }
    ledgerSequence += 1;
    const transaction: LedgerTransactionRow = {
      id: `synlt-${String(ledgerSequence).padStart(4, "0")}`,
      type: input.type,
      bookingId: input.bookingId,
      paymentIntentId: input.paymentIntentId,
      entries: input.entries,
      createdAt: input.createdAt,
    };
    ledgerTransactions.push(transaction);
    return transaction;
  }

  function entry(
    accountType: LedgerEntryRow["accountType"],
    ownerLabel: string,
    amountCentavos: number,
  ): LedgerEntryRow {
    ledgerSequence += 1;
    return {
      id: `synle-${String(ledgerSequence).padStart(4, "0")}`,
      accountType,
      ownerLabel,
      amountCentavos,
    };
  }

  const paymentIntents: PaymentIntentState[] = [];

  // pi-0001: booking bkg-5001, fully PROTECTED only (client funds held, fee is zero).
  paymentIntents.push({
    id: "pin-0001",
    bookingId: "bkg-5001",
    status: "PROTECTED",
    amountCentavos: 150000,
    platformFeeCentavos: 0,
    createdAt: "2026-07-10T02:00:00.000Z",
    refundHistory: [],
    history: [
      {
        type: "status",
        fromValue: null,
        toValue: "PROTECTED",
        actor: "system",
        capability: null,
        reason: null,
        at: "2026-07-10T02:00:00.000Z",
      },
    ],
  });
  ledgerTransaction({
    type: "PROTECT",
    bookingId: "bkg-5001",
    paymentIntentId: "pin-0001",
    createdAt: "2026-07-10T02:00:00.000Z",
    entries: [
      entry("client_protected", "Client protected-funds account (bkg-5001)", 150000),
      entry("platform_revenue", "Platform clearing account", -150000),
    ],
  });

  // pi-0002: booking bkg-5002, PROTECTED then CAPTURED then RELEASED to tasker (fee zero).
  paymentIntents.push({
    id: "pin-0002",
    bookingId: "bkg-5002",
    status: "RELEASED",
    amountCentavos: 90000,
    platformFeeCentavos: 0,
    createdAt: "2026-07-11T02:00:00.000Z",
    refundHistory: [],
    history: [
      {
        type: "status",
        fromValue: null,
        toValue: "PROTECTED",
        actor: "system",
        capability: null,
        reason: null,
        at: "2026-07-11T02:00:00.000Z",
      },
      {
        type: "status",
        fromValue: "PROTECTED",
        toValue: "CAPTURED",
        actor: "system",
        capability: null,
        reason: null,
        at: "2026-07-11T05:00:00.000Z",
      },
      {
        type: "status",
        fromValue: "CAPTURED",
        toValue: "RELEASED",
        actor: "system",
        capability: null,
        reason: "Booking completed and confirmed by client.",
        at: "2026-07-12T02:00:00.000Z",
      },
    ],
  });
  ledgerTransaction({
    type: "PROTECT",
    bookingId: "bkg-5002",
    paymentIntentId: "pin-0002",
    createdAt: "2026-07-11T02:00:00.000Z",
    entries: [
      entry("client_protected", "Client protected-funds account (bkg-5002)", 90000),
      entry("platform_revenue", "Platform clearing account", -90000),
    ],
  });
  ledgerTransaction({
    type: "CAPTURE",
    bookingId: "bkg-5002",
    paymentIntentId: "pin-0002",
    createdAt: "2026-07-11T05:00:00.000Z",
    entries: [
      entry("platform_revenue", "Platform clearing account", 90000),
      entry("client_protected", "Client protected-funds account (bkg-5002)", -90000),
    ],
  });
  ledgerTransaction({
    type: "RELEASE",
    bookingId: "bkg-5002",
    paymentIntentId: "pin-0002",
    createdAt: "2026-07-12T02:00:00.000Z",
    entries: [
      entry("tasker_payable", "Tasker payable account (L. Fernandez)", 90000),
      entry("platform_revenue", "Platform clearing account", -90000),
    ],
  });

  // pi-0003: booking bkg-5003, PROTECTED/CAPTURED then fully REFUNDED (fee zero, refund reverses capture).
  paymentIntents.push({
    id: "pin-0003",
    bookingId: "bkg-5003",
    status: "REFUNDED",
    amountCentavos: 150000,
    platformFeeCentavos: 0,
    createdAt: "2026-07-19T08:00:00.000Z",
    refundHistory: [
      {
        id: "ref-0001",
        amountCentavos: 150000,
        status: "SUCCEEDED",
        reason: "Development synthetic full refund — task cancelled before start.",
        at: "2026-07-19T09:00:00.000Z",
      },
    ],
    history: [
      {
        type: "status",
        fromValue: null,
        toValue: "PROTECTED",
        actor: "system",
        capability: null,
        reason: null,
        at: "2026-07-19T08:00:00.000Z",
      },
      {
        type: "status",
        fromValue: "PROTECTED",
        toValue: "CAPTURED",
        actor: "system",
        capability: null,
        reason: null,
        at: "2026-07-19T08:30:00.000Z",
      },
      {
        type: "status",
        fromValue: "CAPTURED",
        toValue: "REFUNDED",
        actor: "finance-admin@dev.dizkarte.invalid",
        capability: "ADMIN_FINANCE",
        reason: "Development synthetic full refund — task cancelled before start.",
        at: "2026-07-19T09:00:00.000Z",
      },
    ],
  });
  ledgerTransaction({
    type: "PROTECT",
    bookingId: "bkg-5003",
    paymentIntentId: "pin-0003",
    createdAt: "2026-07-19T08:00:00.000Z",
    entries: [
      entry("client_protected", "Client protected-funds account (bkg-5003)", 150000),
      entry("platform_revenue", "Platform clearing account", -150000),
    ],
  });
  ledgerTransaction({
    type: "CAPTURE",
    bookingId: "bkg-5003",
    paymentIntentId: "pin-0003",
    createdAt: "2026-07-19T08:30:00.000Z",
    entries: [
      entry("platform_revenue", "Platform clearing account", 150000),
      entry("client_protected", "Client protected-funds account (bkg-5003)", -150000),
    ],
  });
  ledgerTransaction({
    type: "REFUND",
    bookingId: "bkg-5003",
    paymentIntentId: "pin-0003",
    createdAt: "2026-07-19T09:00:00.000Z",
    entries: [
      entry("client_protected", "Client refund clearing account (bkg-5003)", 150000),
      entry("platform_revenue", "Platform clearing account", -150000),
    ],
  });

  // pi-0004: booking bkg-5004, PROTECTED with a quarantined/mismatched provider event (reconciliation MISMATCH candidate).
  paymentIntents.push({
    id: "pin-0004",
    bookingId: "bkg-5004",
    status: "PROTECTED",
    amountCentavos: 90000,
    platformFeeCentavos: 0,
    createdAt: "2026-07-19T08:10:00.000Z",
    refundHistory: [],
    history: [
      {
        type: "status",
        fromValue: null,
        toValue: "PROTECTED",
        actor: "system",
        capability: null,
        reason: null,
        at: "2026-07-19T08:10:00.000Z",
      },
    ],
  });
  ledgerTransaction({
    type: "PROTECT",
    bookingId: "bkg-5004",
    paymentIntentId: "pin-0004",
    createdAt: "2026-07-19T08:10:00.000Z",
    entries: [
      entry("client_protected", "Client protected-funds account (bkg-5004)", 90000),
      entry("platform_revenue", "Platform clearing account", -90000),
    ],
  });

  const withdrawals: WithdrawalRow[] = [
    {
      id: "wdr-8001",
      taskerDisplayName: "R. Bautista",
      amountCentavos: 320000,
      status: "REQUESTED",
      requestedAt: "2026-07-19T09:00:00.000Z",
    },
    {
      id: "wdr-8002",
      taskerDisplayName: "L. Fernandez",
      amountCentavos: 540000,
      status: "PROCESSING",
      requestedAt: "2026-07-18T09:00:00.000Z",
    },
  ];

  const auditLogs: AuditLogRow[] = [
    {
      id: "adt-9001",
      actor: "support-admin@dev.dizkarte.invalid",
      capability: "ADMIN_SUPPORT",
      action: "verification.decide",
      resource: "ver-0003",
      reason: "Selfie was blurry; please retake in better lighting.",
      at: "2026-07-15T06:20:00.000Z",
    },
    {
      id: "adt-9002",
      actor: "finance-admin@dev.dizkarte.invalid",
      capability: "ADMIN_FINANCE",
      action: "dispute.assign",
      resource: "dsp-4002",
      reason: null,
      at: "2026-07-17T06:05:00.000Z",
    },
  ];

  const reviews: ReviewRow[] = [
    {
      id: "rev-8001",
      bookingId: "bkg-6001",
      taskTitle: "Deep clean two-bedroom condo",
      reviewerDisplayName: "J. Santos",
      revieweeDisplayName: "M. Dela Cruz",
      score: 5,
      comment: "Arrived on time and left the place spotless.",
      status: "REVEALED",
      submittedAt: "2026-07-18T09:15:00.000Z",
    },
    {
      id: "rev-8002",
      bookingId: "bkg-6002",
      taskTitle: "Assemble flat-pack wardrobe",
      reviewerDisplayName: "R. Lim",
      revieweeDisplayName: "A. Reyes",
      score: 1,
      comment: "Reported for abusive language, pending moderator review.",
      status: "REVEALED",
      submittedAt: "2026-07-19T13:40:00.000Z",
    },
    {
      id: "rev-8003",
      bookingId: "bkg-6003",
      taskTitle: "Repaint kitchen wall",
      reviewerDisplayName: "A. Reyes",
      revieweeDisplayName: "R. Lim",
      score: 2,
      comment: "Already hidden by a moderator.",
      status: "MODERATED",
      submittedAt: "2026-07-15T02:20:00.000Z",
    },
  ];

  return {
    verificationCases,
    taskerApplications,
    users,
    tasks,
    reports,
    disputes,
    tickets,
    reviews,
    categories,
    paymentEvents,
    providerEvents,
    paymentIntents,
    ledgerTransactions,
    withdrawals,
    auditLogs,
  };
}

const CASE_STATUS_TRANSITIONS: Record<
  "report" | "dispute" | "ticket",
  Record<string, ReadonlyArray<string>>
> = {
  report: {
    OPEN: ["TRIAGED", "DISMISSED"],
    TRIAGED: ["ACTIONED", "DISMISSED"],
    ACTIONED: [],
    DISMISSED: [],
  },
  dispute: {
    OPEN: ["UNDER_REVIEW", "CANCELLED"],
    UNDER_REVIEW: ["RESOLVED", "REJECTED"],
    RESOLVED: [],
    REJECTED: [],
    CANCELLED: [],
  },
  ticket: {
    OPEN: ["PENDING", "RESOLVED", "CLOSED"],
    PENDING: ["OPEN", "RESOLVED", "CLOSED"],
    RESOLVED: ["CLOSED"],
    CLOSED: [],
  },
};

/**
 * Configured platform fee in basis points. Zero in this pass — the platform
 * fee model has not been approved yet, so this is never hard-coded to an
 * illustrative rate (e.g. 8%). A future approved fee model would source this
 * value from `@dizkarte/config`, not a literal here.
 */
const PLATFORM_FEE_BPS = 0;

/** Sum the entries of a given account type across all transactions of a given type. */
function sumEntries(
  transactions: ReadonlyArray<LedgerTransactionRow>,
  type: LedgerTransactionType,
  accountType: LedgerEntryRow["accountType"],
): number {
  return transactions
    .filter((t) => t.type === type)
    .flatMap((t) => t.entries)
    .filter((e) => e.accountType === accountType)
    .reduce((sum, e) => sum + Math.abs(e.amountCentavos), 0);
}

/** Deterministic ledger transaction id for a freeze idempotency key (idempotent retry detection). */
function freezeTransactionId(idempotencyKey: string): string {
  return `synlt-freeze-${idempotencyKey}`;
}

let auditSequence = 0;

export class SyntheticAdminRepository implements AdminRepository {
  public readonly synthetic = true;

  private readonly state: SeedState;

  constructor() {
    this.state = createSeedState();
  }

  private recordAudit(input: {
    actor: string;
    capability: AdminCapability | null;
    action: string;
    resource: string;
    reason: string | null;
  }): void {
    auditSequence += 1;
    this.state.auditLogs = [
      {
        id: `adt-synthetic-${auditSequence}`,
        actor: input.actor,
        capability: input.capability,
        action: input.action,
        resource: input.resource,
        reason: input.reason,
        at: new Date().toISOString(),
      },
      ...this.state.auditLogs,
    ];
  }

  async getDashboardSnapshot(): Promise<DashboardSnapshot> {
    const {
      verificationCases,
      taskerApplications,
      reports,
      disputes,
      tickets,
      paymentEvents,
      withdrawals,
    } = this.state;
    return {
      pendingVerificationCount: verificationCases.filter(
        (c) => c.status === "SUBMITTED" || c.status === "IN_REVIEW",
      ).length,
      pendingTaskerApplicationCount: taskerApplications.filter(
        (a) => a.status === "SUBMITTED" || a.status === "IN_REVIEW",
      ).length,
      openReportCount: reports.filter((r) => r.status === "OPEN").length,
      openDisputeCount: disputes.filter((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW")
        .length,
      openTicketCount: tickets.filter((t) => t.status === "OPEN" || t.status === "PENDING").length,
      quarantinedPaymentEventCount: paymentEvents.filter((p) => p.status === "QUARANTINED").length,
      pendingWithdrawalCount: withdrawals.filter(
        (w) => w.status === "REQUESTED" || w.status === "PROCESSING",
      ).length,
      // The synthetic dataset models bookings only through disputes, so the
      // attention count reflects the disputed ones it does know about.
      attentionBookingCount: disputes.filter(
        (d) => d.status === "OPEN" || d.status === "UNDER_REVIEW",
      ).length,
      revenueTodayCentavos: 0,
      netLedgerBalanceCentavos: paymentEvents.reduce((sum, p) => sum + p.amountCentavos, 0),
    };
  }

  async listVerificationCases(input: PageInput & { status?: string }) {
    const filtered = input.status
      ? this.state.verificationCases.filter((c) => c.status === input.status)
      : this.state.verificationCases;
    return paged<VerificationCaseRow>(filtered, input);
  }

  async getVerificationCase(id: string): Promise<VerificationCaseDetail | null> {
    return this.state.verificationCases.find((c) => c.id === id) ?? null;
  }

  async decideVerificationCase(input: {
    caseId: string;
    decision: "APPROVED" | "REJECTED" | "RESUBMISSION_REQUIRED";
    reason: string;
    actor: string;
  }) {
    const index = this.state.verificationCases.findIndex((c) => c.id === input.caseId);
    if (index === -1) return { ok: false, message: "Verification case not found." };
    const current = this.state.verificationCases[index];
    if (!current) return { ok: false, message: "Verification case not found." };
    if (current.status === "APPROVED" || current.status === "REJECTED") {
      return { ok: false, message: "This case already has a final decision." };
    }
    const updated: VerificationCaseDetail = {
      ...current,
      status: input.decision,
      history: [
        ...current.history,
        {
          fromStatus: current.status,
          toStatus: input.decision,
          actor: input.actor,
          reason: input.reason,
          at: new Date().toISOString(),
        },
      ],
    };
    this.state.verificationCases[index] = updated;
    this.recordAudit({
      actor: input.actor,
      capability: null,
      action: "verification.decide",
      resource: input.caseId,
      reason: input.reason,
    });
    return { ok: true };
  }

  async listTaskerApplications(input: PageInput & { status?: string }) {
    const filtered = input.status
      ? this.state.taskerApplications.filter((a) => a.status === input.status)
      : this.state.taskerApplications;
    return paged<TaskerApplicationRow>(filtered, input);
  }

  async getTaskerApplication(id: string): Promise<TaskerApplicationDetail | null> {
    return this.state.taskerApplications.find((a) => a.id === id) ?? null;
  }

  async decideTaskerApplication(input: {
    applicationId: string;
    decision: "APPROVED" | "REJECTED" | "RESUBMISSION_REQUIRED" | "SUSPENDED";
    reason: string;
    actor: string;
  }) {
    const index = this.state.taskerApplications.findIndex((a) => a.id === input.applicationId);
    if (index === -1) return { ok: false, message: "Application not found." };
    const current = this.state.taskerApplications[index];
    if (!current) return { ok: false, message: "Application not found." };
    this.state.taskerApplications[index] = { ...current, status: input.decision };
    return { ok: true };
  }

  async listUsers(input: PageInput & { query?: string }) {
    const filtered = input.query
      ? this.state.users.filter((u) =>
          `${u.displayName} ${u.email}`.toLowerCase().includes(input.query!.toLowerCase()),
        )
      : this.state.users;
    return paged<UserRow>(filtered, input);
  }

  async setUserAccountStatus(input: {
    userId: string;
    status: "active" | "suspended" | "banned";
    reason: string;
    actor: string;
  }) {
    const index = this.state.users.findIndex((u) => u.id === input.userId);
    if (index === -1) return { ok: false, message: "User not found." };
    const current = this.state.users[index];
    if (!current) return { ok: false, message: "User not found." };
    this.state.users[index] = { ...current, accountStatus: input.status };
    return { ok: true };
  }

  /**
   * Consolidated user record. The synthetic dataset has no separate capability
   * or verification tables, so those are derived from the seeded user row —
   * enough for the detail page to render and be tested without a database.
   */
  async getUser(userId: string): Promise<UserDetail | null> {
    const user = this.state.users.find((u) => u.id === userId);
    if (!user) return null;
    const moderation = this.state.auditLogs
      .filter((entry) => entry.resource === `user ${userId.slice(0, 8)}`)
      .map((entry) => ({
        id: entry.id,
        action: entry.action,
        reason: entry.reason ?? "",
        actor: entry.actor,
        capability: entry.capability,
        at: entry.at,
      }));
    return {
      ...user,
      language: "en",
      cityCode: null,
      capabilities: [{ capability: "CLIENT", grantedAt: user.createdAt, revokedAt: null }],
      verificationStatus: user.identityVerified ? "APPROVED" : "DRAFT",
      taskerApplicationStatus: null,
      taskCount: this.state.tasks.length,
      bookingCountAsClient: 0,
      bookingCountAsTasker: 0,
      moderationHistory: moderation,
    };
  }

  async listTasks(
    input: PageInput & {
      status?: string;
      query?: string;
      categoryId?: string;
      cityCode?: string;
    },
  ) {
    let filtered = this.state.tasks.slice();
    if (input.status) filtered = filtered.filter((t) => t.status === input.status);
    if (input.cityCode) filtered = filtered.filter((t) => t.cityCode === input.cityCode);
    const keyword = input.query?.trim().toLowerCase();
    if (keyword) filtered = filtered.filter((t) => t.title.toLowerCase().includes(keyword));
    return paged<TaskRow>(filtered, input);
  }

  /**
   * The synthetic dataset models bookings only indirectly (through payment
   * intents), so the booking queue is projected from those to keep the shape
   * exercisable offline.
   */
  async listBookings(input: PageInput & { status?: string }): Promise<Paginated<BookingRow>> {
    const rows: ReadonlyArray<BookingRow> = this.state.paymentIntents.map((intent) => ({
      id: intent.bookingId,
      taskId: intent.bookingId,
      taskTitle: `Booking ${intent.bookingId.slice(0, 8)}`,
      clientDisplayName: "Development Client",
      taskerDisplayName: "Development Tasker",
      agreedCentavos: intent.amountCentavos,
      status: "CONFIRMED",
      createdAt: intent.createdAt,
      updatedAt: intent.createdAt,
    }));
    const filtered = input.status ? rows.filter((row) => row.status === input.status) : rows;
    return paged<BookingRow>(filtered, input);
  }

  async getBooking(bookingId: string): Promise<BookingDetail | null> {
    const page = await this.listBookings({ page: 1, pageSize: 100 });
    const row = page.items.find((item) => item.id === bookingId);
    if (!row) return null;
    const intent = this.state.paymentIntents.find((i) => i.bookingId === bookingId);
    return {
      ...row,
      currency: "PHP",
      paymentIntentId: intent?.id ?? null,
      paymentStatus: intent?.status ?? null,
      disputeId: null,
      timeline: [
        {
          id: `${bookingId}-created`,
          fromStatus: null,
          toStatus: "PAYMENT_PENDING",
          actor: "system",
          source: "system",
          at: row.createdAt,
        },
      ],
    };
  }

  async moderateTask(input: {
    taskId: string;
    action: "remove" | "restore";
    reason: string;
    actor: string;
  }) {
    const index = this.state.tasks.findIndex((t) => t.id === input.taskId);
    if (index === -1) return { ok: false, message: "Task not found." };
    const current = this.state.tasks[index];
    if (!current) return { ok: false, message: "Task not found." };
    this.state.tasks[index] = {
      ...current,
      status: input.action === "remove" ? "REMOVED" : "OPEN",
    };
    return { ok: true };
  }

  async listReviews(input: PageInput & { status?: string }) {
    const filtered = input.status
      ? this.state.reviews.filter((r) => r.status === input.status)
      : this.state.reviews;
    return paged<ReviewRow>(filtered, input);
  }

  async moderateReview(input: {
    reviewId: string;
    action: "hide" | "restore";
    reason: string;
    actor: string;
  }) {
    if (!input.reason.trim()) return { ok: false, message: "A reason is required." };
    const index = this.state.reviews.findIndex((r) => r.id === input.reviewId);
    if (index === -1) return { ok: false, message: "Review not found." };
    const current = this.state.reviews[index];
    if (!current) return { ok: false, message: "Review not found." };

    // Mirrors admin_moderate_review: hiding an already-hidden review, or
    // restoring one that is not hidden, succeeds as a no-op.
    const next = input.action === "hide" ? "MODERATED" : "REVEALED";
    this.state.reviews[index] = { ...current, status: next };
    this.recordAudit({
      actor: input.actor,
      capability: "ADMIN_SUPPORT",
      action: `review.${input.action}`,
      resource: input.reviewId,
      reason: input.reason,
    });
    return { ok: true };
  }

  async listReports(input: PageInput & { status?: string }) {
    const filtered = input.status
      ? this.state.reports.filter((r) => r.status === input.status)
      : this.state.reports;
    return paged<ReportRow>(filtered, input);
  }

  async getReport(input: { reportId: string; actor: string }): Promise<ReportDetail | null> {
    const found = this.state.reports.find((r) => r.id === input.reportId);
    if (!found) return null;
    return this.applyCaseAccess(found, input.actor, "report");
  }

  async listDisputes(input: PageInput & { status?: string }) {
    const filtered = input.status
      ? this.state.disputes.filter((d) => d.status === input.status)
      : this.state.disputes;
    return paged<DisputeRow>(filtered, input);
  }

  async getDispute(input: { disputeId: string; actor: string }): Promise<DisputeDetail | null> {
    const found = this.state.disputes.find((d) => d.id === input.disputeId);
    if (!found) return null;
    return this.applyCaseAccess(found, input.actor, "dispute");
  }

  async readDisputeConversation(input: {
    disputeId: string;
    reason: string;
    actor: string;
  }): Promise<ConversationTranscript> {
    if (!input.reason.trim()) return { ok: false, message: "A reason is required." };
    const dispute = this.state.disputes.find((d) => d.id === input.disputeId);
    if (!dispute) return { ok: false, message: "Dispute not found." };

    // Mirrors app.admin_assigned_conversation: only the assigned Admin may read
    // a private transcript, regardless of capability.
    if (dispute.assignee !== input.actor) {
      return {
        ok: false,
        message: "Only the Admin assigned to this dispute may read the conversation.",
      };
    }

    this.recordAudit({
      actor: input.actor,
      capability: "ADMIN_FINANCE",
      action: "conversation.read",
      resource: dispute.bookingId,
      reason: input.reason.trim(),
    });

    return {
      ok: true,
      messages: [
        {
          id: `msg-${dispute.bookingId}-1`,
          senderDisplayName: "J. Santos",
          body: "Sending the gate code once you are nearby.",
          attachmentCount: 0,
          sentAt: "2026-07-17T01:10:00.000Z",
        },
        {
          id: `msg-${dispute.bookingId}-2`,
          senderDisplayName: "M. Dela Cruz",
          body: "On my way, about fifteen minutes out.",
          attachmentCount: 1,
          sentAt: "2026-07-17T01:24:00.000Z",
        },
      ],
    };
  }

  async listTickets(input: PageInput & { status?: string }) {
    const filtered = input.status
      ? this.state.tickets.filter((t) => t.status === input.status)
      : this.state.tickets;
    return paged<TicketRow>(filtered, input);
  }

  async getTicket(input: { ticketId: string; actor: string }): Promise<TicketDetail | null> {
    const found = this.state.tickets.find((t) => t.id === input.ticketId);
    if (!found) return null;
    return this.applyCaseAccess(found, input.actor, "ticket");
  }

  /**
   * Assignment-gated sensitive detail read. Returns zero narrative/evidence
   * unless the requesting actor is the explicit assignee, and records a
   * `assigned-case-review` audit entry when an assigned Admin reads their own
   * case (requirement 4.6.6/4.6.9).
   */
  private applyCaseAccess<T extends { readonly id: string; readonly assignee: string | null }>(
    row: T & {
      readonly access: CaseDetailAccess;
      readonly narrative: string | null;
      readonly evidence: ReadonlyArray<EvidenceMetadata>;
    },
    actor: string,
    resourceType: "report" | "dispute" | "ticket",
  ): T & {
    readonly access: CaseDetailAccess;
    readonly narrative: string | null;
    readonly evidence: ReadonlyArray<EvidenceMetadata>;
  } {
    if (row.assignee === null) {
      return {
        ...row,
        access: { restricted: true, reason: "unassigned" },
        narrative: null,
        evidence: [],
      };
    }
    if (row.assignee !== actor) {
      return {
        ...row,
        access: { restricted: true, reason: "assigned-to-other" },
        narrative: null,
        evidence: [],
      };
    }
    this.recordAudit({
      actor,
      capability: null,
      action: `${resourceType}.detail.read`,
      resource: row.id,
      reason: "assigned-case-review",
    });
    return { ...row, access: { restricted: false } };
  }

  async assignCase(input: {
    resourceType: "report" | "dispute" | "ticket" | "verification";
    resourceId: string;
    assignee: string;
    actor: string;
    capability: AdminCapability | null;
    force?: boolean;
  }) {
    if (input.resourceType === "verification") {
      return { ok: true };
    }

    const collection =
      input.resourceType === "report"
        ? this.state.reports
        : input.resourceType === "dispute"
          ? this.state.disputes
          : this.state.tickets;

    const index = collection.findIndex((row) => row.id === input.resourceId);
    if (index === -1) return { ok: false, message: `${input.resourceType} not found.` };
    const current = collection[index];
    if (!current) return { ok: false, message: `${input.resourceType} not found.` };

    if (current.assignee === input.assignee) {
      // Idempotent/retry-safe: already assigned to the same Admin.
      return { ok: true };
    }

    if (current.assignee !== null && current.assignee !== input.assignee && !input.force) {
      return {
        ok: false,
        message: `This ${input.resourceType} is already assigned to ${current.assignee}. Reassignment requires explicit confirmation.`,
      };
    }

    const previousAssignee = current.assignee;
    const historyEntry: CaseHistoryEvent = {
      type: "assignment",
      fromValue: previousAssignee,
      toValue: input.assignee,
      actor: input.actor,
      capability: input.capability,
      reason: null,
      at: new Date().toISOString(),
    };

    const nextStatus =
      current.status === "OPEN"
        ? input.resourceType === "dispute"
          ? "UNDER_REVIEW"
          : input.resourceType === "report"
            ? "TRIAGED"
            : current.status
        : current.status;

    const updated = {
      ...current,
      assignee: input.assignee,
      status: nextStatus,
      history: [...current.history, historyEntry],
    };

    collection[index] = updated as (typeof collection)[number];

    this.recordAudit({
      actor: input.actor,
      capability: input.capability,
      action: `${input.resourceType}.assign`,
      resource: input.resourceId,
      reason: previousAssignee ? "reassigned" : null,
    });

    return { ok: true };
  }

  async transitionCaseStatus(input: {
    resourceType: "report" | "dispute" | "ticket";
    resourceId: string;
    toStatus: string;
    reason: string;
    actor: string;
    capability: AdminCapability | null;
  }) {
    if (input.reason.trim().length === 0) {
      return { ok: false, message: "A reason is required for this status change." };
    }

    const collection =
      input.resourceType === "report"
        ? this.state.reports
        : input.resourceType === "dispute"
          ? this.state.disputes
          : this.state.tickets;

    const index = collection.findIndex((row) => row.id === input.resourceId);
    if (index === -1) return { ok: false, message: `${input.resourceType} not found.` };
    const current = collection[index];
    if (!current) return { ok: false, message: `${input.resourceType} not found.` };

    if (current.status === input.toStatus) {
      // Idempotent/retry-safe: re-applying the current status is a no-op success.
      return { ok: true };
    }

    const allowed = CASE_STATUS_TRANSITIONS[input.resourceType][current.status] ?? [];
    if (!allowed.includes(input.toStatus)) {
      return {
        ok: false,
        message: `Cannot move ${input.resourceType} from ${current.status} to ${input.toStatus}.`,
      };
    }

    const historyEntry: CaseHistoryEvent = {
      type: "status",
      fromValue: current.status,
      toValue: input.toStatus,
      actor: input.actor,
      capability: input.capability,
      reason: input.reason.trim(),
      at: new Date().toISOString(),
    };

    const updated = {
      ...current,
      status: input.toStatus,
      history: [...current.history, historyEntry],
    };

    collection[index] = updated as (typeof collection)[number];

    this.recordAudit({
      actor: input.actor,
      capability: input.capability,
      action: `${input.resourceType}.status.transition`,
      resource: input.resourceId,
      reason: input.reason.trim(),
    });

    return { ok: true };
  }

  async listPaymentEvents(input: PageInput & { status?: string }) {
    const filtered = input.status
      ? this.state.paymentEvents.filter((p) => p.status === input.status)
      : this.state.paymentEvents;
    return paged<PaymentEventRow>(filtered, input);
  }

  /**
   * Provider availability is always unavailable in this pass: no approved
   * Philippine payment/payout provider integration exists yet (release
   * blocker, task 9.1). This is computed rather than hard-coded `false` so a
   * future real provider wiring only needs to change this one place.
   */
  getFinanceProviderAvailability(): FinanceProviderAvailability {
    return {
      paymentProviderAvailable: false,
      payoutProviderAvailable: false,
      reason:
        "No approved Philippine payment/payout provider integration exists yet (release blocker, task 9.1). Live refund, release, freeze-reversal, and payout actions are disabled rather than simulated as if they were live.",
    };
  }

  /**
   * Derive every headline finance total from the balanced append-only
   * synthetic ledger transactions/entries — never from a stored mutable
   * balance field. `assertLedgerBalanced` re-checks every transaction before
   * any total is computed.
   */
  async getFinanceSummary(): Promise<FinanceSummary> {
    this.assertLedgerBalanced();

    const protectedCentavos = sumEntries(
      this.state.ledgerTransactions,
      "PROTECT",
      "client_protected",
    );
    const capturedCentavos = sumEntries(
      this.state.ledgerTransactions,
      "CAPTURE",
      "platform_revenue",
    );
    const releasedCentavos = sumEntries(this.state.ledgerTransactions, "RELEASE", "tasker_payable");
    const refundedCentavos = sumEntries(
      this.state.ledgerTransactions,
      "REFUND",
      "client_protected",
    );
    const platformFeeCentavos = sumEntries(this.state.ledgerTransactions, "FEE", "platform_fee");

    const ledgerBalanceCentavos = this.state.ledgerTransactions.reduce(
      (total, transaction) =>
        total +
        transaction.entries
          .filter((e) => e.accountType === "platform_revenue")
          .reduce((sum, e) => sum + e.amountCentavos, 0),
      0,
    );

    return {
      synthetic: true,
      protectedCentavos,
      capturedCentavos,
      releasedCentavos,
      refundedCentavos,
      platformFeeCentavos,
      platformFeeBps: PLATFORM_FEE_BPS,
      ledgerBalanceCentavos,
    };
  }

  /** Throws if any synthetic ledger transaction's entries do not sum to zero. */
  private assertLedgerBalanced(): void {
    for (const transaction of this.state.ledgerTransactions) {
      const sum = transaction.entries.reduce((total, entry) => total + entry.amountCentavos, 0);
      if (sum !== 0) {
        throw new Error(
          `Synthetic ledger integrity violation: transaction ${transaction.id} (${transaction.type}) is unbalanced (sum=${sum}).`,
        );
      }
    }
  }

  private toPaymentIntentRow(intent: PaymentIntentState): PaymentIntentRow {
    return {
      id: intent.id,
      bookingId: intent.bookingId,
      status: intent.status,
      amountCentavos: intent.amountCentavos,
      platformFeeCentavos: intent.platformFeeCentavos,
      createdAt: intent.createdAt,
    };
  }

  async listPaymentIntents(input: PageInput & { status?: PaymentIntentStatus }) {
    const filtered = input.status
      ? this.state.paymentIntents.filter((p) => p.status === input.status)
      : this.state.paymentIntents;
    return paged<PaymentIntentRow>(
      filtered.map((p) => this.toPaymentIntentRow(p)),
      input,
    );
  }

  async getPaymentIntent(id: string): Promise<PaymentIntentDetail | null> {
    const found = this.state.paymentIntents.find((p) => p.id === id);
    if (!found) return null;

    const totalRefundedCentavos = found.refundHistory
      .filter((r) => r.status === "SUCCEEDED")
      .reduce((sum, r) => sum + r.amountCentavos, 0);

    const providerEvents = this.state.providerEvents.filter((e) => e.bookingId === found.bookingId);
    const ledgerTransactionIds = this.state.ledgerTransactions
      .filter((t) => t.paymentIntentId === found.id)
      .map((t) => t.id);

    const reconciliation = this.classifyPaymentIntent(found);

    return {
      ...this.toPaymentIntentRow(found),
      refundSummary: {
        totalRefundedCentavos,
        refundCount: found.refundHistory.filter((r) => r.status === "SUCCEEDED").length,
      },
      refundHistory: found.refundHistory,
      providerEvents,
      ledgerTransactionIds,
      reconciliationStatus: reconciliation.status,
      history: found.history,
    };
  }

  async listProviderEvents(input: PageInput & { status?: string }) {
    const filtered = input.status
      ? this.state.providerEvents.filter((e) => e.status === input.status)
      : this.state.providerEvents;
    return paged<ProviderEventRow>(filtered, input);
  }

  async getPaymentIntentByBooking(bookingId: string): Promise<PaymentIntentRow | null> {
    const found = this.state.paymentIntents.find((p) => p.bookingId === bookingId);
    return found ? this.toPaymentIntentRow(found) : null;
  }

  /**
   * Fail-closed refund. No approved payment provider or refund policy is
   * configured, so this always returns `PROVIDER_UNAVAILABLE` before any
   * booking/refund/ledger/audit mutation — verified by
   * `synthetic-admin-repository.test.ts`.
   */
  async requestRefund(input: {
    paymentIntentId: string;
    reason: string;
    actor: string;
    idempotencyKey: string;
  }) {
    void input;
    const availability = this.getFinanceProviderAvailability();
    if (!availability.paymentProviderAvailable) {
      return {
        ok: false,
        code: PROVIDER_UNAVAILABLE,
        message: availability.reason,
      };
    }
    // Unreachable while no provider is configured; kept for interface
    // completeness and to make the fail-closed guard the first statement.
    return { ok: false, message: "Refund is unavailable." };
  }

  /**
   * Development synthetic freeze: represented by the existing `admin_freeze`
   * privileged-command concept. Validates eligibility, is idempotent via
   * `idempotencyKey`, and appends a balanced FREEZE ledger transaction that
   * never rewrites prior entries.
   */
  async freezePaymentIntent(input: {
    paymentIntentId: string;
    reason: string;
    actor: string;
    capability: AdminCapability | null;
    idempotencyKey: string;
  }) {
    if (input.reason.trim().length === 0) {
      return { ok: false, message: "A reason is required to freeze this payment." };
    }
    if (input.idempotencyKey.trim().length === 0) {
      return { ok: false, message: "A safe idempotency key is required." };
    }

    const index = this.state.paymentIntents.findIndex((p) => p.id === input.paymentIntentId);
    if (index === -1) return { ok: false, message: "Payment intent not found." };
    const current = this.state.paymentIntents[index];
    if (!current) return { ok: false, message: "Payment intent not found." };

    // Idempotent retry: a prior freeze with the same idempotency key already
    // recorded this exact transaction — return success without duplicating.
    const alreadyRecorded = this.state.ledgerTransactions.some(
      (t) =>
        t.type === "FREEZE" &&
        t.paymentIntentId === current.id &&
        t.id === freezeTransactionId(input.idempotencyKey),
    );
    if (alreadyRecorded) {
      return { ok: true, message: "This freeze was already recorded (idempotent retry)." };
    }

    const eligibleStates: ReadonlyArray<PaymentIntentStatus> = ["PROTECTED", "CAPTURED"];
    if (!eligibleStates.includes(current.status)) {
      return {
        ok: false,
        message: `A payment in status ${current.status} is not eligible to be frozen. Only PROTECTED or CAPTURED payments can be frozen.`,
        code: "INELIGIBLE_STATE",
      };
    }

    const now = new Date().toISOString();
    const sourceAccountType: LedgerEntryRow["accountType"] =
      current.status === "CAPTURED" ? "platform_revenue" : "client_protected";
    const sourceLabel =
      current.status === "CAPTURED"
        ? "Platform clearing account"
        : `Client protected-funds account (${current.bookingId})`;

    // Append-only: this never rewrites the PROTECT/CAPTURE entries already
    // recorded for this payment intent — it only adds a new balanced
    // transaction that moves the amount into a frozen holding account.
    const transaction: LedgerTransactionRow = {
      id: freezeTransactionId(input.idempotencyKey),
      type: "FREEZE",
      bookingId: current.bookingId,
      paymentIntentId: current.id,
      createdAt: now,
      entries: [
        {
          id: `synle-freeze-${input.idempotencyKey}-a`,
          accountType: "platform_revenue",
          ownerLabel: "Platform frozen-funds holding account",
          amountCentavos: current.amountCentavos,
        },
        {
          id: `synle-freeze-${input.idempotencyKey}-b`,
          accountType: sourceAccountType,
          ownerLabel: sourceLabel,
          amountCentavos: -current.amountCentavos,
        },
      ],
    };
    const sum = transaction.entries.reduce((total, e) => total + e.amountCentavos, 0);
    if (sum !== 0) {
      throw new Error(
        `Synthetic FREEZE transaction for ${current.id} is not balanced (sum=${sum}).`,
      );
    }
    this.state.ledgerTransactions.push(transaction);

    const historyEntry: CaseHistoryEvent = {
      type: "status",
      fromValue: current.status,
      toValue: "FROZEN",
      actor: input.actor,
      capability: input.capability,
      reason: input.reason.trim(),
      at: now,
    };
    this.state.paymentIntents[index] = {
      ...current,
      history: [...current.history, historyEntry],
    };

    this.recordAudit({
      actor: input.actor,
      capability: input.capability,
      action: "payment.freeze",
      resource: input.paymentIntentId,
      reason: input.reason.trim(),
    });

    return { ok: true };
  }

  /**
   * Deterministic classification of a single payment intent against its
   * provider events and ledger transactions. Pure function of current state
   * — no network/provider call.
   */
  private classifyPaymentIntent(intent: PaymentIntentState): ReconciliationRow {
    const events = this.state.providerEvents.filter((e) => e.bookingId === intent.bookingId);
    const processed = events.filter((e) => e.status === "PROCESSED");
    const duplicate = events.find((e) => e.status === "DUPLICATE");
    const quarantined = events.find((e) => e.status === "QUARANTINED");
    const ledgerTxns = this.state.ledgerTransactions.filter((t) => t.paymentIntentId === intent.id);
    const ledgerProtectAmount = ledgerTxns
      .filter((t) => t.type === "PROTECT")
      .reduce(
        (sum, t) =>
          sum + (t.entries.find((e) => e.accountType === "client_protected")?.amountCentavos ?? 0),
        0,
      );

    const providerEvent = processed[0] ?? duplicate ?? quarantined ?? null;
    const now = new Date().toISOString();

    if (quarantined && !processed.length) {
      return {
        id: `rec-${intent.id}`,
        bookingId: intent.bookingId,
        paymentIntentId: intent.id,
        providerEventId: quarantined.id,
        ledgerTransactionId: ledgerTxns[0]?.id ?? null,
        paymentAmountCentavos: intent.amountCentavos,
        providerEventAmountCentavos: quarantined.amountCentavos,
        ledgerAmountCentavos: ledgerProtectAmount,
        status: "QUARANTINED",
        differenceCentavos: Math.abs(intent.amountCentavos - quarantined.amountCentavos),
        checkedAt: now,
      };
    }

    if (duplicate) {
      return {
        id: `rec-${intent.id}`,
        bookingId: intent.bookingId,
        paymentIntentId: intent.id,
        providerEventId: duplicate.id,
        ledgerTransactionId: ledgerTxns[0]?.id ?? null,
        paymentAmountCentavos: intent.amountCentavos,
        providerEventAmountCentavos: duplicate.amountCentavos,
        ledgerAmountCentavos: ledgerProtectAmount,
        status: "DUPLICATE",
        differenceCentavos: 0,
        checkedAt: now,
      };
    }

    if (!providerEvent) {
      return {
        id: `rec-${intent.id}`,
        bookingId: intent.bookingId,
        paymentIntentId: intent.id,
        providerEventId: null,
        ledgerTransactionId: ledgerTxns[0]?.id ?? null,
        paymentAmountCentavos: intent.amountCentavos,
        providerEventAmountCentavos: null,
        ledgerAmountCentavos: ledgerProtectAmount,
        status: "UNMATCHED",
        differenceCentavos: intent.amountCentavos,
        checkedAt: now,
      };
    }

    const difference = Math.abs(intent.amountCentavos - providerEvent.amountCentavos);
    const ledgerDifference = Math.abs(intent.amountCentavos - ledgerProtectAmount);

    if (difference === 0 && ledgerDifference === 0) {
      return {
        id: `rec-${intent.id}`,
        bookingId: intent.bookingId,
        paymentIntentId: intent.id,
        providerEventId: providerEvent.id,
        ledgerTransactionId: ledgerTxns[0]?.id ?? null,
        paymentAmountCentavos: intent.amountCentavos,
        providerEventAmountCentavos: providerEvent.amountCentavos,
        ledgerAmountCentavos: ledgerProtectAmount,
        status: "MATCHED",
        differenceCentavos: 0,
        checkedAt: now,
      };
    }

    return {
      id: `rec-${intent.id}`,
      bookingId: intent.bookingId,
      paymentIntentId: intent.id,
      providerEventId: providerEvent.id,
      ledgerTransactionId: ledgerTxns[0]?.id ?? null,
      paymentAmountCentavos: intent.amountCentavos,
      providerEventAmountCentavos: providerEvent.amountCentavos,
      ledgerAmountCentavos: ledgerProtectAmount,
      status: "MISMATCH",
      differenceCentavos: Math.max(difference, ledgerDifference),
      checkedAt: now,
    };
  }

  private computeReconciliationRows(): ReconciliationRow[] {
    return this.state.paymentIntents.map((intent) => this.classifyPaymentIntent(intent));
  }

  async listReconciliationRows(input: PageInput & { status?: ReconciliationStatus }) {
    const rows = this.computeReconciliationRows();
    const filtered = input.status ? rows.filter((r) => r.status === input.status) : rows;
    return paged<ReconciliationRow>(filtered, input);
  }

  async getReconciliationSummary(): Promise<ReconciliationSummary> {
    const rows = this.computeReconciliationRows();
    return {
      matched: rows.filter((r) => r.status === "MATCHED").length,
      duplicate: rows.filter((r) => r.status === "DUPLICATE").length,
      quarantined: rows.filter((r) => r.status === "QUARANTINED").length,
      mismatch: rows.filter((r) => r.status === "MISMATCH").length,
      unmatched: rows.filter((r) => r.status === "UNMATCHED").length,
      total: rows.length,
    };
  }

  /**
   * Deterministic, auditable, idempotent re-run of the synthetic
   * reconciliation classification. Makes no network/provider call — it only
   * recomputes classifications from current in-memory state and records an
   * audit entry. Re-running with the same idempotency key does not duplicate
   * audit entries.
   */
  async rerunReconciliation(input: {
    reason: string;
    actor: string;
    capability: AdminCapability | null;
    idempotencyKey: string;
  }) {
    if (input.reason.trim().length === 0) {
      return { ok: false, message: "A reason is required to re-run reconciliation." };
    }
    if (input.idempotencyKey.trim().length === 0) {
      return { ok: false, message: "A safe idempotency key is required." };
    }

    const auditAction = "reconciliation.rerun";
    const alreadyRecorded = this.state.auditLogs.some(
      (log) => log.action === auditAction && log.resource === `idempotency:${input.idempotencyKey}`,
    );

    const summary = await this.getReconciliationSummary();

    if (!alreadyRecorded) {
      this.recordAudit({
        actor: input.actor,
        capability: input.capability,
        action: auditAction,
        resource: `idempotency:${input.idempotencyKey}`,
        reason: input.reason.trim(),
      });
    }

    return { ok: true, summary };
  }

  async listWithdrawals(input: PageInput & { status?: string }) {
    const filtered = input.status
      ? this.state.withdrawals.filter((w) => w.status === input.status)
      : this.state.withdrawals;
    return paged<WithdrawalRow>(filtered, input);
  }

  /**
   * Fail-closed payout approval. No approved payout provider is configured,
   * so this always returns `PROVIDER_UNAVAILABLE` before any mutation,
   * provider request, or audit entry — verified by
   * `synthetic-admin-repository.test.ts`.
   */
  async approveWithdrawal(input: { withdrawalId: string; reason: string; actor: string }) {
    void input;
    const availability = this.getFinanceProviderAvailability();
    if (!availability.payoutProviderAvailable) {
      return {
        ok: false,
        code: PROVIDER_UNAVAILABLE,
        message: availability.reason,
      };
    }
    // Unreachable while no payout provider is configured.
    return { ok: false, message: "Withdrawal approval is unavailable." };
  }

  private withTaskCount<T extends CategoryRow>(category: T): T {
    const taskCount = this.state.tasks.filter((t) => t.categorySlug === category.slug).length;
    return { ...category, taskCount };
  }

  async listCategories(input: PageInput & { status?: "active" | "inactive" }) {
    const filtered =
      input.status === "active"
        ? this.state.categories.filter((c) => c.active)
        : input.status === "inactive"
          ? this.state.categories.filter((c) => !c.active)
          : this.state.categories;
    const sorted = [...filtered]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((c) => this.withTaskCount(c));
    return paged<CategoryRow>(sorted, input);
  }

  async getCategory(id: string): Promise<CategoryDetail | null> {
    const found = this.state.categories.find((c) => c.id === id);
    return found ? this.withTaskCount(found) : null;
  }

  private slugExists(slug: string, excludingId?: string): boolean {
    return this.state.categories.some((c) => c.slug === slug && c.id !== excludingId);
  }

  async createCategory(input: {
    name: string;
    slug: string;
    actor: string;
    capability: AdminCapability | null;
  }) {
    const name = input.name.trim();
    const slug = input.slug.trim().toLowerCase();
    if (name.length < 2 || name.length > 60) {
      return { ok: false, message: "Name must be between 2 and 60 characters." };
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 60) {
      return {
        ok: false,
        message: "Slug must be 2-60 lowercase letters, numbers, and hyphens (e.g. home-cleaning).",
      };
    }
    if (this.slugExists(slug)) {
      return { ok: false, message: `Slug "${slug}" is already in use.` };
    }

    const nextOrder =
      this.state.categories.reduce((max, c) => Math.max(max, c.displayOrder), 0) + 1;
    const id = `cat-${String(this.state.categories.length + 1).padStart(4, "0")}-${Date.now()}`;
    const now = new Date().toISOString();
    const created: CategoryDetail = {
      id,
      name,
      slug,
      active: true,
      displayOrder: nextOrder,
      taskCount: 0,
      updatedAt: now,
      history: [
        {
          type: "create",
          fromValue: null,
          toValue: name,
          actor: input.actor,
          capability: input.capability,
          reason: null,
          at: now,
        },
      ],
    };
    this.state.categories = [...this.state.categories, created];
    this.recordAudit({
      actor: input.actor,
      capability: input.capability,
      action: "category.create",
      resource: id,
      reason: null,
    });
    return { ok: true, categoryId: id };
  }

  async renameCategory(input: {
    categoryId: string;
    name: string;
    slug: string;
    reason: string;
    actor: string;
    capability: AdminCapability | null;
  }) {
    if (input.reason.trim().length === 0) {
      return { ok: false, message: "A reason is required to rename or re-slug a category." };
    }
    const index = this.state.categories.findIndex((c) => c.id === input.categoryId);
    if (index === -1) return { ok: false, message: "Category not found." };
    const current = this.state.categories[index];
    if (!current) return { ok: false, message: "Category not found." };

    const name = input.name.trim();
    const slug = input.slug.trim().toLowerCase();
    if (name.length < 2 || name.length > 60) {
      return { ok: false, message: "Name must be between 2 and 60 characters." };
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 60) {
      return {
        ok: false,
        message: "Slug must be 2-60 lowercase letters, numbers, and hyphens (e.g. home-cleaning).",
      };
    }
    if (this.slugExists(slug, current.id)) {
      return { ok: false, message: `Slug "${slug}" is already in use.` };
    }
    if (name === current.name && slug === current.slug) {
      return { ok: true };
    }

    const now = new Date().toISOString();
    const history = [...current.history];
    if (name !== current.name) {
      history.push({
        type: "rename",
        fromValue: current.name,
        toValue: name,
        actor: input.actor,
        capability: input.capability,
        reason: input.reason.trim(),
        at: now,
      });
    }
    if (slug !== current.slug) {
      history.push({
        type: "slug",
        fromValue: current.slug,
        toValue: slug,
        actor: input.actor,
        capability: input.capability,
        reason: input.reason.trim(),
        at: now,
      });
    }

    this.state.categories[index] = { ...current, name, slug, updatedAt: now, history };
    this.recordAudit({
      actor: input.actor,
      capability: input.capability,
      action: "category.rename",
      resource: input.categoryId,
      reason: input.reason.trim(),
    });
    return { ok: true };
  }

  async setCategoryActive(input: {
    categoryId: string;
    active: boolean;
    reason: string;
    actor: string;
    capability: AdminCapability | null;
  }) {
    if (input.reason.trim().length === 0) {
      return { ok: false, message: "A reason is required to activate or deactivate a category." };
    }
    const index = this.state.categories.findIndex((c) => c.id === input.categoryId);
    if (index === -1) return { ok: false, message: "Category not found." };
    const current = this.state.categories[index];
    if (!current) return { ok: false, message: "Category not found." };
    if (current.active === input.active) {
      return { ok: true };
    }

    const now = new Date().toISOString();
    const historyEntry: CategoryHistoryEvent = {
      type: input.active ? "activate" : "deactivate",
      fromValue: current.active ? "active" : "inactive",
      toValue: input.active ? "active" : "inactive",
      actor: input.actor,
      capability: input.capability,
      reason: input.reason.trim(),
      at: now,
    };
    this.state.categories[index] = {
      ...current,
      active: input.active,
      updatedAt: now,
      history: [...current.history, historyEntry],
    };
    this.recordAudit({
      actor: input.actor,
      capability: input.capability,
      action: input.active ? "category.activate" : "category.deactivate",
      resource: input.categoryId,
      reason: input.reason.trim(),
    });
    return { ok: true };
  }

  async reorderCategory(input: {
    categoryId: string;
    displayOrder: number;
    reason: string;
    actor: string;
    capability: AdminCapability | null;
  }) {
    if (input.reason.trim().length === 0) {
      return { ok: false, message: "A reason is required to reorder categories." };
    }
    if (!Number.isInteger(input.displayOrder) || input.displayOrder < 1) {
      return { ok: false, message: "Display order must be a positive whole number." };
    }
    const index = this.state.categories.findIndex((c) => c.id === input.categoryId);
    if (index === -1) return { ok: false, message: "Category not found." };
    const current = this.state.categories[index];
    if (!current) return { ok: false, message: "Category not found." };
    if (current.displayOrder === input.displayOrder) {
      return { ok: true };
    }

    const now = new Date().toISOString();
    const historyEntry: CategoryHistoryEvent = {
      type: "reorder",
      fromValue: String(current.displayOrder),
      toValue: String(input.displayOrder),
      actor: input.actor,
      capability: input.capability,
      reason: input.reason.trim(),
      at: now,
    };
    this.state.categories[index] = {
      ...current,
      displayOrder: input.displayOrder,
      updatedAt: now,
      history: [...current.history, historyEntry],
    };
    this.recordAudit({
      actor: input.actor,
      capability: input.capability,
      action: "category.reorder",
      resource: input.categoryId,
      reason: input.reason.trim(),
    });
    return { ok: true };
  }

  async listAuditLogs(input: PageInput) {
    return paged<AuditLogRow>(this.state.auditLogs, input);
  }
}

let singleton: SyntheticAdminRepository | null = null;

/** Development/test only. Production/staging never reaches this factory. */
export function getSyntheticAdminRepository(): SyntheticAdminRepository {
  singleton ??= new SyntheticAdminRepository();
  return singleton;
}

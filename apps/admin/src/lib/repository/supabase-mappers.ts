import "server-only";
import type {
  CaseSubject,
  LedgerAccountType,
  LedgerTransactionType,
  PaymentIntentStatus,
  ReconciliationStatus,
  ReportTriage,
} from "./types";

/**
 * Pure row -> DTO projections for the real Supabase Admin adapter.
 *
 * Kept separate from the repository so every derivation (payment lifecycle
 * label, reconciliation classification, privacy-safe provider labels) is a
 * plain function that can be reasoned about and unit-tested without a database.
 * Nothing here performs I/O and nothing here widens a value it does not
 * recognize: unknown enum strings collapse to the most conservative option
 * rather than being passed through.
 */

export type RawProfileNameRow = {
  readonly id: string;
  readonly display_name: string | null;
  readonly account_status: string | null;
  readonly created_at: string | null;
};

export type RawLedgerTxRow = {
  readonly id: string;
  readonly booking_id: string | null;
  readonly type: string;
  readonly created_at: string;
};

export type RawProviderEventRow = {
  readonly id: string;
  readonly provider: string;
  readonly event_type: string;
  readonly provider_reference: string | null;
  readonly amount_centavos: number | null;
  readonly processing_status: string;
  readonly payload_hash: string;
  readonly received_at: string;
};

export type RawPaymentIntentRow = {
  readonly id: string;
  readonly booking_id: string;
  readonly provider: string;
  readonly provider_reference: string | null;
  readonly amount_centavos: number;
  readonly status: string;
  readonly created_at: string;
};

export type RawRefundRow = {
  readonly id: string;
  readonly payment_intent_id: string;
  readonly amount_centavos: number;
  readonly status: string;
  readonly reason: string | null;
  readonly created_at: string;
};

const PROVIDER_EVENT_STATUSES = ["RECEIVED", "PROCESSED", "DUPLICATE", "QUARANTINED"] as const;
export type ProviderEventStatus = (typeof PROVIDER_EVENT_STATUSES)[number];

/** Unknown/absent processing states are treated as QUARANTINED (most cautious). */
export function toProviderEventStatus(value: string | null | undefined): ProviderEventStatus {
  return (PROVIDER_EVENT_STATUSES as ReadonlyArray<string>).includes(value ?? "")
    ? (value as ProviderEventStatus)
    : "QUARANTINED";
}

const LEDGER_ACCOUNT_TYPES: ReadonlyArray<LedgerAccountType> = [
  "CLIENT_FUNDING",
  "PROTECTED_HOLD",
  "TASKER_AVAILABLE",
  "PLATFORM_FEE",
  "PAYOUT_CLEARING",
  "REFUND_CLEARING",
];

export function toLedgerAccountType(value: string | null | undefined): LedgerAccountType {
  return (LEDGER_ACCOUNT_TYPES as ReadonlyArray<string>).includes(value ?? "")
    ? (value as LedgerAccountType)
    : "PAYOUT_CLEARING";
}

const LEDGER_TX_TYPES: ReadonlyArray<LedgerTransactionType> = [
  "PAYMENT_CAPTURE",
  "RELEASE_TO_TASKER",
  "FEE_CHARGE",
  "REFUND",
  "WITHDRAWAL_RESERVE",
  "WITHDRAWAL_SETTLE",
  "WITHDRAWAL_REVERSE",
  "FREEZE",
  "UNFREEZE",
  "ADJUSTMENT",
];

export function toLedgerTransactionType(value: string | null | undefined): LedgerTransactionType {
  return (LEDGER_TX_TYPES as ReadonlyArray<string>).includes(value ?? "")
    ? (value as LedgerTransactionType)
    : "FREEZE";
}

/**
 * Derive the lifecycle label shown in the console.
 *
 * `payment_intents.status` alone only says whether the provider confirmed the
 * charge; where the money currently sits is a property of the balanced ledger.
 * A succeeded refund therefore wins over everything, then release, then the
 * protected hold, and only otherwise do we fall back to the raw provider state.
 */
export function derivePaymentIntentStatus(input: {
  readonly dbStatus: string;
  readonly ledgerTypes: ReadonlyArray<string>;
  readonly hasSucceededRefund: boolean;
}): PaymentIntentStatus {
  if (input.hasSucceededRefund) return "REFUNDED";
  if (input.dbStatus === "FAILED") return "FAILED";
  if (input.dbStatus === "CONFIRMED") {
    if (input.ledgerTypes.includes("RELEASE_TO_TASKER")) return "RELEASED";
    if (input.ledgerTypes.includes("PAYMENT_CAPTURE")) return "PROTECTED";
    return "CONFIRMED";
  }
  if (input.dbStatus === "PENDING") return "PENDING";
  return "CREATED";
}

/**
 * Classify one payment intent against the provider event and ledger record.
 *
 * There is no reconciliation table in the schema; the console derives the
 * comparison so it can never drift from the authoritative rows. Ordering is
 * deliberate — a quarantined or duplicate provider event is a data-integrity
 * signal that must surface before any amount comparison.
 */
export function classifyReconciliation(input: {
  readonly paymentAmountCentavos: number | null;
  readonly providerEventAmountCentavos: number | null;
  readonly providerEventStatus: ProviderEventStatus | null;
  readonly ledgerAmountCentavos: number | null;
}): { readonly status: ReconciliationStatus; readonly differenceCentavos: number } {
  if (input.providerEventStatus === "QUARANTINED") {
    return { status: "QUARANTINED", differenceCentavos: 0 };
  }
  if (input.providerEventStatus === "DUPLICATE") {
    return { status: "DUPLICATE", differenceCentavos: 0 };
  }
  if (input.providerEventStatus === null || input.providerEventAmountCentavos === null) {
    return { status: "UNMATCHED", differenceCentavos: 0 };
  }
  const expected = input.paymentAmountCentavos ?? 0;
  const difference = input.providerEventAmountCentavos - expected;
  if (difference !== 0) {
    return { status: "MISMATCH", differenceCentavos: difference };
  }
  if (input.ledgerAmountCentavos === null) {
    return { status: "UNMATCHED", differenceCentavos: 0 };
  }
  const ledgerDifference = input.ledgerAmountCentavos - expected;
  if (ledgerDifference !== 0) {
    return { status: "MISMATCH", differenceCentavos: ledgerDifference };
  }
  return { status: "MATCHED", differenceCentavos: 0 };
}

/**
 * Privacy-safe provider reference label. The raw provider reference can be a
 * correlatable external identifier, so only the provider name and a short
 * trailing fragment are shown — never the full value, and never a signature.
 */
export function toProviderReferenceLabel(
  provider: string,
  reference: string | null | undefined,
): string {
  if (!reference) return `${provider}: (no reference)`;
  const tail = reference.slice(-6);
  return `${provider}: ...${tail}`;
}

/** Short, non-reversible preview of the stored payload hash. Never the payload. */
export function toPayloadHashPreview(payloadHash: string | null | undefined): string {
  if (!payloadHash) return "(no hash)";
  return `${payloadHash.slice(0, 12)}...`;
}

const REFUND_STATUSES = ["REQUESTED", "PROCESSING", "SUCCEEDED", "FAILED"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export function toRefundStatus(value: string | null | undefined): RefundStatus {
  return (REFUND_STATUSES as ReadonlyArray<string>).includes(value ?? "")
    ? (value as RefundStatus)
    : "FAILED";
}

const WITHDRAWAL_STATUSES = [
  "REQUESTED",
  "RESERVED",
  "PROCESSING",
  "PAID",
  "FAILED",
  "CANCELLED",
] as const;
export type WithdrawalStatusValue = (typeof WITHDRAWAL_STATUSES)[number];

export function toWithdrawalStatus(value: string | null | undefined): WithdrawalStatusValue {
  return (WITHDRAWAL_STATUSES as ReadonlyArray<string>).includes(value ?? "")
    ? (value as WithdrawalStatusValue)
    : "FAILED";
}

/**
 * Build a lookup of user id -> display name from profile rows. Missing names
 * fall back to a short opaque id fragment rather than an email or any other
 * personal identifier.
 */
export function buildDisplayNameMap(
  rows: ReadonlyArray<RawProfileNameRow>,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.id, row.display_name?.trim() || `User ${row.id.slice(0, 8)}`);
  }
  return map;
}

export function displayNameFor(
  map: ReadonlyMap<string, string>,
  userId: string | null | undefined,
): string {
  if (!userId) return "Unassigned";
  return map.get(userId) ?? `User ${userId.slice(0, 8)}`;
}

/** Zero-based Supabase `range()` bounds for a 1-based page input. */
export function pageRange(page: number, pageSize: number): { from: number; to: number } {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeSize =
    Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 100) : 20;
  const from = (safePage - 1) * safeSize;
  return { from, to: from + safeSize - 1 };
}

/**
 * Project the `jsonb` returned by `admin_read_report_subject` /
 * `admin_read_dispute_subject` into a `CaseSubject`.
 *
 * Defensive on purpose: the payload crosses a PostgREST boundary, so every field
 * is narrowed rather than cast. An unreadable or absent payload becomes
 * `exists: false` with a plain label instead of throwing — a case page must still
 * open when its subject was deleted, and a blank card is worse than a sentence
 * saying the content is gone.
 */
export function mapCaseSubject(payload: unknown, resourceType: string): CaseSubject {
  const missing: CaseSubject = {
    exists: false,
    kind: resourceType,
    label: `This ${resourceType} could not be resolved`,
    status: null,
    body: null,
    occurredAt: null,
    subjectUserId: null,
    subjectUserName: null,
    counterpartyName: null,
    taskId: null,
    taskTitle: null,
    bookingId: null,
    amountCentavos: null,
    extra: {},
  };
  if (typeof payload !== "object" || payload === null) return missing;
  const raw = payload as Record<string, unknown>;

  const text = (key: string): string | null => {
    const value = raw[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  };
  const count = (key: string): number | null => {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    // PostgREST renders bigint as a string; a centavo amount must survive that.
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
    return null;
  };

  const extra: Record<string, string | number | boolean | null> = {};
  if (typeof raw.extra === "object" && raw.extra !== null) {
    for (const [key, value] of Object.entries(raw.extra as Record<string, unknown>)) {
      if (value === null) extra[key] = null;
      else if (typeof value === "string" || typeof value === "boolean") extra[key] = value;
      else if (typeof value === "number" && Number.isFinite(value)) extra[key] = value;
      else if (typeof value === "object") continue;
      else extra[key] = String(value);
    }
  }

  return {
    exists: raw.exists === true,
    kind: text("kind") ?? resourceType,
    label: text("label") ?? missing.label,
    status: text("status"),
    body: text("body"),
    occurredAt: text("occurredAt"),
    subjectUserId: text("subjectUserId"),
    subjectUserName: text("subjectUserName"),
    counterpartyName: text("counterpartyName"),
    taskId: text("taskId"),
    taskTitle: text("taskTitle"),
    bookingId: text("bookingId"),
    amountCentavos: count("amountCentavos"),
    extra,
  };
}

/**
 * Project the reporter/pile-on block of `admin_read_report_subject`.
 *
 * Returns `null` when the block is absent rather than inventing zeros: "no other
 * reports" and "we could not tell" must not look the same to a moderator.
 */
export function mapReportTriage(payload: unknown): ReportTriage | null {
  if (typeof payload !== "object" || payload === null) return null;
  const raw = payload as Record<string, unknown>;
  const reporter = raw.reporter;
  const summary = raw.resourceReportSummary;
  if (typeof reporter !== "object" || reporter === null) return null;
  if (typeof summary !== "object" || summary === null) return null;

  const reporterRaw = reporter as Record<string, unknown>;
  const summaryRaw = summary as Record<string, unknown>;
  const num = (value: unknown): number => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
    return 0;
  };
  const str = (value: unknown, fallback: string): string =>
    typeof value === "string" && value.length > 0 ? value : fallback;

  return {
    reporter: {
      id: str(reporterRaw.id, ""),
      displayName: str(reporterRaw.displayName, "Unknown reporter"),
      accountStatus: str(reporterRaw.accountStatus, "unknown"),
      reportsFiled: num(reporterRaw.reportsFiled),
      reportsDismissed: num(reporterRaw.reportsDismissed),
    },
    distinctReporters: num(summaryRaw.distinctReporters),
    openCases: num(summaryRaw.openCases),
    actionedCases: num(summaryRaw.actionedCases),
  };
}

import type { SupportedCurrency } from "@dizkarte/config";
import type { VerifiedProviderEvent } from "../ports/providers.js";

/**
 * Xendit provider helpers (pure, dependency-free, unit-tested).
 *
 * Xendit calls run in the Supabase Edge (Deno) runtime, which cannot import
 * this npm workspace bundle, so the runtime functions re-implement the same
 * logic inline (exactly as `payment-webhook` already does for HMAC via
 * `webhook-signature.ts`). Keeping the canonical rules here — amount
 * conversion, invoice-request shape, and the webhook → canonical-event
 * translation — gives one tested source of truth those inline copies mirror.
 *
 * Money note: the ledger is in integer centavos; Xendit PHP amounts are in
 * pesos (a decimal main unit). `xenditAmountFromCentavos` / `centavosFromXenditAmount`
 * are the only sanctioned conversions, so a rounding rule never drifts between
 * checkout creation and webhook reconciliation.
 */

export const XENDIT_API_BASE = "https://api.xendit.co";

/** Pesos Xendit expects for a centavo amount (2-dp main unit). */
export function xenditAmountFromCentavos(centavos: number): number {
  return Math.round(centavos) / 100;
}

/** Centavos for a Xendit peso amount, rounded to the nearest centavo. */
export function centavosFromXenditAmount(amount: number): number {
  return Math.round(amount * 100);
}

export type XenditInvoiceRequest = {
  readonly external_id: string;
  readonly amount: number;
  readonly currency: SupportedCurrency;
  readonly description: string;
  readonly success_redirect_url?: string;
  readonly failure_redirect_url?: string;
};

/**
 * Build the Xendit "create invoice" request body from a checkout intent.
 *
 * `external_id` is our own payment-intent id so a webhook can be traced back to
 * the exact intent even before the provider reference is persisted.
 */
export function buildXenditInvoiceRequest(input: {
  readonly paymentIntentId: string;
  readonly amountCentavos: number;
  readonly currency: SupportedCurrency;
  readonly description: string;
  readonly successRedirectUrl?: string;
  readonly failureRedirectUrl?: string;
}): XenditInvoiceRequest {
  return {
    external_id: input.paymentIntentId,
    amount: xenditAmountFromCentavos(input.amountCentavos),
    currency: input.currency,
    description: input.description,
    ...(input.successRedirectUrl ? { success_redirect_url: input.successRedirectUrl } : {}),
    ...(input.failureRedirectUrl ? { failure_redirect_url: input.failureRedirectUrl } : {}),
  };
}

/** Basic-auth header value for a Xendit secret key (key as username, empty password). */
export function xenditAuthHeader(secretKey: string): string {
  // btoa is available in Deno and modern Node; base64 of "<key>:".
  const raw = `${secretKey}:`;
  const encoded =
    typeof btoa === "function" ? btoa(raw) : Buffer.from(raw, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

/** A minimally-typed Xendit webhook body (only the fields we consume). */
export type XenditWebhookBody = {
  readonly id?: unknown;
  readonly external_id?: unknown;
  readonly status?: unknown;
  readonly amount?: unknown;
  readonly paid_amount?: unknown;
  readonly currency?: unknown;
  readonly paid_at?: unknown;
  readonly updated?: unknown;
  readonly created?: unknown;
  /** Disbursement/refund payloads nest the resource here under some webhooks. */
  readonly event?: unknown;
};

/**
 * Translate a verified Xendit webhook body into the canonical provider event
 * the ledger's `process_payment_event` consumes, or `null` for a status we
 * intentionally ignore (e.g. a `PENDING` invoice update).
 *
 * `signatureValid` is decided by the caller (the static callback-token check)
 * and threaded through unchanged, so this stays a pure mapping.
 */
export function translateXenditWebhook(
  body: XenditWebhookBody,
  signatureValid: boolean,
): VerifiedProviderEvent | null {
  const id = typeof body.id === "string" ? body.id : "";
  const rawStatus = typeof body.status === "string" ? body.status.toUpperCase() : "";
  if (id.length === 0 || rawStatus.length === 0) return null;

  const currency = typeof body.currency === "string" ? body.currency : "PHP";
  const amountPesos =
    typeof body.paid_amount === "number"
      ? body.paid_amount
      : typeof body.amount === "number"
        ? body.amount
        : 0;
  const occurredAt =
    (typeof body.paid_at === "string" && body.paid_at) ||
    (typeof body.updated === "string" && body.updated) ||
    (typeof body.created === "string" && body.created) ||
    new Date().toISOString();

  const mapped = XENDIT_STATUS_MAP[rawStatus];
  if (!mapped) return null;

  return {
    // A stable, unique id per (resource, terminal status) so replays of the
    // same transition collapse in `provider_events` without dropping a distinct
    // later transition.
    externalEventId: `${id}:${mapped.type}`,
    type: mapped.type,
    providerReference: id,
    amountCentavos: centavosFromXenditAmount(amountPesos),
    currency: currency as SupportedCurrency,
    signatureValid,
    occurredAt,
    synthetic: false,
  };
}

/** Xendit terminal statuses → canonical event types. Non-terminal states map to nothing. */
const XENDIT_STATUS_MAP: Readonly<
  Record<string, { readonly type: VerifiedProviderEvent["type"] }>
> = {
  // Invoice
  PAID: { type: "payment.confirmed" },
  SETTLED: { type: "payment.confirmed" },
  EXPIRED: { type: "payment.failed" },
  FAILED: { type: "payment.failed" },
  // Disbursement (payout)
  COMPLETED: { type: "payout.succeeded" },
  // Refund
  SUCCEEDED: { type: "refund.succeeded" },
};

/** Which finalizer a Xendit callback is routed to; carried in the webhook URL. */
export type XenditEventKind = "payment" | "refund" | "payout";

export function xenditEventKind(raw: string | null | undefined): XenditEventKind {
  return raw === "refund" || raw === "payout" ? raw : "payment";
}

export type XenditRefundTranslation = {
  readonly externalEventId: string;
  /** The `reference_id` we set on dispatch — our refund's idempotency key. */
  readonly refundIdempotencyKey: string;
  /** Xendit's own refund id, stored on the refund for reconciliation. */
  readonly providerReference: string;
  readonly amountCentavos: number;
  readonly type: "refund.succeeded" | "refund.failed";
};

/**
 * Translate a Xendit refund webhook into the inputs `process_refund_event`
 * needs, or `null` for a non-terminal/unknown status. The refund is matched by
 * `reference_id`, which the dispatch sets to the refund's idempotency key.
 */
export function translateXenditRefund(body: XenditWebhookBody): XenditRefundTranslation | null {
  const id = typeof body.id === "string" ? body.id : "";
  const referenceId =
    typeof (body as { reference_id?: unknown }).reference_id === "string"
      ? ((body as { reference_id?: string }).reference_id as string)
      : "";
  const rawStatus = typeof body.status === "string" ? body.status.toUpperCase() : "";
  if (id.length === 0 || referenceId.length === 0 || rawStatus.length === 0) return null;
  const type =
    rawStatus === "SUCCEEDED"
      ? ("refund.succeeded" as const)
      : rawStatus === "FAILED"
        ? ("refund.failed" as const)
        : null;
  if (!type) return null;
  const amountPesos = typeof body.amount === "number" ? body.amount : 0;
  return {
    externalEventId: `${id}:${type}`,
    refundIdempotencyKey: referenceId,
    providerReference: id,
    amountCentavos: centavosFromXenditAmount(amountPesos),
    type,
  };
}

export type XenditDisbursementTranslation = {
  /** The `external_id` we set on dispatch — our withdrawal id. */
  readonly withdrawalId: string;
  readonly result: "PAID" | "FAILED";
  /** Xendit's own disbursement id. */
  readonly providerReference: string;
  readonly failureReason: string | null;
};

/**
 * Translate a Xendit disbursement (payout) webhook into the inputs
 * `process_payout_result` needs, or `null` for a non-terminal/unknown status.
 * The withdrawal is matched by `external_id`, set to the withdrawal id on
 * dispatch. Xendit disbursement statuses are `COMPLETED` / `FAILED`.
 */
export function translateXenditDisbursement(
  body: XenditWebhookBody,
): XenditDisbursementTranslation | null {
  const id = typeof body.id === "string" ? body.id : "";
  const externalId = typeof body.external_id === "string" ? body.external_id : "";
  const rawStatus = typeof body.status === "string" ? body.status.toUpperCase() : "";
  if (id.length === 0 || externalId.length === 0) return null;
  const result =
    rawStatus === "COMPLETED"
      ? ("PAID" as const)
      : rawStatus === "FAILED"
        ? ("FAILED" as const)
        : null;
  if (!result) return null;
  const failureCode = (body as { failure_code?: unknown }).failure_code;
  return {
    withdrawalId: externalId,
    result,
    providerReference: id,
    failureReason: typeof failureCode === "string" ? failureCode : null,
  };
}

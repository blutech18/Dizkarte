import type { SupportedCurrency } from "@dizkarte/config";
import type { AdapterMode } from "@dizkarte/config";
import type { BookingId, PaymentIntentId } from "../ids.js";

/**
 * Payment provider port.
 *
 * The domain uses neutral `protected`/`pending` language and never claims legal
 * escrow. Synthetic events are server-generated, deterministic, marked
 * synthetic, and rejected under `production`.
 */

export type CheckoutRequest = {
  readonly bookingId: BookingId;
  readonly paymentIntentId: PaymentIntentId;
  readonly amountCentavos: number;
  readonly currency: SupportedCurrency;
  readonly idempotencyKey: string;
};

export type CheckoutResult = {
  readonly providerReference: string;
  readonly checkoutUrl: string | null;
  readonly mode: AdapterMode;
  readonly synthetic: boolean;
};

export type RawWebhook = {
  readonly rawBody: string;
  readonly headers: Readonly<Record<string, string>>;
};

export type VerifiedProviderEvent = {
  readonly externalEventId: string;
  readonly type:
    | "payment.confirmed"
    | "payment.failed"
    | "payout.succeeded"
    | "payout.failed"
    | "refund.succeeded"
    | "refund.failed";
  readonly providerReference: string;
  readonly amountCentavos: number;
  readonly currency: SupportedCurrency;
  readonly signatureValid: boolean;
  readonly occurredAt: string;
  readonly synthetic: boolean;
};

export type RefundRequest = {
  readonly providerReference: string;
  readonly amountCentavos: number;
  readonly idempotencyKey: string;
};

export type ReleaseRequest = {
  readonly bookingId: BookingId;
  readonly amountCentavos: number;
  readonly idempotencyKey: string;
};

export type PayoutRequest = {
  readonly payoutReference: string;
  readonly amountCentavos: number;
  readonly idempotencyKey: string;
};

export type ProviderOperation = {
  readonly providerReference: string;
  readonly status: "pending" | "succeeded" | "failed";
  readonly mode: AdapterMode;
  readonly synthetic: boolean;
};

export interface PaymentProvider {
  readonly mode: AdapterMode;
  createCheckout(input: CheckoutRequest): Promise<CheckoutResult>;
  verifyWebhook(input: RawWebhook): Promise<VerifiedProviderEvent>;
  refund(input: RefundRequest): Promise<ProviderOperation>;
  release(input: ReleaseRequest): Promise<ProviderOperation>;
  createPayout(input: PayoutRequest): Promise<ProviderOperation>;
  fetchOperation(reference: string): Promise<ProviderOperation>;
}

/** Map provider port. Public DTOs use only approximate/offset coordinates. */
export interface MapProvider {
  readonly mode: AdapterMode;
  geocode(query: string): Promise<{ lat: number; lng: number } | null>;
  reverseGeocode(lat: number, lng: number): Promise<{ address: string } | null>;
  approximate(lat: number, lng: number): { lat: number; lng: number };
  distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number;
}

/** Push provider port. Missing production credentials must fail closed. */
export interface PushProvider {
  readonly mode: AdapterMode;
  registerToken(input: { platform: "ios" | "android"; tokenReference: string }): Promise<void>;
  send(input: {
    tokenReference: string;
    title: string;
    body: string;
  }): Promise<{ delivered: boolean; synthetic: boolean }>;
}

/** Short-lived signed URL provider for private storage objects. */
export interface MediaSigner {
  readonly mode: AdapterMode;
  createSignedUrl(input: {
    bucket: string;
    path: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: string; synthetic: boolean }>;
}

/** Deterministic clock port for testable time. */
export interface Clock {
  now(): Date;
  nowIso(): string;
}

/** Identifier generator port (UUID v4-shaped). */
export interface IdGenerator {
  uuid(): string;
}

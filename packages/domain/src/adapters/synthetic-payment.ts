import { z } from "zod";
import type { AppEnvironment } from "@dizkarte/config";
import { SUPPORTED_CURRENCY } from "@dizkarte/config";
import { DomainError } from "../errors.js";
import type {
  CheckoutRequest,
  CheckoutResult,
  PaymentProvider,
  PayoutRequest,
  ProviderOperation,
  RawWebhook,
  RefundRequest,
  ReleaseRequest,
  VerifiedProviderEvent,
} from "../ports/providers.js";
import { assertSyntheticAllowed } from "./guard.js";
import { fnv1a, syntheticToken } from "./hash.js";

/**
 * Deterministic synthetic payment provider.
 *
 * - Never runs in production (guarded at construction).
 * - Every result is marked `synthetic: true` and mode `synthetic`.
 * - Webhook verification uses a deterministic non-cryptographic signature so
 *   tests can produce valid/invalid/replayed/reordered fixtures. It does NOT
 *   represent a real signed provider event.
 */
const syntheticEventSchema = z.object({
  externalEventId: z.string().min(1),
  type: z.enum([
    "payment.confirmed",
    "payment.failed",
    "payout.succeeded",
    "payout.failed",
    "refund.succeeded",
    "refund.failed",
  ]),
  providerReference: z.string().min(1),
  amountCentavos: z.number().int().nonnegative(),
  currency: z.literal(SUPPORTED_CURRENCY),
  occurredAt: z.string().datetime({ offset: true }),
});

export class SyntheticPaymentProvider implements PaymentProvider {
  public readonly mode = "synthetic" as const;

  constructor(
    environment: AppEnvironment,
    private readonly signingSecret = "synthetic-dev-secret",
  ) {
    assertSyntheticAllowed(environment, "payment");
  }

  private sign(rawBody: string): string {
    return fnv1a(`${this.signingSecret}:${rawBody}`);
  }

  async createCheckout(input: CheckoutRequest): Promise<CheckoutResult> {
    const providerReference = syntheticToken(
      "synracf",
      input.paymentIntentId,
      input.idempotencyKey,
    );
    return {
      providerReference,
      checkoutUrl: `https://synthetic.dizkarte.invalid/checkout/${providerReference}`,
      mode: this.mode,
      synthetic: true,
    };
  }

  async verifyWebhook(input: RawWebhook): Promise<VerifiedProviderEvent> {
    const provided = input.headers["x-synthetic-signature"] ?? "";
    const expected = this.sign(input.rawBody);
    const signatureValid = provided === expected;

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(input.rawBody);
    } catch {
      throw new DomainError("VALIDATION_ERROR", "Malformed synthetic webhook body.");
    }
    const parsed = syntheticEventSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new DomainError("VALIDATION_ERROR", "Invalid synthetic webhook payload.");
    }

    return {
      externalEventId: parsed.data.externalEventId,
      type: parsed.data.type,
      providerReference: parsed.data.providerReference,
      amountCentavos: parsed.data.amountCentavos,
      currency: parsed.data.currency,
      signatureValid,
      occurredAt: parsed.data.occurredAt,
      synthetic: true,
    };
  }

  async refund(input: RefundRequest): Promise<ProviderOperation> {
    return this.operation("synref", input.providerReference, input.idempotencyKey);
  }

  async release(input: ReleaseRequest): Promise<ProviderOperation> {
    return this.operation("synrel", input.bookingId, input.idempotencyKey);
  }

  async createPayout(input: PayoutRequest): Promise<ProviderOperation> {
    return this.operation("synpay", input.payoutReference, input.idempotencyKey);
  }

  async fetchOperation(reference: string): Promise<ProviderOperation> {
    return {
      providerReference: reference,
      status: "succeeded",
      mode: this.mode,
      synthetic: true,
    };
  }

  private operation(prefix: string, a: string, b: string): ProviderOperation {
    return {
      providerReference: syntheticToken(prefix, a, b),
      status: "succeeded",
      mode: this.mode,
      synthetic: true,
    };
  }

  /**
   * Test helper: build a signed synthetic webhook. Not part of the port; used
   * only by tests and the development payment simulator.
   */
  buildSignedWebhook(event: z.infer<typeof syntheticEventSchema>): RawWebhook {
    const rawBody = JSON.stringify(event);
    return {
      rawBody,
      headers: { "x-synthetic-signature": this.sign(rawBody) },
    };
  }
}

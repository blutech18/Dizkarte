import { describe, expect, it } from "vitest";
import {
  buildXenditInvoiceRequest,
  centavosFromXenditAmount,
  translateXenditWebhook,
  xenditAuthHeader,
  XENDIT_API_BASE,
} from "./xendit.js";

/**
 * Live contract slice against the payment provider's SANDBOX.
 *
 * SKIPPED unless a test key is present, so unit CI stays hermetic and offline.
 * To run it:
 *
 *   DIZKARTE_IT_PAYMENT_API_KEY=xnd_development_... \
 *   npm run test -- packages/domain/src/adapters/xendit.integration.test.ts
 *
 * Why this exists separately from `xendit.test.ts`: the unit suite proves our
 * translation logic against fixtures we wrote ourselves, which cannot catch the
 * one failure mode that matters here — the provider changing, or us having
 * misread, the actual wire format. This suite asserts the request we build is
 * accepted, and that what comes back still maps to the amounts and states the
 * booking flow depends on.
 *
 * Safety: refuses to run against a live key, so it can never create a real
 * charge. Amounts are the provider minimum and every `external_id` is prefixed
 * so sandbox records are identifiable.
 */
const apiKey = process.env.DIZKARTE_IT_PAYMENT_API_KEY?.trim();
const isTestKey = Boolean(apiKey && apiKey.includes("development"));
const runLive = Boolean(apiKey && isTestKey);

if (apiKey && !isTestKey) {
  throw new Error(
    "DIZKARTE_IT_PAYMENT_API_KEY is not a test key. This suite refuses to run against live credentials.",
  );
}

describe.skipIf(!runLive)("Xendit sandbox contract", () => {
  const authHeader = (): string => xenditAuthHeader(apiKey ?? "");
  const externalId = (label: string): string =>
    `dizkarte-it-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  async function createInvoice(body: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(`${XENDIT_API_BASE}/v2/invoices`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(`Xendit rejected the request (${response.status}): ${JSON.stringify(json)}`);
    }
    return json;
  }

  it("accepts the invoice request we build, and returns an amount that round-trips to the same centavos", async () => {
    const amountCentavos = 350000; // PHP 3,500.00
    const request = buildXenditInvoiceRequest({
      paymentIntentId: externalId("invoice"),
      amountCentavos,
      currency: "PHP",
      description: "Dizkarte integration test - not a real booking",
    });

    const invoice = await createInvoice(request);

    expect(typeof invoice.id).toBe("string");
    expect(invoice.external_id).toBe(request.external_id);
    expect(invoice.currency).toBe("PHP");
    expect(invoice.status).toBe("PENDING");
    // The money assertion that matters: pesos out must equal centavos in. A
    // silent 100x here would be catastrophic and invisible in the UI.
    expect(centavosFromXenditAmount(Number(invoice.amount))).toBe(amountCentavos);
    // The checkout URL is what the mobile app opens; without it the flow dead-ends.
    expect(String(invoice.invoice_url)).toMatch(/^https:\/\//);
  }, 30_000);

  it("offers the payment methods the contract requires (cards, GCash, Maya)", async () => {
    const invoice = await createInvoice(
      buildXenditInvoiceRequest({
        paymentIntentId: externalId("methods"),
        amountCentavos: 10000,
        currency: "PHP",
        description: "Dizkarte integration test - capability probe",
      }),
    );

    // Cards are offered by omission: the invoice reports whether they are excluded.
    expect(invoice.should_exclude_credit_card).toBe(false);

    const ewallets = (invoice.available_ewallets ?? []) as ReadonlyArray<{ ewallet_type?: string }>;
    const types = ewallets.map((wallet) => wallet.ewallet_type);
    expect(types).toContain("GCASH");
    // Maya is still reported under its former name on the invoice API.
    expect(types).toContain("PAYMAYA");
  }, 30_000);

  it("reports the sandbox environment, so a live key cannot masquerade as a test run", async () => {
    const invoice = await createInvoice(
      buildXenditInvoiceRequest({
        paymentIntentId: externalId("env"),
        amountCentavos: 10000,
        currency: "PHP",
        description: "Dizkarte integration test - environment check",
      }),
    );
    expect(String(invoice.invoice_url)).toContain("checkout-staging");
  }, 30_000);

  it("translates a provider-shaped PAID callback into the canonical confirmation", async () => {
    const invoice = await createInvoice(
      buildXenditInvoiceRequest({
        paymentIntentId: externalId("callback"),
        amountCentavos: 350000,
        currency: "PHP",
        description: "Dizkarte integration test - callback shape",
      }),
    );

    // The invoice is real; the PAID callback is synthesised from its own fields,
    // because completing a sandbox payment needs a human at the checkout page.
    // This proves the translator reads the fields the provider actually sends
    // rather than the field names we assumed when writing the unit fixtures.
    // A real invoice callback carries the invoice id as `id`, which is what the
    // checkout persists as `payment_intents.provider_reference`.
    const canonical = translateXenditWebhook(
      {
        id: String(invoice.id),
        external_id: String(invoice.external_id),
        status: "PAID",
        amount: Number(invoice.amount),
        paid_amount: Number(invoice.amount),
        currency: "PHP",
      },
      true,
    );

    expect(canonical).not.toBeNull();
    expect(canonical?.type).toBe("payment.confirmed");
    expect(canonical?.amountCentavos).toBe(350000);
    expect(canonical?.providerReference).toBe(String(invoice.id));
    expect(canonical?.synthetic).toBe(false);
  }, 30_000);
});

import { describe, expect, it } from "vitest";
import {
  buildXenditInvoiceRequest,
  centavosFromXenditAmount,
  translateXenditDisbursement,
  translateXenditRefund,
  translateXenditWebhook,
  xenditAmountFromCentavos,
  xenditAuthHeader,
  xenditEventKind,
  type XenditWebhookBody,
} from "./xendit.js";

describe("xendit amount conversion", () => {
  it("converts centavos to pesos as a 2-dp main unit", () => {
    expect(xenditAmountFromCentavos(150000)).toBe(1500);
    expect(xenditAmountFromCentavos(150050)).toBe(1500.5);
    expect(xenditAmountFromCentavos(1)).toBe(0.01);
  });

  it("round-trips pesos back to centavos", () => {
    expect(centavosFromXenditAmount(1500)).toBe(150000);
    expect(centavosFromXenditAmount(1500.5)).toBe(150050);
    expect(centavosFromXenditAmount(0.01)).toBe(1);
  });
});

describe("buildXenditInvoiceRequest", () => {
  it("uses the payment-intent id as external_id and converts the amount", () => {
    const req = buildXenditInvoiceRequest({
      paymentIntentId: "pi-123",
      amountCentavos: 250000,
      currency: "PHP",
      description: "Dizkarte booking",
      successRedirectUrl: "https://app/success",
    });
    expect(req.external_id).toBe("pi-123");
    expect(req.amount).toBe(2500);
    expect(req.currency).toBe("PHP");
    expect(req.success_redirect_url).toBe("https://app/success");
    expect(req.failure_redirect_url).toBeUndefined();
  });
});

describe("xenditAuthHeader", () => {
  it("base64-encodes the secret key as the basic-auth username", () => {
    // base64 of "xnd_secret:" — key as username, empty password.
    expect(xenditAuthHeader("xnd_secret")).toBe(`Basic ${btoa("xnd_secret:")}`);
    expect(xenditAuthHeader("xnd_secret").startsWith("Basic ")).toBe(true);
  });
});

describe("translateXenditWebhook", () => {
  const base: XenditWebhookBody = {
    id: "inv_abc",
    external_id: "pi-123",
    status: "PAID",
    amount: 1500,
    paid_amount: 1500,
    currency: "PHP",
    paid_at: "2026-01-01T00:00:00.000Z",
  };

  it("maps a PAID invoice to payment.confirmed with centavo amount", () => {
    const event = translateXenditWebhook(base, true);
    expect(event).not.toBeNull();
    expect(event?.type).toBe("payment.confirmed");
    expect(event?.providerReference).toBe("inv_abc");
    expect(event?.amountCentavos).toBe(150000);
    expect(event?.currency).toBe("PHP");
    expect(event?.signatureValid).toBe(true);
    expect(event?.synthetic).toBe(false);
    // externalEventId is stable per (resource, terminal type) for replay collapse.
    expect(event?.externalEventId).toBe("inv_abc:payment.confirmed");
  });

  it("maps EXPIRED/FAILED to payment.failed", () => {
    expect(translateXenditWebhook({ ...base, status: "EXPIRED" }, true)?.type).toBe(
      "payment.failed",
    );
    expect(translateXenditWebhook({ ...base, status: "FAILED" }, true)?.type).toBe(
      "payment.failed",
    );
  });

  it("maps disbursement COMPLETED and refund SUCCEEDED", () => {
    expect(translateXenditWebhook({ ...base, status: "COMPLETED" }, true)?.type).toBe(
      "payout.succeeded",
    );
    expect(translateXenditWebhook({ ...base, status: "SUCCEEDED" }, true)?.type).toBe(
      "refund.succeeded",
    );
  });

  it("prefers paid_amount, falling back to amount", () => {
    expect(
      translateXenditWebhook({ ...base, paid_amount: 1200, amount: 1500 }, true)?.amountCentavos,
    ).toBe(120000);
    expect(
      translateXenditWebhook({ id: "x", status: "PAID", amount: 900, currency: "PHP" }, true)
        ?.amountCentavos,
    ).toBe(90000);
  });

  it("threads signatureValid=false through unchanged (quarantined downstream)", () => {
    expect(translateXenditWebhook(base, false)?.signatureValid).toBe(false);
  });

  it("returns null for a non-terminal or unknown status", () => {
    expect(translateXenditWebhook({ ...base, status: "PENDING" }, true)).toBeNull();
    expect(translateXenditWebhook({ ...base, status: "SOMETHING" }, true)).toBeNull();
  });

  it("returns null when id or status is missing", () => {
    expect(translateXenditWebhook({ status: "PAID" }, true)).toBeNull();
    expect(translateXenditWebhook({ id: "inv_abc" }, true)).toBeNull();
  });
});

describe("xenditEventKind", () => {
  it("defaults unknown/absent to payment and passes through refund/payout", () => {
    expect(xenditEventKind(null)).toBe("payment");
    expect(xenditEventKind("payment")).toBe("payment");
    expect(xenditEventKind("something")).toBe("payment");
    expect(xenditEventKind("refund")).toBe("refund");
    expect(xenditEventKind("payout")).toBe("payout");
  });
});

describe("translateXenditRefund", () => {
  const base = {
    id: "rfd_1",
    reference_id: "refund-idem-key",
    status: "SUCCEEDED",
    amount: 1500,
    currency: "PHP",
  } as XenditWebhookBody;

  it("maps a SUCCEEDED refund to the finalizer inputs, matching by reference_id", () => {
    const r = translateXenditRefund(base);
    expect(r).not.toBeNull();
    expect(r?.type).toBe("refund.succeeded");
    expect(r?.refundIdempotencyKey).toBe("refund-idem-key");
    expect(r?.providerReference).toBe("rfd_1");
    expect(r?.amountCentavos).toBe(150000);
    expect(r?.externalEventId).toBe("rfd_1:refund.succeeded");
  });

  it("maps FAILED and rejects non-terminal/missing fields", () => {
    expect(translateXenditRefund({ ...base, status: "FAILED" })?.type).toBe("refund.failed");
    expect(translateXenditRefund({ ...base, status: "PENDING" })).toBeNull();
    expect(translateXenditRefund({ ...base, reference_id: "" } as XenditWebhookBody)).toBeNull();
    expect(translateXenditRefund({ id: "rfd_1", status: "SUCCEEDED" })).toBeNull();
  });
});

describe("translateXenditDisbursement", () => {
  const base: XenditWebhookBody = {
    id: "disb_1",
    external_id: "withdrawal-uuid",
    status: "COMPLETED",
  };

  it("maps COMPLETED to PAID, matching the withdrawal by external_id", () => {
    const d = translateXenditDisbursement(base);
    expect(d).not.toBeNull();
    expect(d?.result).toBe("PAID");
    expect(d?.withdrawalId).toBe("withdrawal-uuid");
    expect(d?.providerReference).toBe("disb_1");
    expect(d?.failureReason).toBeNull();
  });

  it("maps FAILED with a failure_code and rejects unknown/missing", () => {
    const d = translateXenditDisbursement({
      ...base,
      status: "FAILED",
      failure_code: "INSUFFICIENT_BALANCE",
    } as XenditWebhookBody);
    expect(d?.result).toBe("FAILED");
    expect(d?.failureReason).toBe("INSUFFICIENT_BALANCE");
    expect(translateXenditDisbursement({ ...base, status: "PENDING" })).toBeNull();
    expect(translateXenditDisbursement({ id: "disb_1", status: "COMPLETED" })).toBeNull();
  });
});

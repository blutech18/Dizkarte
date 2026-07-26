import { describe, expect, it } from "vitest";
import {
  DeterministicIdGenerator,
  DomainError,
  FixedClock,
  SyntheticMapProvider,
  SyntheticMediaSigner,
  SyntheticPaymentProvider,
  SyntheticPushProvider,
  isUuid,
  type BookingId,
  type PaymentIntentId,
} from "../index.js";

describe("SyntheticPaymentProvider — production guard", () => {
  it("cannot be constructed in production", () => {
    expect(() => new SyntheticPaymentProvider("production")).toThrow(DomainError);
  });
  it("can be constructed in development/test", () => {
    expect(() => new SyntheticPaymentProvider("development")).not.toThrow();
    expect(() => new SyntheticPaymentProvider("test")).not.toThrow();
  });
});

describe("SyntheticPaymentProvider — checkout & webhook", () => {
  const provider = new SyntheticPaymentProvider("test", "secret");

  it("creates a deterministic, clearly-synthetic checkout", async () => {
    const result = await provider.createCheckout({
      bookingId: "b" as BookingId,
      paymentIntentId: "pi" as PaymentIntentId,
      amountCentavos: 10000,
      currency: "PHP",
      idempotencyKey: "idem-123",
    });
    expect(result.synthetic).toBe(true);
    expect(result.mode).toBe("synthetic");
    expect(result.checkoutUrl).toContain("synthetic.dizkarte.invalid");

    const again = await provider.createCheckout({
      bookingId: "b" as BookingId,
      paymentIntentId: "pi" as PaymentIntentId,
      amountCentavos: 10000,
      currency: "PHP",
      idempotencyKey: "idem-123",
    });
    expect(again.providerReference).toBe(result.providerReference);
  });

  it("verifies a correctly signed webhook", async () => {
    const webhook = provider.buildSignedWebhook({
      externalEventId: "evt_1",
      type: "payment.confirmed",
      providerReference: "synracf_x",
      amountCentavos: 10000,
      currency: "PHP",
      occurredAt: "2026-02-01T10:00:00.000Z",
    });
    const event = await provider.verifyWebhook(webhook);
    expect(event.signatureValid).toBe(true);
    expect(event.type).toBe("payment.confirmed");
    expect(event.synthetic).toBe(true);
  });

  it("flags a tampered signature as invalid without throwing", async () => {
    const webhook = provider.buildSignedWebhook({
      externalEventId: "evt_2",
      type: "payment.confirmed",
      providerReference: "synracf_y",
      amountCentavos: 10000,
      currency: "PHP",
      occurredAt: "2026-02-01T10:00:00.000Z",
    });
    const tampered = { ...webhook, headers: { "x-synthetic-signature": "deadbeef" } };
    const event = await provider.verifyWebhook(tampered);
    expect(event.signatureValid).toBe(false);
  });

  it("rejects malformed and invalid webhook bodies", async () => {
    await expect(
      provider.verifyWebhook({ rawBody: "not json", headers: {} }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      provider.verifyWebhook({ rawBody: JSON.stringify({ foo: "bar" }), headers: {} }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("produces stable signatures for replay detection fixtures", async () => {
    const event = {
      externalEventId: "evt_replay",
      type: "payment.confirmed" as const,
      providerReference: "synracf_z",
      amountCentavos: 10000,
      currency: "PHP" as const,
      occurredAt: "2026-02-01T10:00:00.000Z",
    };
    const a = provider.buildSignedWebhook(event);
    const b = provider.buildSignedWebhook(event);
    expect(a.headers["x-synthetic-signature"]).toBe(b.headers["x-synthetic-signature"]);
    const verifiedA = await provider.verifyWebhook(a);
    const verifiedB = await provider.verifyWebhook(b);
    // Same external event id => the ledger layer treats the second as duplicate.
    expect(verifiedA.externalEventId).toBe(verifiedB.externalEventId);
  });
});

describe("synthetic map/push/media adapters", () => {
  it("map provider approximates coordinates and computes distance", () => {
    const map = new SyntheticMapProvider("development");
    const approx = map.approximate(14.5995123, 120.9842223);
    expect(approx.lat).toBe(14.6);
    const km = map.distanceKm({ lat: 14.6, lng: 121.0 }, { lat: 14.7, lng: 121.0 });
    expect(km).toBeGreaterThan(10);
    expect(km).toBeLessThan(12);
  });

  it("push provider returns a labeled synthetic delivery outcome", async () => {
    const push = new SyntheticPushProvider("development");
    const result = await push.send({ tokenReference: "t", title: "Hi", body: "Body" });
    expect(result).toEqual({ delivered: true, synthetic: true });
  });

  it("media signer produces short-lived clearly-synthetic urls", async () => {
    const signer = new SyntheticMediaSigner("development");
    const signed = await signer.createSignedUrl({
      bucket: "id-documents",
      path: "user/1/front.jpg",
      expiresInSeconds: 300,
    });
    expect(signed.synthetic).toBe(true);
    expect(signed.url).toContain("synthetic.dizkarte.invalid");
  });

  it("all synthetic adapters refuse production", () => {
    expect(() => new SyntheticMapProvider("production")).toThrow(DomainError);
    expect(() => new SyntheticPushProvider("production")).toThrow(DomainError);
    expect(() => new SyntheticMediaSigner("production")).toThrow(DomainError);
  });
});

describe("clock and id generator", () => {
  it("FixedClock is deterministic and advances by step", () => {
    const clock = new FixedClock("2026-01-01T00:00:00.000Z", 1000);
    expect(clock.nowIso()).toBe("2026-01-01T00:00:00.000Z");
    expect(clock.nowIso()).toBe("2026-01-01T00:00:01.000Z");
  });

  it("DeterministicIdGenerator yields valid, stable, unique uuids", () => {
    const gen1 = new DeterministicIdGenerator("seed");
    const gen2 = new DeterministicIdGenerator("seed");
    const a = gen1.uuid();
    const b = gen1.uuid();
    expect(isUuid(a)).toBe(true);
    expect(a).not.toBe(b);
    // Same seed reproduces the same sequence.
    expect(gen2.uuid()).toBe(a);
  });
});

import { describe, expect, it } from "vitest";

import {
  hmacSha256Hex,
  timingSafeEqual,
  verifyWebhookSignature,
} from "./webhook-signature.js";

const SECRET = "whsec_test_0123456789";
const BODY = '{"type":"payment.confirmed","providerReference":"pi_abc","amountCentavos":150000}';

describe("hmacSha256Hex", () => {
  it("matches a known HMAC-SHA256 vector", async () => {
    // RFC-style check: HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog")
    const hex = await hmacSha256Hex(
      "key",
      "The quick brown fox jumps over the lazy dog",
    );
    expect(hex).toBe("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
  });

  it("is deterministic and lowercase hex", async () => {
    const a = await hmacSha256Hex(SECRET, BODY);
    const b = await hmacSha256Hex(SECRET, BODY);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("timingSafeEqual", () => {
  it("is true only for identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("verifyWebhookSignature — hmac_sha256_hex", () => {
  it("accepts a correct bare hex digest, case-insensitively", async () => {
    const digest = await hmacSha256Hex(SECRET, BODY);
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signatureHeader: digest.toUpperCase(),
      secret: SECRET,
      scheme: "hmac_sha256_hex",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const digest = await hmacSha256Hex(SECRET, BODY);
    const result = await verifyWebhookSignature({
      rawBody: BODY.replace("150000", "1500000"),
      signatureHeader: digest,
      secret: SECRET,
      scheme: "hmac_sha256_hex",
    });
    expect(result).toEqual({ valid: false, reason: "Signature mismatch." });
  });

  it("rejects a wrong secret", async () => {
    const digest = await hmacSha256Hex("other-secret", BODY);
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signatureHeader: digest,
      secret: SECRET,
      scheme: "hmac_sha256_hex",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a missing header or missing secret", async () => {
    expect(
      (await verifyWebhookSignature({
        rawBody: BODY,
        signatureHeader: null,
        secret: SECRET,
        scheme: "hmac_sha256_hex",
      })).valid,
    ).toBe(false);
    expect(
      (await verifyWebhookSignature({
        rawBody: BODY,
        signatureHeader: "deadbeef",
        secret: "",
        scheme: "hmac_sha256_hex",
      })).valid,
    ).toBe(false);
  });
});

describe("verifyWebhookSignature — hmac_sha256_timestamped", () => {
  const NOW_MS = 1_760_000_000_000;
  const T = Math.floor(NOW_MS / 1000);

  async function signedHeader(ts: number, body = BODY): Promise<string> {
    const v1 = await hmacSha256Hex(SECRET, `${ts}.${body}`);
    return `t=${ts},v1=${v1}`;
  }

  it("accepts a fresh, correctly signed event", async () => {
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signatureHeader: await signedHeader(T),
      secret: SECRET,
      scheme: "hmac_sha256_timestamped",
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(true);
  });

  it("parses parts order-insensitively", async () => {
    const v1 = await hmacSha256Hex(SECRET, `${T}.${BODY}`);
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signatureHeader: `v1=${v1}, t=${T}`,
      secret: SECRET,
      scheme: "hmac_sha256_timestamped",
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a stale timestamp beyond tolerance (replay)", async () => {
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signatureHeader: await signedHeader(T - 4000),
      secret: SECRET,
      scheme: "hmac_sha256_timestamped",
      toleranceSeconds: 300,
      nowMs: NOW_MS,
    });
    expect(result).toEqual({ valid: false, reason: "Signature timestamp outside tolerance." });
  });

  it("rejects when the timestamp is swapped so the signed message differs", async () => {
    // A valid signature for T, presented with a different (still-fresh) t, must
    // fail because the signed message binds the timestamp.
    const v1 = await hmacSha256Hex(SECRET, `${T}.${BODY}`);
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signatureHeader: `t=${T + 10},v1=${v1}`,
      secret: SECRET,
      scheme: "hmac_sha256_timestamped",
      nowMs: NOW_MS,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a malformed header", async () => {
    const result = await verifyWebhookSignature({
      rawBody: BODY,
      signatureHeader: "not-a-valid-header",
      secret: SECRET,
      scheme: "hmac_sha256_timestamped",
      nowMs: NOW_MS,
    });
    expect(result).toEqual({ valid: false, reason: "Malformed signature header." });
  });
});

/**
 * Real webhook signature verification.
 *
 * Payment providers authenticate a webhook by signing the raw request body with
 * a shared secret; the receiver recomputes the signature and compares. This is
 * the verification the live payment webhook uses in place of the synthetic
 * FNV-1a placeholder. It is deliberately provider-neutral: the two schemes below
 * cover how nearly every provider signs (a bare HMAC-SHA256 hex digest, or a
 * timestamped `t=...,v1=...` header), and which one a given provider uses is
 * configuration, not code.
 *
 * Uses the Web Crypto API (`crypto.subtle`), which exists in both the Deno edge
 * runtime and Node 20+, so the exact algorithm here is mirrored byte-for-byte by
 * the edge function and exercised by this package's tests.
 */

export type WebhookSignatureScheme = "hmac_sha256_hex" | "hmac_sha256_timestamped";

export type WebhookSignatureInput = {
  /** Exact bytes of the request body, unparsed. Any re-serialisation breaks the digest. */
  readonly rawBody: string;
  /** The value of the provider's signature header. */
  readonly signatureHeader: string | null | undefined;
  readonly secret: string;
  readonly scheme: WebhookSignatureScheme;
  /**
   * For the timestamped scheme: how far the signed timestamp may be from now, in
   * seconds. Rejects replayed events outside the window. Ignored otherwise.
   */
  readonly toleranceSeconds?: number;
  /** Injectable clock for deterministic tests. Defaults to `Date.now()`. */
  readonly nowMs?: number;
};

export type WebhookSignatureResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string };

const encoder = new TextEncoder();

/** HMAC-SHA256 of `message` under `secret`, lowercase hex. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const bytes = new Uint8Array(signature);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Constant-time string comparison.
 *
 * A byte-by-byte early-return compare leaks, through timing, how much of a
 * forged signature is correct, which is enough to forge one. This always walks
 * the full length. Length mismatch is reported as unequal without short-circuit
 * on content.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  // Compare against a fixed reference length so the loop count does not reveal
  // which input was shorter; a length difference still fails.
  const length = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

/** Parse a `t=<unix>,v1=<hex>` header into its parts. Order-insensitive. */
function parseTimestampedHeader(header: string): { t: number; v1: string } | null {
  let t: number | null = null;
  let v1: string | null = null;
  for (const part of header.split(",")) {
    const [rawKey, rawValue] = part.split("=");
    const key = rawKey?.trim();
    const value = rawValue?.trim();
    if (!key || value === undefined) continue;
    if (key === "t") {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed > 0) t = parsed;
    } else if (key === "v1") {
      v1 = value.toLowerCase();
    }
  }
  if (t === null || v1 === null) return null;
  return { t, v1 };
}

/**
 * Verify a provider webhook signature. Never throws for a bad signature — an
 * invalid or malformed signature returns `{ valid: false, reason }` so the
 * caller can quarantine the event rather than crash.
 */
export async function verifyWebhookSignature(
  input: WebhookSignatureInput,
): Promise<WebhookSignatureResult> {
  if (input.secret.length === 0) {
    return { valid: false, reason: "No signing secret configured." };
  }
  const header = input.signatureHeader?.trim();
  if (!header) {
    return { valid: false, reason: "Missing signature header." };
  }

  if (input.scheme === "hmac_sha256_hex") {
    const expected = await hmacSha256Hex(input.secret, input.rawBody);
    return timingSafeEqual(expected, header.toLowerCase())
      ? { valid: true }
      : { valid: false, reason: "Signature mismatch." };
  }

  // hmac_sha256_timestamped
  const parsed = parseTimestampedHeader(header);
  if (!parsed) {
    return { valid: false, reason: "Malformed signature header." };
  }
  const tolerance = input.toleranceSeconds ?? 300;
  const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSec - parsed.t) > tolerance) {
    return { valid: false, reason: "Signature timestamp outside tolerance." };
  }
  const expected = await hmacSha256Hex(input.secret, `${parsed.t}.${input.rawBody}`);
  return timingSafeEqual(expected, parsed.v1)
    ? { valid: true }
    : { valid: false, reason: "Signature mismatch." };
}

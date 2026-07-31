// Supabase Edge Function: payment-webhook
//
// Provider-authoritative payment event boundary. This function:
//   * Verifies an event signature BEFORE trusting any field.
//   * FAILS CLOSED in production when a live provider/secret is not configured.
//     It never fabricates a production "paid" state and never hard-codes a
//     specific provider claim.
//   * In development/test with PAYMENT_MODE=synthetic, it verifies the
//     deterministic synthetic signature (clearly non-production) so the flow is
//     testable end to end.
//   * In live/sandbox mode it verifies a real HMAC-SHA256 signature. The exact
//     algorithm mirrors `@dizkarte/domain`'s `verifyWebhookSignature`, which is
//     unit-tested against known vectors; this file re-implements it because the
//     Deno edge runtime does not share the npm workspace bundle.
//   * Delegates all state changes to the transactional, idempotent,
//     replay-safe RPC `process_payment_event` using the service-role key.
//
// Deno runtime (Supabase Edge Functions). Not part of the npm workspace build.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Portable FNV-1a hash mirroring the synthetic adapter in @dizkarte/domain. */
function fnv1a(input: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const encoder = new TextEncoder();

/** HMAC-SHA256 of `message` under `secret`, lowercase hex. Mirrors the domain util. */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
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

/** Constant-time comparison; walks the full length regardless of mismatch position. */
function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const length = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < length; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

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
 * Verify a live/sandbox provider signature. Scheme and header name are config so
 * the same code serves whichever approved provider is chosen:
 *   PAYMENT_WEBHOOK_SIGNATURE_SCHEME = hmac_sha256_hex | hmac_sha256_timestamped
 *   PAYMENT_WEBHOOK_SIGNATURE_HEADER = header carrying the signature
 */
async function verifyLiveSignature(
  req: Request,
  rawBody: string,
  secret: string,
): Promise<boolean> {
  const scheme = Deno.env.get("PAYMENT_WEBHOOK_SIGNATURE_SCHEME") ?? "hmac_sha256_timestamped";
  const headerName = Deno.env.get("PAYMENT_WEBHOOK_SIGNATURE_HEADER") ?? "x-signature";
  const header = req.headers.get(headerName)?.trim();
  if (!header) return false;

  if (scheme === "hmac_sha256_hex") {
    const expected = await hmacSha256Hex(secret, rawBody);
    return timingSafeEqual(expected, header.toLowerCase());
  }

  const parsed = parseTimestampedHeader(header);
  if (!parsed) return false;
  const tolerance = Number(Deno.env.get("PAYMENT_WEBHOOK_TOLERANCE_SECONDS") ?? "300");
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - parsed.t) > tolerance) return false;
  const expected = await hmacSha256Hex(secret, `${parsed.t}.${rawBody}`);
  return timingSafeEqual(expected, parsed.v1);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json(405, { success: false, error: { code: "VALIDATION_ERROR", message: "POST only" } });
  }

  const env = Deno.env.get("DIZKARTE_ENV") ?? "development";
  const paymentMode = Deno.env.get("PAYMENT_MODE") ?? "synthetic";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Deno.env.get("PAYMENT_WEBHOOK_SECRET");
  const providerName = Deno.env.get("PAYMENT_PROVIDER");

  // Fail closed: production must have a live provider + secret configured.
  if (env === "production" && (paymentMode !== "live" || !webhookSecret || !providerName)) {
    return json(503, {
      success: false,
      error: {
        code: "CONFIGURATION_ERROR",
        message: "Live payment provider is not configured; refusing to process events.",
      },
    });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return json(503, {
      success: false,
      error: { code: "CONFIGURATION_ERROR", message: "Server is not configured." },
    });
  }

  const rawBody = await req.text();

  // --- Signature verification ---
  let signatureValid = false;
  if (paymentMode === "synthetic" && env !== "production") {
    const provided = req.headers.get("x-synthetic-signature") ?? "";
    const secret = webhookSecret ?? "synthetic-dev-secret";
    signatureValid = provided === fnv1a(`${secret}:${rawBody}`);
  } else if ((paymentMode === "live" || paymentMode === "sandbox") && webhookSecret) {
    // Real HMAC verification. An unverified or malformed signature stays false
    // and is quarantined downstream by process_payment_event.
    signatureValid = await verifyLiveSignature(req, rawBody, webhookSecret);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json(400, {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Malformed webhook body." },
    });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const payloadHash = fnv1a(rawBody);
  const { data, error } = await client.rpc("process_payment_event", {
    p_provider: providerName ?? (paymentMode === "synthetic" ? "synthetic" : "unknown"),
    p_external_event_id: String(parsed.externalEventId ?? ""),
    p_type: String(parsed.type ?? ""),
    p_provider_reference: String(parsed.providerReference ?? ""),
    p_amount_centavos: Number(parsed.amountCentavos ?? 0),
    p_currency: String(parsed.currency ?? "PHP"),
    p_signature_valid: signatureValid,
    p_payload_hash: payloadHash,
  });

  if (error) {
    // Do not leak provider internals; return a stable safe error.
    return json(502, {
      success: false,
      error: { code: "PROVIDER_UNAVAILABLE", message: "Event could not be processed." },
    });
  }

  // Always ACK 200 so the provider does not needlessly retry a stored event;
  // quarantine/duplicate outcomes are recorded server-side for reconciliation.
  return json(200, {
    success: true,
    data: { processingStatus: data?.processing_status ?? "RECEIVED" },
  });
});

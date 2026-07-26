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
  } else if (paymentMode === "live" && webhookSecret) {
    // A real, approved provider's HMAC/asymmetric verification is integrated in
    // task 9.1 once the provider is selected. Until then live mode has no
    // verifier and events are treated as unverified (quarantined downstream).
    signatureValid = false;
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

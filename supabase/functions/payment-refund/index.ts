// Supabase Edge Function: payment-refund
//
// Finance-Admin-initiated refund DISPATCH. Records the refund intent through the
// capability-checked `admin_refund` RPC (no ledger movement), then asks the
// provider to refund. The authoritative money movement happens later, only when
// the provider's refund webhook is verified and finalized by
// `process_refund_event` (routed via `payment-webhook?kind=refund`).
//
//   * Runs the provider secret key ONLY here (never client-side).
//   * The reason + capability are enforced by `admin_refund` itself.
//   * Fails SAFE: if the provider dispatch cannot be made, the intent is still
//     recorded (REQUESTED) and a clear message is returned — never a fabricated
//     success, never a ledger change.
//
// Live dispatch requires the provider key to permit refunds and, for invoice
// payments, the underlying payment reference. This is intentionally the only
// place that changes if the approved refund policy/permissions change.
//
// Deno runtime (Supabase Edge Functions). Not part of the npm workspace build.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const XENDIT_API_BASE = "https://api.xendit.co";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

function xenditAuthHeader(secretKey: string): string {
  return `Basic ${btoa(`${secretKey}:`)}`;
}

function xenditAmountFromCentavos(centavos: number): number {
  return Math.round(centavos) / 100;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return json(405, {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "POST only." },
    });
  }

  const paymentMode = Deno.env.get("PAYMENT_MODE") ?? "synthetic";
  const provider = (Deno.env.get("PAYMENT_PROVIDER") ?? "").toLowerCase();
  const apiKey = Deno.env.get("PAYMENT_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(503, {
      success: false,
      error: { code: "CONFIGURATION_ERROR", message: "Server is not configured." },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const admin = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await admin.auth.getUser();
  if (userErr || !userData?.user) {
    return json(401, {
      success: false,
      error: { code: "FORBIDDEN", message: "Authentication is required." },
    });
  }

  let payload: { paymentIntentId?: unknown; amountCentavos?: unknown; reason?: unknown };
  try {
    payload = JSON.parse(await req.text());
  } catch {
    return json(400, { success: false, error: { code: "VALIDATION_ERROR", message: "Bad body." } });
  }
  const paymentIntentId =
    typeof payload.paymentIntentId === "string" ? payload.paymentIntentId : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (!paymentIntentId || !reason) {
    return json(400, {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "paymentIntentId and reason are required." },
    });
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve the refund amount: an explicit amount, else a full refund of the
  // confirmed intent.
  let amountCentavos = Number(payload.amountCentavos ?? 0);
  if (!Number.isFinite(amountCentavos) || amountCentavos <= 0) {
    const { data: intentRow } = await service
      .from("payment_intents")
      .select("amount_centavos")
      .eq("id", paymentIntentId)
      .maybeSingle();
    amountCentavos = Number(
      (intentRow as { amount_centavos?: number } | null)?.amount_centavos ?? 0,
    );
  }
  if (!Number.isFinite(amountCentavos) || amountCentavos <= 0) {
    return json(400, {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Could not resolve a refund amount." },
    });
  }

  // 1) Record the refund intent (capability + state checks live in the RPC).
  const idempotencyKey = `refund_${paymentIntentId}_${amountCentavos}_${Date.now()}`;
  const { data: refundRow, error: refundErr } = await admin.rpc("admin_refund", {
    p_payment_intent_id: paymentIntentId,
    p_amount_centavos: amountCentavos,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
  });
  if (refundErr) {
    const message = refundErr.message.includes("FORBIDDEN")
      ? "Requires an active finance/super Admin."
      : "Refund could not be recorded.";
    return json(refundErr.message.includes("FORBIDDEN") ? 403 : 409, {
      success: false,
      error: { code: "REFUND_REJECTED", message },
    });
  }
  const refund = refundRow as { id: string; idempotency_key: string; status: string };

  // 2) Dispatch to the provider. Fail SAFE — the intent stays recorded.
  const providerReady =
    (paymentMode === "sandbox" || paymentMode === "live") && provider === "xendit" && !!apiKey;
  if (!providerReady) {
    return json(200, {
      success: true,
      data: {
        refundId: refund.id,
        status: refund.status,
        dispatched: false,
        message: "Refund recorded. Provider dispatch is not configured.",
      },
    });
  }

  try {
    const res = await fetch(`${XENDIT_API_BASE}/refunds`, {
      method: "POST",
      headers: { Authorization: xenditAuthHeader(apiKey!), "content-type": "application/json" },
      body: JSON.stringify({
        // `reference_id` is echoed back on the refund webhook and is how the
        // finalizer matches the event to this refund intent.
        reference_id: refund.idempotency_key,
        amount: xenditAmountFromCentavos(amountCentavos),
        currency: "PHP",
        reason: "REQUESTED_BY_CUSTOMER",
      }),
    });
    if (!res.ok) {
      // Recorded but not dispatched (e.g. key lacks refund permission or the
      // payment reference is required). Never fabricate a refund.
      return json(200, {
        success: true,
        data: {
          refundId: refund.id,
          status: refund.status,
          dispatched: false,
          message: "Refund recorded. Provider dispatch was rejected; finalize via webhook.",
        },
      });
    }
    const xrefund = (await res.json()) as { id?: string };
    if (xrefund?.id) {
      await service
        .from("refunds")
        .update({
          status: "PROCESSING",
          provider_reference: xrefund.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", refund.id);
    }
    return json(200, {
      success: true,
      data: { refundId: refund.id, status: "PROCESSING", dispatched: true },
    });
  } catch {
    return json(200, {
      success: true,
      data: {
        refundId: refund.id,
        status: refund.status,
        dispatched: false,
        message: "Refund recorded. Provider dispatch failed; finalize via webhook.",
      },
    });
  }
});

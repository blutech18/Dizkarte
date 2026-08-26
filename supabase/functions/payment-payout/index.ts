// Supabase Edge Function: payment-payout
//
// Dispatch a RESERVED withdrawal to the provider as a disbursement (payout).
// `request_withdrawal` has already reserved the funds (moved TASKER_AVAILABLE ->
// PAYOUT_CLEARING); this asks the provider to pay out. The authoritative result
// arrives later via the provider's disbursement webhook and is finalized by
// `process_payout_result` (routed through `payment-webhook?kind=payout`):
// COMPLETED settles, FAILED reverses the reservation exactly once.
//
//   * Runs the provider secret key ONLY here.
//   * Only the withdrawal's owning Tasker may dispatch their own RESERVED
//     withdrawal.
//   * `external_id` is set to the withdrawal id so the webhook can match the
//     result back to it.
//   * Fails SAFE: if dispatch cannot be made (no Money-out permission / no
//     usable payout account), the withdrawal stays RESERVED and a clear message
//     is returned — never a fabricated payout, never a status jump.
//
// Live dispatch requires the provider key to permit Money-out (disbursements)
// and an approved payout-account model. Those are Client + counsel owned.
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
  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData?.user) {
    return json(401, {
      success: false,
      error: { code: "FORBIDDEN", message: "Authentication is required." },
    });
  }
  const userId = userData.user.id;

  let payload: { withdrawalId?: unknown };
  try {
    payload = JSON.parse(await req.text());
  } catch {
    return json(400, { success: false, error: { code: "VALIDATION_ERROR", message: "Bad body." } });
  }
  const withdrawalId = typeof payload.withdrawalId === "string" ? payload.withdrawalId : "";
  if (!withdrawalId) {
    return json(400, {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "A withdrawalId is required." },
    });
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: wRow } = await service
    .from("withdrawals")
    .select("id,tasker_id,payout_method_id,amount_centavos,status,provider_reference")
    .eq("id", withdrawalId)
    .maybeSingle();
  const withdrawal = wRow as {
    id: string;
    tasker_id: string;
    payout_method_id: string | null;
    amount_centavos: number;
    status: string;
  } | null;
  if (!withdrawal) {
    return json(404, {
      success: false,
      error: { code: "NOT_FOUND", message: "Withdrawal not found." },
    });
  }
  if (withdrawal.tasker_id !== userId) {
    return json(403, {
      success: false,
      error: { code: "FORBIDDEN", message: "You do not own this withdrawal." },
    });
  }
  if (withdrawal.status !== "RESERVED") {
    return json(409, {
      success: false,
      error: {
        code: "INVALID_STATE",
        message: `Withdrawal is not dispatchable in state ${withdrawal.status}.`,
      },
    });
  }

  const providerReady =
    (paymentMode === "sandbox" || paymentMode === "live") && provider === "xendit" && !!apiKey;
  if (!providerReady) {
    return json(200, {
      success: true,
      data: {
        withdrawalId: withdrawal.id,
        status: withdrawal.status,
        dispatched: false,
        message: "Withdrawal reserved. Provider payout dispatch is not configured.",
      },
    });
  }

  // Payout account. We store only a masked label + provider reference (the
  // payout-token boundary), never raw credentials; the disbursement uses those.
  const { data: pmRow } = await service
    .from("payout_methods")
    .select("provider,provider_reference,masked_label")
    .eq("id", withdrawal.payout_method_id)
    .maybeSingle();
  const pm = pmRow as {
    provider: string;
    provider_reference: string;
    masked_label: string;
  } | null;
  if (!pm) {
    return json(200, {
      success: true,
      data: {
        withdrawalId: withdrawal.id,
        status: withdrawal.status,
        dispatched: false,
        message: "Withdrawal reserved. No payout account on file to dispatch to.",
      },
    });
  }

  try {
    const res = await fetch(`${XENDIT_API_BASE}/disbursements`, {
      method: "POST",
      headers: { Authorization: xenditAuthHeader(apiKey!), "content-type": "application/json" },
      body: JSON.stringify({
        // The webhook matches the result back to this withdrawal by external_id.
        external_id: withdrawal.id,
        amount: xenditAmountFromCentavos(withdrawal.amount_centavos),
        bank_code: pm.provider,
        account_holder_name: pm.masked_label,
        account_number: pm.provider_reference,
        description: `Dizkarte payout ${withdrawal.id}`,
      }),
    });
    if (!res.ok) {
      // Reserved but not dispatched (e.g. key lacks Money-out permission). The
      // reservation stands; it can be retried or reversed. Never fabricate.
      return json(200, {
        success: true,
        data: {
          withdrawalId: withdrawal.id,
          status: withdrawal.status,
          dispatched: false,
          message: "Withdrawal reserved. Provider payout dispatch was rejected.",
        },
      });
    }
    const disb = (await res.json()) as { id?: string };
    if (disb?.id) {
      await service
        .from("withdrawals")
        .update({
          status: "PROCESSING",
          provider_reference: disb.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", withdrawal.id);
    }
    return json(200, {
      success: true,
      data: { withdrawalId: withdrawal.id, status: "PROCESSING", dispatched: true },
    });
  } catch {
    return json(200, {
      success: true,
      data: {
        withdrawalId: withdrawal.id,
        status: withdrawal.status,
        dispatched: false,
        message: "Withdrawal reserved. Provider payout dispatch failed.",
      },
    });
  }
});

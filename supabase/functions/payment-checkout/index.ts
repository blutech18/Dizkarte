// Supabase Edge Function: payment-checkout
//
// Server-side checkout creation for the approved payment provider. Runs the
// provider's secret key ONLY here — never in the mobile bundle — and returns a
// hosted checkout URL for the booking's client to pay.
//
//   * Requires the authenticated booking owner (client). A non-owner, or any
//     unauthenticated caller, is refused.
//   * Fails closed: outside development/test it refuses unless a live/sandbox
//     provider is configured; it never fabricates a checkout.
//   * Creates the provider checkout, then persists `payment_intents.provider`
//     and `provider_reference` (service role) so the authoritative webhook can
//     match the later `payment.confirmed` event to this exact intent.
//   * The webhook (`payment-webhook`) remains the ONLY authority that confirms a
//     booking; this function never marks anything paid.
//
// Today the only wired provider is Xendit (invoice checkout). The Xendit call
// mirrors `@dizkarte/domain`'s tested `buildXenditInvoiceRequest` /
// amount-conversion helpers, re-implemented inline because the Deno edge runtime
// cannot import the npm workspace bundle.
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

/** Pesos Xendit expects for a centavo amount (mirror of the domain helper). */
function xenditAmountFromCentavos(centavos: number): number {
  return Math.round(centavos) / 100;
}

function xenditAuthHeader(secretKey: string): string {
  return `Basic ${btoa(`${secretKey}:`)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return json(405, {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "POST only." },
    });
  }

  const env = Deno.env.get("DIZKARTE_ENV") ?? "development";
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

  // Fail closed: a real provider must be configured (any environment). Synthetic
  // checkout is handled entirely in-app by the development simulator, never here.
  const providerReady =
    (paymentMode === "sandbox" || paymentMode === "live") && provider === "xendit" && !!apiKey;
  if (!providerReady) {
    return json(503, {
      success: false,
      error: {
        code: "CONFIGURATION_ERROR",
        message: "No approved payment provider is configured for checkout.",
      },
    });
  }

  // Require the signed-in booking owner.
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

  let payload: { bookingId?: unknown };
  try {
    payload = JSON.parse(await req.text());
  } catch {
    return json(400, { success: false, error: { code: "VALIDATION_ERROR", message: "Bad body." } });
  }
  const bookingId = typeof payload.bookingId === "string" ? payload.bookingId : "";
  if (!bookingId) {
    return json(400, {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "A bookingId is required." },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Load the booking and confirm ownership + payable state.
  const { data: bookingRow } = await admin
    .from("bookings")
    .select("id,client_id,status,agreed_centavos,currency")
    .eq("id", bookingId)
    .maybeSingle();
  const booking = bookingRow as {
    id: string;
    client_id: string;
    status: string;
    agreed_centavos: number;
    currency: string;
  } | null;
  if (!booking) {
    return json(404, {
      success: false,
      error: { code: "NOT_FOUND", message: "Booking not found." },
    });
  }
  if (booking.client_id !== userId) {
    return json(403, {
      success: false,
      error: { code: "FORBIDDEN", message: "Only the booking's client can pay for it." },
    });
  }
  if (booking.status !== "PAYMENT_PENDING") {
    return json(409, {
      success: false,
      error: { code: "INVALID_STATE", message: "This booking is not awaiting payment." },
    });
  }

  const { data: intentRow } = await admin
    .from("payment_intents")
    .select("id,status,provider_reference")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const intent = intentRow as {
    id: string;
    status: string;
    provider_reference: string | null;
  } | null;
  if (!intent) {
    return json(404, {
      success: false,
      error: { code: "NOT_FOUND", message: "No payment intent for this booking." },
    });
  }
  if (intent.status === "CONFIRMED") {
    return json(409, {
      success: false,
      error: { code: "INVALID_STATE", message: "This booking is already paid." },
    });
  }

  // Create the Xendit invoice (sandbox/live keyed by the secret key's mode).
  const successRedirect = Deno.env.get("PAYMENT_SUCCESS_REDIRECT_URL") ?? undefined;
  const failureRedirect = Deno.env.get("PAYMENT_FAILURE_REDIRECT_URL") ?? undefined;
  const invoiceRequest: Record<string, unknown> = {
    external_id: intent.id,
    amount: xenditAmountFromCentavos(booking.agreed_centavos),
    currency: booking.currency || "PHP",
    description: `Dizkarte booking ${booking.id}`,
    ...(successRedirect ? { success_redirect_url: successRedirect } : {}),
    ...(failureRedirect ? { failure_redirect_url: failureRedirect } : {}),
  };

  let invoice: { id?: string; invoice_url?: string; status?: string } | null = null;
  try {
    const res = await fetch(`${XENDIT_API_BASE}/v2/invoices`, {
      method: "POST",
      headers: {
        Authorization: xenditAuthHeader(apiKey!),
        "content-type": "application/json",
      },
      body: JSON.stringify(invoiceRequest),
    });
    if (!res.ok) {
      return json(502, {
        success: false,
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: "Could not start checkout with the provider.",
        },
      });
    }
    invoice = (await res.json()) as { id?: string; invoice_url?: string; status?: string };
  } catch {
    return json(502, {
      success: false,
      error: { code: "PROVIDER_UNAVAILABLE", message: "Checkout request failed." },
    });
  }

  if (!invoice?.id || !invoice.invoice_url) {
    return json(502, {
      success: false,
      error: { code: "PROVIDER_UNAVAILABLE", message: "Provider did not return a checkout URL." },
    });
  }

  // Persist the provider reference so the authoritative webhook can match it.
  const { error: updateError } = await admin
    .from("payment_intents")
    .update({
      provider,
      provider_reference: invoice.id,
      status: "PENDING",
      updated_at: new Date().toISOString(),
    })
    .eq("id", intent.id);
  if (updateError) {
    return json(500, {
      success: false,
      error: { code: "INTERNAL", message: "Could not record the checkout session." },
    });
  }

  return json(200, {
    success: true,
    data: {
      bookingId: booking.id,
      paymentIntentId: intent.id,
      providerReference: invoice.id,
      checkoutUrl: invoice.invoice_url,
      amountCentavos: booking.agreed_centavos,
      synthetic: false,
      mode: paymentMode,
    },
  });
});

// Supabase Edge Function: health
// Returns only readiness booleans. Never leaks configuration values or secrets.
//
// Deno runtime (Supabase Edge Functions). Not part of the npm workspace build.

Deno.serve((_req: Request) => {
  const env = Deno.env.get("DIZKARTE_ENV") ?? "development";
  const hasSupabaseUrl = Boolean(Deno.env.get("SUPABASE_URL"));
  const hasServiceRole = Boolean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const paymentMode = Deno.env.get("PAYMENT_MODE") ?? "synthetic";

  // In production, synthetic payment mode is not ready.
  const paymentReady = env === "production" ? paymentMode === "live" : true;

  const body = {
    ok: hasSupabaseUrl && hasServiceRole && paymentReady,
    checks: {
      supabaseConfigured: hasSupabaseUrl,
      serviceRolePresent: hasServiceRole,
      paymentReady,
    },
    environment: env,
    time: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    status: body.ok ? 200 : 503,
    headers: { "content-type": "application/json" },
  });
});

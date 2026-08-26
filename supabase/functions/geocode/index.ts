// Supabase Edge Function: geocode
//
// Server-side Google Maps geocoding proxy. Keeps the Google Maps API key OFF
// the client entirely — the key lives only as the `GOOGLE_MAPS_SERVER_KEY`
// secret and is never bundled into the mobile app or exposed to the browser.
//
//   * Requires an authenticated user. The caller's JWT is forwarded from the
//     app; a plain anon key (no signed-in user) is rejected, so the public
//     anon key alone cannot be used to run up geocoding quota.
//   * Three operations: forward `geocode` (address -> lat/lng), ranked
//     `search`, and `reverse` (lat/lng -> formatted address).
//   * Never leaks the key or Google's raw error text. On a provider denial it
//     returns a generic upstream error with the Google status code only.
//   * Degrades gracefully: when the server key is absent it returns
//     `data: null` so the app falls back rather than crashing.
//
// Deno runtime (Supabase Edge Functions). Not part of the npm workspace build.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const GOOGLE_GEOCODE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

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

type GeocodeBody = {
  op?: unknown;
  query?: unknown;
  lat?: unknown;
  lng?: unknown;
};

type GoogleGeocodeResponse = {
  status: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
  }>;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "POST only." },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const mapKey = Deno.env.get("GOOGLE_MAPS_SERVER_KEY");

  if (!supabaseUrl || !anonKey) {
    return json(503, {
      success: false,
      error: { code: "CONFIGURATION_ERROR", message: "Server is not configured." },
    });
  }

  // Require a genuine signed-in user (not just the public anon key).
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

  // Map not configured: behave like "no result" so the app degrades gracefully.
  if (!mapKey) {
    return json(200, { success: true, data: null, meta: { configured: false } });
  }

  let payload: GeocodeBody;
  try {
    payload = JSON.parse(await req.text()) as GeocodeBody;
  } catch {
    return json(400, {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Malformed request body." },
    });
  }

  const op = payload.op;
  let requestUrl: string;

  if (op === "geocode") {
    const query = typeof payload.query === "string" ? payload.query.trim() : "";
    if (query.length === 0 || query.length > 300) {
      return json(400, {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "A valid address query is required." },
      });
    }
    requestUrl = `${GOOGLE_GEOCODE_ENDPOINT}?address=${encodeURIComponent(
      query,
    )}&key=${encodeURIComponent(mapKey)}`;
  } else if (op === "search") {
    const query = typeof payload.query === "string" ? payload.query.trim() : "";
    if (query.length === 0 || query.length > 300) {
      return json(400, {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "A valid search query is required." },
      });
    }
    requestUrl = `${GOOGLE_GEOCODE_ENDPOINT}?address=${encodeURIComponent(
      query,
    )}&key=${encodeURIComponent(mapKey)}`;
  } else if (op === "reverse") {
    const lat = Number(payload.lat);
    const lng = Number(payload.lng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return json(400, {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Valid lat/lng are required." },
      });
    }
    requestUrl = `${GOOGLE_GEOCODE_ENDPOINT}?latlng=${lat},${lng}&key=${encodeURIComponent(
      mapKey,
    )}`;
  } else {
    return json(400, {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Unknown operation." },
    });
  }

  try {
    const res = await fetch(requestUrl);
    if (!res.ok) {
      return json(502, {
        success: false,
        error: { code: "UPSTREAM_ERROR", message: "Geocoding provider is unavailable." },
      });
    }
    const g = (await res.json()) as GoogleGeocodeResponse;

    if (g.status === "OK" && Array.isArray(g.results) && g.results.length > 0) {
      if (op === "geocode") {
        const loc = g.results[0]?.geometry?.location;
        if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
          return json(200, { success: true, data: { lat: loc.lat, lng: loc.lng } });
        }
      } else if (op === "search") {
        const suggestions = g.results
          .slice(0, 6)
          .map((r) => {
            const loc = r.geometry?.location;
            const description = r.formatted_address;
            if (
              typeof description === "string" &&
              description.length > 0 &&
              loc &&
              Number.isFinite(loc.lat) &&
              Number.isFinite(loc.lng)
            ) {
              return { description, lat: loc.lat, lng: loc.lng };
            }
            return null;
          })
          .filter((s): s is { description: string; lat: number; lng: number } => s !== null);
        return json(200, { success: true, data: suggestions });
      } else {
        const address = g.results[0]?.formatted_address;
        if (typeof address === "string" && address.length > 0) {
          return json(200, { success: true, data: { address } });
        }
      }
      return json(200, { success: true, data: null });
    }
    if (g.status === "ZERO_RESULTS") {
      return json(200, { success: true, data: op === "search" ? [] : null });
    }
    // REQUEST_DENIED / OVER_QUERY_LIMIT / INVALID_REQUEST — never leak the key
    // or the raw Google message; return only the status code for diagnosis.
    return json(502, {
      success: false,
      error: { code: "UPSTREAM_ERROR", message: `Geocoding failed (${g.status}).` },
    });
  } catch {
    return json(502, {
      success: false,
      error: { code: "UPSTREAM_ERROR", message: "Geocoding request failed." },
    });
  }
});

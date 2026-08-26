import type { MapProvider, PlaceSuggestion } from "@dizkarte/domain";
import type { AdapterMode } from "@dizkarte/config";
import { LOCATION } from "@dizkarte/config";
import type { SupabaseClient } from "@supabase/supabase-js";

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Lazily resolve the mobile Supabase client.
 *
 * Reaching `../../lib/supabase` at module scope would pull in the React Native
 * client (and therefore `react-native` itself) for every consumer of the map
 * factory, including the pure-logic test environment which has no RN transform.
 * Loading it only when a geocoding call is actually made keeps construction and
 * the synthetic/legacy paths free of native dependencies — the same lazy-load
 * strategy the marketplace factory uses.
 */
function loadSupabaseClient(): SupabaseClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate lazy load; see above
  const module = require("../../lib/supabase") as {
    getSupabaseClient: () => SupabaseClient;
  };
  return module.getSupabaseClient();
}

type GeocodeEnvelope<T> = { success?: boolean; data?: T | null } | null;

/**
 * Server-proxied Google Maps provider.
 *
 * Geocoding runs through the `geocode` Supabase Edge Function, so the Google
 * Maps API key stays a server secret and is never bundled into the app. The
 * caller's Supabase session is forwarded automatically by `functions.invoke`,
 * and the function rejects unauthenticated callers. All calls fail soft
 * (return `null`) so a provider hiccup degrades gracefully rather than throwing.
 *
 * `approximate` and `distanceKm` are pure math and stay on-device — no network.
 */
export class EdgeGeocodingMapProvider implements MapProvider {
  public readonly mode: AdapterMode = "live";

  async geocode(query: string): Promise<{ lat: number; lng: number } | null> {
    if (!query.trim()) return null;
    try {
      const { data, error } = await loadSupabaseClient().functions.invoke("geocode", {
        body: { op: "geocode", query: query.trim() },
      });
      if (error) return null;
      const location = (data as GeocodeEnvelope<{ lat: number; lng: number }>)?.data;
      if (location && Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
        return { lat: location.lat, lng: location.lng };
      }
      return null;
    } catch {
      return null;
    }
  }

  async reverseGeocode(lat: number, lng: number): Promise<{ address: string } | null> {
    try {
      const { data, error } = await loadSupabaseClient().functions.invoke("geocode", {
        body: { op: "reverse", lat, lng },
      });
      if (error) return null;
      const result = (data as GeocodeEnvelope<{ address: string }>)?.data;
      if (result && typeof result.address === "string" && result.address.length > 0) {
        return { address: result.address };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Free-text place search through the `search` op of the geocode Edge Function,
   * which returns several ranked matches. If that op is unavailable (e.g. an
   * older deployment) or returns nothing, fall back to a single forward-geocode
   * so the search box still surfaces at least one result.
   */
  async searchPlaces(query: string): Promise<ReadonlyArray<PlaceSuggestion>> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    try {
      const { data, error } = await loadSupabaseClient().functions.invoke("geocode", {
        body: { op: "search", query: trimmed },
      });
      if (!error) {
        const list = (data as GeocodeEnvelope<PlaceSuggestion[]>)?.data;
        if (Array.isArray(list) && list.length > 0) {
          return list.filter(
            (s) =>
              s &&
              typeof s.description === "string" &&
              Number.isFinite(s.lat) &&
              Number.isFinite(s.lng),
          );
        }
      }
    } catch {
      // fall through to the single-result fallback below
    }

    const coords = await this.geocode(trimmed);
    if (!coords) return [];
    const rev = await this.reverseGeocode(coords.lat, coords.lng);
    return [{ description: rev?.address ?? trimmed, lat: coords.lat, lng: coords.lng }];
  }

  approximate(lat: number, lng: number): { lat: number; lng: number } {
    const factor = 10 ** LOCATION.approximateDecimalPlaces;
    return {
      lat: Math.round(lat * factor) / factor,
      lng: Math.round(lng * factor) / factor,
    };
  }

  distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 100) / 100;
  }
}

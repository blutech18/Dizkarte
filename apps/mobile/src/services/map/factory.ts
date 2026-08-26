import type { MapProvider } from "@dizkarte/domain";
import { SyntheticMapProvider } from "@dizkarte/domain";
import { getAppConfig } from "../../lib/config";
import { GoogleMapProvider } from "./google-map-provider";
import { EdgeGeocodingMapProvider } from "./edge-geocoding-provider";

let cachedProvider: MapProvider | null = null;
let cachedUnavailable = false;

/**
 * Single construction point for the mobile map provider.
 *
 * Selection order:
 *  1. `MAP_MODE=live` -> `EdgeGeocodingMapProvider`, the secure default:
 *     geocoding is proxied through the `geocode` Edge Function so the Google
 *     key stays server-side and is never bundled into the app.
 *  2. A configured public `MAP_PUBLIC_KEY` -> legacy `GoogleMapProvider`
 *     (direct-to-Google). Retained for flexibility but discouraged because the
 *     key is publicly visible in the app bundle.
 *  3. Otherwise `SyntheticMapProvider` in development/test, or fail closed
 *     (`null`) in production so UI renders a "map unavailable" state.
 */
export function getMapProvider(): MapProvider | null {
  if (cachedProvider) return cachedProvider;
  if (cachedUnavailable) return null;

  const config = getAppConfig();

  if (config.adapterModes.map === "live") {
    cachedProvider = new EdgeGeocodingMapProvider();
    return cachedProvider;
  }

  const apiKey = config.mapPublicKey;
  if (apiKey && apiKey.trim().length > 0) {
    cachedProvider = new GoogleMapProvider(apiKey);
    return cachedProvider;
  }

  if (config.environment !== "development" && config.environment !== "test") {
    cachedUnavailable = true;
    return null;
  }

  cachedProvider = new SyntheticMapProvider(config.environment);
  return cachedProvider;
}

/** Test-only reset hook. */
export function __resetMapProviderForTests(): void {
  cachedProvider = null;
  cachedUnavailable = false;
}

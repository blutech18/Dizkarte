import type { MapProvider } from "@dizkarte/domain";
import { SyntheticMapProvider } from "@dizkarte/domain";
import { getAppConfig } from "../../lib/config";

let cachedProvider: MapProvider | null = null;
let cachedUnavailable = false;

/**
 * Single construction point for the mobile map provider.
 *
 * Mirrors `marketplace/factory.ts`: the synthetic map provider can only be
 * constructed in `development`/`test`. Outside those environments this
 * module never falls back to synthetic data — if no real map provider is
 * wired (task 9.2, pending an approved provider/credential), `getMapProvider`
 * returns `null` and callers must render a map-unavailable state, never a
 * silent synthetic fallback in production.
 */
export function getMapProvider(): MapProvider | null {
  if (cachedProvider) return cachedProvider;
  if (cachedUnavailable) return null;
  const { environment } = getAppConfig();
  if (environment !== "development" && environment !== "test") {
    // No real map provider adapter exists yet in this pass (task 9.2).
    // Fail closed rather than throw, so the screen can render a clear
    // "map unavailable" state instead of crashing the app.
    cachedUnavailable = true;
    return null;
  }
  cachedProvider = new SyntheticMapProvider(environment);
  return cachedProvider;
}

/** Test-only reset hook. */
export function __resetMapProviderForTests(): void {
  cachedProvider = null;
  cachedUnavailable = false;
}

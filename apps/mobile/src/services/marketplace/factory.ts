import { getAppConfig } from "../../lib/config";
import type { MobileMarketplacePort } from "./port";
import { SyntheticMarketplaceRepository } from "./synthetic-repository";

let cachedRepository: MobileMarketplacePort | null = null;

/**
 * The Supabase adapter is loaded lazily.
 *
 * Reaching it at module scope would pull in the React Native Supabase client
 * (and therefore `react-native` itself) for every consumer of this factory,
 * including the pure-logic test environment which has no RN transform. Loading
 * it only on the branch that actually uses it keeps the synthetic path free of
 * native dependencies.
 */
function loadSupabaseRepository(): MobileMarketplacePort {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate lazy load; see above
  const module = require("./supabase-repository") as {
    createSupabaseMarketplaceRepository: () => MobileMarketplacePort;
  };
  return module.createSupabaseMarketplaceRepository();
}

/**
 * True only when the deterministic in-memory adapter has been explicitly opted
 * into for offline development. It is never a silent fallback: without this flag
 * the app reads and writes the real Supabase project, so what a screen shows is
 * what is actually in the database.
 */
function syntheticOptIn(): boolean {
  return process.env["EXPO_PUBLIC_MARKETPLACE_ADAPTER"] === "synthetic";
}

/**
 * Single construction point for the mobile marketplace repository.
 *
 * The default in every environment is the real Supabase-backed adapter, which
 * uses the signed-in user's own JWT (publishable anon key only) so RLS is always
 * the row gate, and routes every state transition through the privileged
 * SECURITY DEFINER RPCs.
 *
 * The synthetic adapter is returned only when
 * `EXPO_PUBLIC_MARKETPLACE_ADAPTER=synthetic` is set AND the resolved
 * environment is development/test — mirroring `assertSyntheticAllowed` from
 * `@dizkarte/domain`, so staging and production can never be served fabricated
 * marketplace data even by misconfiguration.
 */
export function createMarketplaceRepository(): MobileMarketplacePort {
  if (cachedRepository) return cachedRepository;
  const { environment } = getAppConfig();

  if (syntheticOptIn()) {
    if (environment !== "development" && environment !== "test") {
      throw new Error(
        `Synthetic marketplace repository cannot run outside development/test (environment: ${environment}). ` +
          "Unset EXPO_PUBLIC_MARKETPLACE_ADAPTER to use the real backend-backed adapter.",
      );
    }
    cachedRepository = new SyntheticMarketplaceRepository();
    return cachedRepository;
  }

  cachedRepository = loadSupabaseRepository();
  return cachedRepository;
}

/** Test-only reset hook so each test file gets a fresh dataset/adapter. */
export function __resetMarketplaceRepositoryForTests(): void {
  cachedRepository = null;
}

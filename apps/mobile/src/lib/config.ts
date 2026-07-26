import { parsePublicConfig, type PublicConfig, type EnvSource } from "@dizkarte/config";

/**
 * Expo inlines `EXPO_PUBLIC_*` variables into the JS bundle at build time via
 * `process.env`. This module maps that convention onto the shared
 * `@dizkarte/config` schema, which expects the bare (non-prefixed) key names.
 *
 * Mobile only ever has access to public/publishable configuration — service
 * role keys and provider secrets are never read here and never bundled.
 */
/** First non-empty, trimmed value, or undefined. Treats "" as absent. */
function firstNonEmpty(...values: ReadonlyArray<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

// Safe, clearly non-real development placeholders. In development/test the app
// runs the synthetic repository and never contacts Supabase, so it must be able
// to boot even when EXPO_PUBLIC_SUPABASE_* are absent (e.g. a stale Metro
// transform cache that inlined empty strings). These are never used to reach a
// real backend and are NOT applied in staging/production, which still fail
// closed when real credentials are missing.
const DEV_PLACEHOLDER_SUPABASE_URL = "https://synthetic.dev.dizkarte.invalid";
const DEV_PLACEHOLDER_SUPABASE_ANON_KEY = "synthetic-development-anon-key";

function readExpoPublicEnv(): EnvSource {
  const environment =
    firstNonEmpty(process.env.EXPO_PUBLIC_DIZKARTE_ENV, process.env.DIZKARTE_ENV) ?? "development";
  const isProdLike = environment === "production" || environment === "staging";

  return {
    DIZKARTE_ENV: environment,
    SUPABASE_URL:
      firstNonEmpty(process.env.EXPO_PUBLIC_SUPABASE_URL) ??
      (isProdLike ? undefined : DEV_PLACEHOLDER_SUPABASE_URL),
    SUPABASE_ANON_KEY:
      firstNonEmpty(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ??
      (isProdLike ? undefined : DEV_PLACEHOLDER_SUPABASE_ANON_KEY),
    MAP_PUBLIC_KEY: process.env.EXPO_PUBLIC_MAP_PUBLIC_KEY,
    PAYMENT_MODE: process.env.EXPO_PUBLIC_PAYMENT_MODE,
    MAP_MODE: process.env.EXPO_PUBLIC_MAP_MODE,
    PUSH_MODE: process.env.EXPO_PUBLIC_PUSH_MODE,
    MEDIA_MODE: process.env.EXPO_PUBLIC_MEDIA_MODE,
    MONITORING_MODE: process.env.EXPO_PUBLIC_MONITORING_MODE,
  };
}

let cached: PublicConfig | null = null;

/**
 * Parse and cache the mobile public configuration. Throws `ConfigurationError`
 * (fail-closed) in staging/production when a synthetic adapter is selected or
 * required public configuration is missing — the app-level error boundary
 * renders a configuration-blocked screen rather than silently degrading.
 */
export function getAppConfig(): PublicConfig {
  cached ??= parsePublicConfig(readExpoPublicEnv());
  return cached;
}

/** Test-only reset hook. */
export function __resetAppConfigForTests(): void {
  cached = null;
}

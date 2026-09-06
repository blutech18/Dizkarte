import "server-only";
import {
  parsePublicConfig,
  parseServerConfig,
  type PublicConfig,
  type ServerConfig,
} from "@dizkarte/config";

/**
 * Server-side configuration loader for the Admin app.
 *
 * `parseServerConfig` fails closed (throws `ConfigurationError`) in
 * staging/production when required credentials are missing or a synthetic
 * adapter is selected. Callers that render UI must catch this and show a
 * configuration-error state rather than crash the whole request in a way that
 * leaks internals.
 */
function firstNonEmpty(...values: ReadonlyArray<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function readAdminPublicEnv(): Record<string, string | undefined> {
  return {
    DIZKARTE_ENV: firstNonEmpty(process.env["NEXT_PUBLIC_DIZKARTE_ENV"], process.env["DIZKARTE_ENV"]),
    SUPABASE_URL: firstNonEmpty(process.env["NEXT_PUBLIC_SUPABASE_URL"], process.env["SUPABASE_URL"]),
    SUPABASE_ANON_KEY: firstNonEmpty(process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"], process.env["SUPABASE_ANON_KEY"]),
    MAP_PUBLIC_KEY: firstNonEmpty(process.env["NEXT_PUBLIC_MAP_PUBLIC_KEY"], process.env["MAP_PUBLIC_KEY"]),
    PAYMENT_MODE: firstNonEmpty(process.env["NEXT_PUBLIC_PAYMENT_MODE"], process.env["PAYMENT_MODE"]),
    MAP_MODE: firstNonEmpty(process.env["NEXT_PUBLIC_MAP_MODE"], process.env["MAP_MODE"]),
    PUSH_MODE: firstNonEmpty(process.env["NEXT_PUBLIC_PUSH_MODE"], process.env["PUSH_MODE"]),
    MEDIA_MODE: firstNonEmpty(process.env["NEXT_PUBLIC_MEDIA_MODE"], process.env["MEDIA_MODE"]),
    MONITORING_MODE: firstNonEmpty(process.env["NEXT_PUBLIC_MONITORING_MODE"], process.env["MONITORING_MODE"]),
  };
}

function readAdminServerEnv(): Record<string, string | undefined> {
  return {
    ...readAdminPublicEnv(),
    SUPABASE_SERVICE_ROLE_KEY: firstNonEmpty(
      process.env["SUPABASE_SERVICE_ROLE_KEY"],
      process.env["SUPABASE_SERVICE_ROLE"],
    ),
    PAYMENT_PROVIDER: firstNonEmpty(process.env["PAYMENT_PROVIDER"]),
    PAYMENT_API_KEY: firstNonEmpty(process.env["PAYMENT_API_KEY"]),
    PAYMENT_WEBHOOK_SECRET: firstNonEmpty(process.env["PAYMENT_WEBHOOK_SECRET"]),
    PUSH_CREDENTIALS: firstNonEmpty(process.env["PUSH_CREDENTIALS"]),
    MONITORING_DSN: firstNonEmpty(process.env["MONITORING_DSN"]),
  };
}

export function loadServerConfig(): ServerConfig {
  return parseServerConfig(readAdminServerEnv());
}

export function loadPublicConfig(): PublicConfig {
  return parsePublicConfig(readAdminPublicEnv());
}

/**
 * True only when the app is intentionally running with the deterministic
 * development Admin session/data adapter. This can never be true in
 * staging/production because `parseServerConfig` would already have thrown
 * for a synthetic mode in those environments.
 */
export function isDevAdapterActive(config: ServerConfig): boolean {
  return config.environment === "development" || config.environment === "test";
}

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
export function loadServerConfig(): ServerConfig {
  return parseServerConfig(process.env);
}

function readAdminPublicEnv(): Record<string, string | undefined> {
  return {
    DIZKARTE_ENV: process.env["NEXT_PUBLIC_DIZKARTE_ENV"] ?? process.env["DIZKARTE_ENV"],
    SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? process.env["SUPABASE_URL"],
    SUPABASE_ANON_KEY: process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_ANON_KEY"],
    MAP_PUBLIC_KEY: process.env["NEXT_PUBLIC_MAP_PUBLIC_KEY"] ?? process.env["MAP_PUBLIC_KEY"],
    PAYMENT_MODE: process.env["NEXT_PUBLIC_PAYMENT_MODE"] ?? process.env["PAYMENT_MODE"],
    MAP_MODE: process.env["NEXT_PUBLIC_MAP_MODE"] ?? process.env["MAP_MODE"],
    PUSH_MODE: process.env["NEXT_PUBLIC_PUSH_MODE"] ?? process.env["PUSH_MODE"],
    MEDIA_MODE: process.env["NEXT_PUBLIC_MEDIA_MODE"] ?? process.env["MEDIA_MODE"],
    MONITORING_MODE: process.env["NEXT_PUBLIC_MONITORING_MODE"] ?? process.env["MONITORING_MODE"],
  };
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

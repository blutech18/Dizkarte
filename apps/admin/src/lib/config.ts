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

export function loadPublicConfig(): PublicConfig {
  return parsePublicConfig(process.env);
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

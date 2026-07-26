/**
 * Environment and adapter-mode types shared across the platform.
 */

export const APP_ENVIRONMENTS = ["development", "test", "staging", "production"] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

/**
 * Adapter execution modes.
 * - `synthetic`: deterministic in-process fake. Development/test only.
 * - `sandbox`: real provider sandbox/test environment (staging/UAT).
 * - `live`: real production provider. Requires full credentials.
 */
export const ADAPTER_MODES = ["synthetic", "sandbox", "live"] as const;
export type AdapterMode = (typeof ADAPTER_MODES)[number];

export const ADAPTER_KINDS = ["payment", "map", "push", "media", "monitoring"] as const;
export type AdapterKind = (typeof ADAPTER_KINDS)[number];

export type AdapterModeConfig = Record<AdapterKind, AdapterMode>;

/** Non-secret configuration safe to embed in client/mobile bundles. */
export type PublicConfig = {
  readonly environment: AppEnvironment;
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly mapPublicKey: string | null;
  readonly adapterModes: AdapterModeConfig;
  /** True when any adapter runs in synthetic mode; surfaced in the UI. */
  readonly syntheticModeActive: boolean;
};

/** Server-only configuration. MUST NOT be exposed to client bundles. */
export type ServerConfig = {
  readonly environment: AppEnvironment;
  readonly supabaseUrl: string;
  readonly supabaseServiceRoleKey: string | null;
  readonly paymentProvider: string | null;
  readonly paymentApiKey: string | null;
  readonly paymentWebhookSecret: string | null;
  readonly pushCredentials: string | null;
  readonly monitoringDsn: string | null;
  readonly adapterModes: AdapterModeConfig;
};

export type ConfigViolation = {
  readonly code:
    | "SYNTHETIC_IN_PRODUCTION"
    | "MISSING_REQUIRED_CREDENTIAL"
    | "SERVICE_ROLE_IN_PUBLIC"
    | "INVALID_ENVIRONMENT"
    | "UNAPPROVED_LIVE_MODE";
  readonly message: string;
  readonly field?: string;
};

export class ConfigurationError extends Error {
  public readonly violations: ReadonlyArray<ConfigViolation>;

  constructor(violations: ReadonlyArray<ConfigViolation>) {
    const summary = violations.map((v) => `[${v.code}] ${v.message}`).join("; ");
    super(`Configuration rejected (fail-closed): ${summary}`);
    this.name = "ConfigurationError";
    this.violations = violations;
  }
}

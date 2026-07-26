import { type z } from "zod";
import { collectViolations, shouldFailClosed } from "./guard.js";
import { publicEnvSchema, SECRET_ENV_KEYS, serverEnvSchema } from "./schema.js";
import {
  ConfigurationError,
  type AdapterModeConfig,
  type ConfigViolation,
  type PublicConfig,
  type ServerConfig,
} from "./types.js";

export type EnvSource = Record<string, string | undefined>;

function toAdapterModes(raw: {
  PAYMENT_MODE: AdapterModeConfig["payment"];
  MAP_MODE: AdapterModeConfig["map"];
  PUSH_MODE: AdapterModeConfig["push"];
  MEDIA_MODE: AdapterModeConfig["media"];
  MONITORING_MODE: AdapterModeConfig["monitoring"];
}): AdapterModeConfig {
  return {
    payment: raw.PAYMENT_MODE,
    map: raw.MAP_MODE,
    push: raw.PUSH_MODE,
    media: raw.MEDIA_MODE,
    monitoring: raw.MONITORING_MODE,
  };
}

function formatZodError(error: z.ZodError): ConfigViolation[] {
  return error.issues.map((issue) => {
    const field = issue.path.join(".");
    return field.length > 0
      ? { code: "INVALID_ENVIRONMENT" as const, field, message: issue.message }
      : { code: "INVALID_ENVIRONMENT" as const, message: issue.message };
  });
}

/**
 * Parse public (client-safe) configuration.
 *
 * Rejects unconditionally if a known secret key is present in the source, since
 * public bundles must never carry service-role or provider secrets.
 */
export function parsePublicConfig(source: EnvSource): PublicConfig {
  // Guard: secret leakage into a public context is always fatal.
  const leaked = SECRET_ENV_KEYS.filter((key) => {
    const value = source[key];
    return typeof value === "string" && value.trim().length > 0;
  });
  if (leaked.length > 0) {
    throw new ConfigurationError(
      leaked.map((key) => ({
        code: "SERVICE_ROLE_IN_PUBLIC" as const,
        field: key,
        message: `Secret "${key}" must never be present in public/client configuration.`,
      })),
    );
  }

  const parsed = publicEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigurationError(formatZodError(parsed.error));
  }
  const raw = parsed.data;
  const adapterModes = toAdapterModes(raw);

  const violations = collectViolations({
    environment: raw.DIZKARTE_ENV,
    adapterModes,
    credentials: {
      // Public config cannot vouch for server secrets; treat as absent so the
      // server guard remains the authority for privileged credentials.
      paymentProvider: false,
      paymentApiKey: false,
      paymentWebhookSecret: false,
      pushCredentials: false,
      monitoringDsn: raw.MONITORING_MODE === "synthetic",
      mapPublicKey: raw.MAP_PUBLIC_KEY !== null,
      supabaseServiceRoleKey: false,
    },
  });

  // For public config, only synthetic-in-production and map key issues are
  // meaningful; server-secret violations are evaluated by parseServerConfig.
  const relevant = violations.filter(
    (v) => v.code === "SYNTHETIC_IN_PRODUCTION" || v.field === "mapPublicKey",
  );
  if (shouldFailClosed(raw.DIZKARTE_ENV, relevant)) {
    throw new ConfigurationError(relevant);
  }

  const syntheticModeActive = Object.values(adapterModes).some((mode) => mode === "synthetic");

  return {
    environment: raw.DIZKARTE_ENV,
    supabaseUrl: raw.SUPABASE_URL,
    supabaseAnonKey: raw.SUPABASE_ANON_KEY,
    mapPublicKey: raw.MAP_PUBLIC_KEY,
    adapterModes,
    syntheticModeActive,
  };
}

/**
 * Parse server-only configuration and enforce the fail-closed guard.
 */
export function parseServerConfig(source: EnvSource): ServerConfig {
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigurationError(formatZodError(parsed.error));
  }
  const raw = parsed.data;
  const adapterModes = toAdapterModes(raw);

  const violations = collectViolations({
    environment: raw.DIZKARTE_ENV,
    adapterModes,
    credentials: {
      paymentProvider: raw.PAYMENT_PROVIDER !== null,
      paymentApiKey: raw.PAYMENT_API_KEY !== null,
      paymentWebhookSecret: raw.PAYMENT_WEBHOOK_SECRET !== null,
      pushCredentials: raw.PUSH_CREDENTIALS !== null,
      monitoringDsn: raw.MONITORING_DSN !== null,
      mapPublicKey: raw.MAP_PUBLIC_KEY !== null,
      supabaseServiceRoleKey: raw.SUPABASE_SERVICE_ROLE_KEY !== null,
    },
  });

  if (shouldFailClosed(raw.DIZKARTE_ENV, violations)) {
    throw new ConfigurationError(violations);
  }

  return {
    environment: raw.DIZKARTE_ENV,
    supabaseUrl: raw.SUPABASE_URL,
    supabaseServiceRoleKey: raw.SUPABASE_SERVICE_ROLE_KEY,
    paymentProvider: raw.PAYMENT_PROVIDER,
    paymentApiKey: raw.PAYMENT_API_KEY,
    paymentWebhookSecret: raw.PAYMENT_WEBHOOK_SECRET,
    pushCredentials: raw.PUSH_CREDENTIALS,
    monitoringDsn: raw.MONITORING_DSN,
    adapterModes,
  };
}

/** Non-throwing evaluation used by health/readiness checks. */
export function evaluateServerConfig(source: EnvSource): {
  ok: boolean;
  violations: ConfigViolation[];
} {
  try {
    parseServerConfig(source);
    return { ok: true, violations: [] };
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return { ok: false, violations: [...error.violations] };
    }
    throw error;
  }
}

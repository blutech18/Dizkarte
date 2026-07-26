import {
  type AdapterKind,
  type AdapterMode,
  type AdapterModeConfig,
  type AppEnvironment,
  type ConfigViolation,
} from "./types.js";

/** Environments that must fail closed: synthetic modes and missing creds reject. */
export const FAIL_CLOSED_ENVIRONMENTS: ReadonlySet<AppEnvironment> = new Set<AppEnvironment>([
  "staging",
  "production",
]);

/** Credentials required before a given adapter may run in `live` mode. */
type CredentialPresence = {
  paymentProvider: boolean;
  paymentApiKey: boolean;
  paymentWebhookSecret: boolean;
  pushCredentials: boolean;
  monitoringDsn: boolean;
  mapPublicKey: boolean;
  supabaseServiceRoleKey: boolean;
};

/**
 * Collect configuration violations. This is pure and side-effect free so it can
 * be unit tested for every environment/mode combination.
 */
export function collectViolations(input: {
  environment: AppEnvironment;
  adapterModes: AdapterModeConfig;
  credentials: CredentialPresence;
}): ConfigViolation[] {
  const { environment, adapterModes, credentials } = input;
  const violations: ConfigViolation[] = [];
  const failClosed = FAIL_CLOSED_ENVIRONMENTS.has(environment);

  // 1. Synthetic adapters can never run in a fail-closed environment.
  for (const kind of Object.keys(adapterModes) as AdapterKind[]) {
    const mode = adapterModes[kind];
    if (failClosed && mode === "synthetic") {
      violations.push({
        code: "SYNTHETIC_IN_PRODUCTION",
        field: `${kind}Mode`,
        message: `Adapter "${kind}" is synthetic but environment "${environment}" forbids synthetic adapters.`,
      });
    }
  }

  // 2. Live/sandbox adapters require their credentials regardless of environment.
  requireForNonSynthetic(violations, adapterModes.payment, "payment", [
    ["paymentProvider", credentials.paymentProvider, "PAYMENT_PROVIDER"],
    ["paymentApiKey", credentials.paymentApiKey, "PAYMENT_API_KEY"],
    ["paymentWebhookSecret", credentials.paymentWebhookSecret, "PAYMENT_WEBHOOK_SECRET"],
  ]);
  requireForNonSynthetic(violations, adapterModes.push, "push", [
    ["pushCredentials", credentials.pushCredentials, "PUSH_CREDENTIALS"],
  ]);
  requireForNonSynthetic(violations, adapterModes.map, "map", [
    ["mapPublicKey", credentials.mapPublicKey, "MAP_PUBLIC_KEY"],
  ]);
  requireForNonSynthetic(violations, adapterModes.monitoring, "monitoring", [
    ["monitoringDsn", credentials.monitoringDsn, "MONITORING_DSN"],
  ]);

  // 3. Fail-closed environments need a server Supabase service-role key present
  //    (in the server context) to run privileged commands.
  if (failClosed && !credentials.supabaseServiceRoleKey) {
    violations.push({
      code: "MISSING_REQUIRED_CREDENTIAL",
      field: "SUPABASE_SERVICE_ROLE_KEY",
      message: `Environment "${environment}" requires SUPABASE_SERVICE_ROLE_KEY for privileged server operations.`,
    });
  }

  return violations;
}

function requireForNonSynthetic(
  violations: ConfigViolation[],
  mode: AdapterMode,
  kind: AdapterKind,
  required: ReadonlyArray<[string, boolean, string]>,
): void {
  if (mode === "synthetic") return;
  for (const [field, present, envKey] of required) {
    if (!present) {
      violations.push({
        code: "MISSING_REQUIRED_CREDENTIAL",
        field,
        message: `Adapter "${kind}" runs in "${mode}" mode but ${envKey} is missing.`,
      });
    }
  }
}

/**
 * Decide whether the given violations should abort startup. Fail-closed
 * environments reject on any violation; development/test tolerate synthetic
 * modes but still reject genuine credential mistakes for non-synthetic modes.
 */
export function shouldFailClosed(
  environment: AppEnvironment,
  violations: ReadonlyArray<ConfigViolation>,
): boolean {
  if (violations.length === 0) return false;
  if (FAIL_CLOSED_ENVIRONMENTS.has(environment)) return true;
  // Outside fail-closed envs, only missing credentials for explicitly
  // non-synthetic adapters are fatal; synthetic-in-production cannot occur here.
  return violations.some((v) => v.code === "MISSING_REQUIRED_CREDENTIAL");
}

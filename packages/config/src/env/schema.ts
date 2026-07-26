import { z } from "zod";
import { ADAPTER_MODES, APP_ENVIRONMENTS } from "./types.js";

/**
 * Raw environment-variable schemas. Values arrive as strings from the host
 * environment and are validated here before any typed config is derived.
 *
 * These schemas never read `process.env` directly so the package stays safe to
 * import from browser and React Native bundles.
 */

const nonEmpty = z.string().trim().min(1);
const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
).transform((value) => value ?? null);

const adapterMode = z.enum(ADAPTER_MODES);

/**
 * Adapter modes default to `synthetic` so local development is runnable, but
 * the production guard rejects synthetic outside development/test.
 */
const adapterModeWithDefault = adapterMode.default("synthetic");

export const environmentEnum = z.enum(APP_ENVIRONMENTS);

/** Values that are safe to include in a public/client bundle. */
export const publicEnvSchema = z.object({
  DIZKARTE_ENV: environmentEnum.default("development"),
  SUPABASE_URL: nonEmpty.url(),
  SUPABASE_ANON_KEY: nonEmpty,
  MAP_PUBLIC_KEY: optionalString,
  PAYMENT_MODE: adapterModeWithDefault,
  MAP_MODE: adapterModeWithDefault,
  PUSH_MODE: adapterModeWithDefault,
  MEDIA_MODE: adapterModeWithDefault,
  MONITORING_MODE: adapterModeWithDefault,
});

/** Server-only values. Includes secrets that must never reach a client bundle. */
export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  PAYMENT_PROVIDER: optionalString,
  PAYMENT_API_KEY: optionalString,
  PAYMENT_WEBHOOK_SECRET: optionalString,
  PUSH_CREDENTIALS: optionalString,
  MONITORING_DSN: optionalString,
});

export type RawPublicEnv = z.infer<typeof publicEnvSchema>;
export type RawServerEnv = z.infer<typeof serverEnvSchema>;

/** Keys that are always secret and must never appear in a public config. */
export const SECRET_ENV_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "PAYMENT_API_KEY",
  "PAYMENT_WEBHOOK_SECRET",
  "PUSH_CREDENTIALS",
  "MONITORING_DSN",
] as const;

import { describe, expect, it } from "vitest";
import {
  ConfigurationError,
  collectViolations,
  evaluateServerConfig,
  parsePublicConfig,
  parseServerConfig,
  shouldFailClosed,
  type EnvSource,
} from "../index.js";

const baseSynthetic: EnvSource = {
  DIZKARTE_ENV: "development",
  SUPABASE_URL: "https://synthetic.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-dev",
  PAYMENT_MODE: "synthetic",
  MAP_MODE: "synthetic",
  PUSH_MODE: "synthetic",
  MEDIA_MODE: "synthetic",
  MONITORING_MODE: "synthetic",
};

describe("parsePublicConfig", () => {
  it("parses a valid synthetic development config", () => {
    const config = parsePublicConfig(baseSynthetic);
    expect(config.environment).toBe("development");
    expect(config.syntheticModeActive).toBe(true);
    expect(config.mapPublicKey).toBeNull();
  });

  it("rejects a service-role key leaking into public config", () => {
    expect(() =>
      parsePublicConfig({ ...baseSynthetic, SUPABASE_SERVICE_ROLE_KEY: "service-secret" }),
    ).toThrowError(ConfigurationError);
  });

  it("rejects an invalid supabase url", () => {
    expect(() => parsePublicConfig({ ...baseSynthetic, SUPABASE_URL: "not-a-url" })).toThrowError(
      ConfigurationError,
    );
  });

  it("fails closed when a synthetic adapter is used in production", () => {
    expect(() =>
      parsePublicConfig({
        ...baseSynthetic,
        DIZKARTE_ENV: "production",
        MAP_PUBLIC_KEY: "pk_live_map",
        PAYMENT_MODE: "live",
        MAP_MODE: "live",
        PUSH_MODE: "live",
        MEDIA_MODE: "live",
        MONITORING_MODE: "synthetic",
      }),
    ).toThrowError(/synthetic/i);
  });
});

describe("parseServerConfig", () => {
  it("parses synthetic development server config without secrets", () => {
    const config = parseServerConfig(baseSynthetic);
    expect(config.supabaseServiceRoleKey).toBeNull();
    expect(config.adapterModes.payment).toBe("synthetic");
  });

  it("fails closed in production when synthetic adapters remain", () => {
    expect(() => parseServerConfig({ ...baseSynthetic, DIZKARTE_ENV: "production" })).toThrowError(
      ConfigurationError,
    );
  });

  it("fails when live payment mode is missing credentials outside production", () => {
    expect(() => parseServerConfig({ ...baseSynthetic, PAYMENT_MODE: "live" })).toThrowError(
      /PAYMENT_/,
    );
  });

  it("accepts a fully configured production server config", () => {
    const config = parseServerConfig({
      DIZKARTE_ENV: "production",
      SUPABASE_URL: "https://prod.supabase.co",
      SUPABASE_ANON_KEY: "anon-prod",
      SUPABASE_SERVICE_ROLE_KEY: "service-prod",
      MAP_PUBLIC_KEY: "pk_live_map",
      PAYMENT_PROVIDER: "approved-provider",
      PAYMENT_API_KEY: "sk_live_x",
      PAYMENT_WEBHOOK_SECRET: "whsec_x",
      PUSH_CREDENTIALS: "fcm-json",
      MONITORING_DSN: "https://dsn.example",
      PAYMENT_MODE: "live",
      MAP_MODE: "live",
      PUSH_MODE: "live",
      MEDIA_MODE: "live",
      MONITORING_MODE: "live",
    });
    expect(config.environment).toBe("production");
    expect(config.paymentProvider).toBe("approved-provider");
  });
});

describe("evaluateServerConfig", () => {
  it("returns violations without throwing", () => {
    const result = evaluateServerConfig({ ...baseSynthetic, DIZKARTE_ENV: "production" });
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });
});

describe("collectViolations / shouldFailClosed", () => {
  const allSynthetic = {
    payment: "synthetic",
    map: "synthetic",
    push: "synthetic",
    media: "synthetic",
    monitoring: "synthetic",
  } as const;

  const noCreds = {
    paymentProvider: false,
    paymentApiKey: false,
    paymentWebhookSecret: false,
    pushCredentials: false,
    monitoringDsn: false,
    mapPublicKey: false,
    supabaseServiceRoleKey: false,
  };

  it("reports no violations for full synthetic development", () => {
    const violations = collectViolations({
      environment: "development",
      adapterModes: allSynthetic,
      credentials: noCreds,
    });
    expect(violations).toHaveLength(0);
    expect(shouldFailClosed("development", violations)).toBe(false);
  });

  it("flags every synthetic adapter in production", () => {
    const violations = collectViolations({
      environment: "production",
      adapterModes: allSynthetic,
      credentials: noCreds,
    });
    // 5 synthetic adapters + missing service role key.
    expect(violations.filter((v) => v.code === "SYNTHETIC_IN_PRODUCTION")).toHaveLength(5);
    expect(shouldFailClosed("production", violations)).toBe(true);
  });

  it("treats missing live credentials as fatal even in development", () => {
    const violations = collectViolations({
      environment: "development",
      adapterModes: { ...allSynthetic, payment: "sandbox" },
      credentials: noCreds,
    });
    expect(shouldFailClosed("development", violations)).toBe(true);
  });
});

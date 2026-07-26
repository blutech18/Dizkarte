import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppConfig, __resetAppConfigForTests } from "./config";

/**
 * Regression coverage for the dev-boot resilience fix: in development/test the
 * mobile app runs the synthetic repository and never contacts Supabase, so a
 * missing/empty EXPO_PUBLIC_SUPABASE_* (e.g. a stale Metro transform cache that
 * inlined empty strings) must NOT crash the app with a fail-closed
 * ConfigurationError. Staging/production still fail closed.
 */
describe("mobile getAppConfig dev resilience", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
    __resetAppConfigForTests();
    vi.unstubAllEnvs();
  });

  it("boots with safe placeholders in development when Supabase env is empty", () => {
    vi.stubEnv("EXPO_PUBLIC_DIZKARTE_ENV", "development");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "");
    __resetAppConfigForTests();

    const config = getAppConfig();
    expect(config.environment).toBe("development");
    expect(config.supabaseUrl).toContain("dizkarte.invalid");
    expect(config.supabaseAnonKey.length).toBeGreaterThan(0);
  });

  it("prefers real EXPO_PUBLIC values when they are present", () => {
    vi.stubEnv("EXPO_PUBLIC_DIZKARTE_ENV", "development");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "https://real-project.supabase.co");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "real-anon-key");
    __resetAppConfigForTests();

    const config = getAppConfig();
    expect(config.supabaseUrl).toBe("https://real-project.supabase.co");
    expect(config.supabaseAnonKey).toBe("real-anon-key");
  });

  it("still fails closed in production when Supabase env is missing", () => {
    vi.stubEnv("EXPO_PUBLIC_DIZKARTE_ENV", "production");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "");
    __resetAppConfigForTests();

    expect(() => getAppConfig()).toThrow();
  });
});

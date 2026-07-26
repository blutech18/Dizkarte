import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example-project.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key-placeholder";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example-project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-placeholder";
});

afterEach(() => {
  delete process.env.ADMIN_DATA_ADAPTER;
});

function applyLiveProductionEnv(): void {
  process.env.DIZKARTE_ENV = "production";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-placeholder";
  process.env.PAYMENT_MODE = "live";
  process.env.PAYMENT_PROVIDER = "placeholder";
  process.env.PAYMENT_API_KEY = "placeholder";
  process.env.PAYMENT_WEBHOOK_SECRET = "placeholder";
  process.env.MAP_MODE = "live";
  process.env.MAP_PUBLIC_KEY = "placeholder";
  process.env.PUSH_MODE = "live";
  process.env.PUSH_CREDENTIALS = "placeholder";
  process.env.MONITORING_MODE = "live";
  process.env.MONITORING_DSN = "placeholder";
  process.env.MEDIA_MODE = "live";
}

describe("getAdminRepository", () => {
  it("returns the real Supabase adapter by default in development", async () => {
    process.env.DIZKARTE_ENV = "development";
    const { getAdminRepository } = await import("./index");
    const repo = getAdminRepository();
    // The default is real data, so a development console shows what is actually
    // in the database rather than a fabricated in-memory dataset.
    expect(repo.synthetic).toBe(false);
  });

  it("returns the synthetic adapter only when explicitly opted into in development", async () => {
    process.env.DIZKARTE_ENV = "development";
    process.env.ADMIN_DATA_ADAPTER = "synthetic";
    const { getAdminRepository } = await import("./index");
    expect(getAdminRepository().synthetic).toBe(true);
  });

  it("returns the real Supabase adapter in production", async () => {
    applyLiveProductionEnv();
    const { getAdminRepository } = await import("./index");
    expect(getAdminRepository().synthetic).toBe(false);
  });

  it("refuses the synthetic opt-in outside development/test", async () => {
    applyLiveProductionEnv();
    process.env.ADMIN_DATA_ADAPTER = "synthetic";
    const { getAdminRepository, RepositoryUnavailableError } = await import("./index");
    expect(() => getAdminRepository()).toThrow(RepositoryUnavailableError);
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadPublicConfig, loadServerConfig } from "./config";

describe("admin config loader", () => {
  it("loadPublicConfig succeeds even when SUPABASE_SERVICE_ROLE_KEY is present in process.env", () => {
    process.env["SUPABASE_URL"] = "https://avirdszrhsvduonuflao.supabase.co";
    process.env["SUPABASE_ANON_KEY"] = "sb_publishable_test_anon_key";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key-that-is-secret";
    process.env["DIZKARTE_ENV"] = "development";

    const publicConfig = loadPublicConfig();
    expect(publicConfig.supabaseUrl).toBe("https://avirdszrhsvduonuflao.supabase.co");
    expect(publicConfig.supabaseAnonKey).toBe("sb_publishable_test_anon_key");
    // Ensure secret keys are never present on publicConfig
    expect((publicConfig as Record<string, unknown>)["supabaseServiceRoleKey"]).toBeUndefined();
  });

  it("loadServerConfig reads SUPABASE_SERVICE_ROLE_KEY without throwing", () => {
    process.env["SUPABASE_URL"] = "https://avirdszrhsvduonuflao.supabase.co";
    process.env["SUPABASE_ANON_KEY"] = "sb_publishable_test_anon_key";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key-that-is-secret";
    process.env["DIZKARTE_ENV"] = "development";

    const serverConfig = loadServerConfig();
    expect(serverConfig.supabaseServiceRoleKey).toBe("test-service-role-key-that-is-secret");
  });
});

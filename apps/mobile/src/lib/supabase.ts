import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAppConfig } from "./config";

/**
 * Single Supabase client for the mobile app.
 *
 * Uses the publishable anon key only (never a service-role key) and persists
 * the session through AsyncStorage with automatic token refresh — Supabase
 * owns session lifetime/rotation, replacing the previous hand-rolled
 * AsyncStorage session blob. `detectSessionInUrl` is disabled because there is
 * no browser redirect flow on native.
 */
let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;
  const { supabaseUrl, supabaseAnonKey } = getAppConfig();
  cached = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return cached;
}

/** Test-only reset hook. */
export function __resetSupabaseClientForTests(): void {
  cached = null;
}

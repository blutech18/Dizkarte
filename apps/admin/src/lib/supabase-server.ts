import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPublicConfig } from "./config";

/**
 * Cookie-backed Supabase client for the Next.js App Router (server side).
 *
 * Uses `@supabase/ssr` so the auth session lives in httpOnly cookies that
 * Supabase manages and refreshes — there is no hand-rolled session cookie.
 * The publishable anon key is used (never the service-role key); privileged
 * reads/writes still flow through RLS and SECURITY DEFINER RPCs.
 *
 * `setAll` is wrapped in try/catch because cookie writes are only allowed from
 * Server Actions and Route Handlers, not plain Server Components; when called
 * from a component the refresh simply no-ops (middleware/actions refresh it).
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey } = loadPublicConfig();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set({ name, value, ...(options ?? {}) });
          }
        } catch {
          // Called from a Server Component render — ignore; a Server Action or
          // route handler will persist refreshed tokens.
        }
      },
    },
  });
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Concrete Supabase client type used by Dizkarte adapters. Kept as a thin alias
 * so callers do not import `@supabase/supabase-js` directly and the version is
 * pinned in one place.
 */
export type DizkarteSupabaseClient = SupabaseClient;

export type CreateSupabaseClientOptions = {
  /** Project URL, e.g. `https://<ref>.supabase.co`. */
  readonly url: string;
  /**
   * Publishable anon key. Reads flow through Row Level Security under this key;
   * this adapter never accepts or requires the service-role key.
   */
  readonly anonKey: string;
  /**
   * Persist/refresh the auth session. Defaults to `false`, which is correct for
   * server-side/stateless read usage. Mobile clients that keep a signed-in
   * session may pass `true` with their own storage.
   */
  readonly persistSession?: boolean;
};

/**
 * Construct a Supabase client for Dizkarte read adapters.
 *
 * Fails closed: throws when the URL or anon key is missing/blank rather than
 * returning a half-configured client that would silently produce empty reads.
 * The anon key is used deliberately so every read is bounded by RLS — the
 * service-role key must never be handed to this adapter.
 */
export function createSupabaseClient(options: CreateSupabaseClientOptions): DizkarteSupabaseClient {
  const url = options.url?.trim();
  const anonKey = options.anonKey?.trim();
  if (!url) {
    throw new Error("createSupabaseClient: `url` is required and must be non-empty (fail-closed).");
  }
  if (!anonKey) {
    throw new Error(
      "createSupabaseClient: `anonKey` is required and must be non-empty (fail-closed).",
    );
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: options.persistSession ?? false,
      autoRefreshToken: options.persistSession ?? false,
    },
  });
}

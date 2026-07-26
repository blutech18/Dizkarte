import "server-only";
import { loadServerConfig, isDevAdapterActive } from "../config";
import { getSyntheticAdminRepository } from "./synthetic-admin-repository";
import { createSupabaseAdminRepository } from "./supabase-admin-repository";
import type { AdminRepository } from "./types";

export class RepositoryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryUnavailableError";
  }
}

/**
 * True only when the deterministic in-memory adapter has been explicitly opted
 * into for offline development. It is never a silent fallback: without this flag
 * a development environment still reads the real Supabase project, so what the
 * console shows is what is actually in the database.
 */
function syntheticOptIn(): boolean {
  return process.env["ADMIN_DATA_ADAPTER"] === "synthetic";
}

/**
 * Select the Admin repository adapter for the current environment.
 *
 * Default in every environment is the real Supabase adapter, which reads and
 * writes through the signed-in Admin's own JWT (RLS-enforced, no service-role
 * key) and routes every mutation through an audited SECURITY DEFINER RPC.
 *
 * The synthetic adapter is only returned when `ADMIN_DATA_ADAPTER=synthetic` is
 * set AND the environment is development/test — so staging/production can never
 * be served fabricated data even by misconfiguration.
 */
export function getAdminRepository(): AdminRepository {
  const config = loadServerConfig();
  if (syntheticOptIn()) {
    if (!isDevAdapterActive(config)) {
      throw new RepositoryUnavailableError(
        `ADMIN_DATA_ADAPTER=synthetic is not permitted in environment "${config.environment}".`,
      );
    }
    return getSyntheticAdminRepository();
  }
  return createSupabaseAdminRepository();
}

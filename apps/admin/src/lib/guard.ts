import "server-only";
import { redirect } from "next/navigation";
import type { AdminCapability } from "@dizkarte/domain";
import { AdminAuthorizationError, requireAdminSession, type AdminSession } from "./session";

/**
 * Page-level capability guard.
 *
 * `requireAdminSession` throws so that server actions can fail closed without
 * navigating. Pages need the same authorization decision but a readable
 * outcome: a signed-in Support Admin who opens a Finance page should be told
 * their capability does not cover it, not shown a crashed route.
 *
 * The authorization decision itself still lives in `requireAdminSession`, so
 * this only translates the failure into navigation:
 *  - not signed in       -> /login (with the attempted path preserved)
 *  - signed in, no grant -> /access-restricted
 *
 * Server actions and route handlers keep calling `requireAdminSession`
 * directly; this is not a replacement for that boundary.
 */
export async function requirePageCapability(
  capabilities?: ReadonlyArray<AdminCapability>,
): Promise<AdminSession> {
  try {
    return await requireAdminSession(capabilities);
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      redirect(error.message === "FORBIDDEN" ? "/access-restricted" : "/login");
    }
    throw error;
  }
}

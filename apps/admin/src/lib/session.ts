import "server-only";
import type { AdminCapability, UserCapability } from "@dizkarte/domain";
import { ADMIN_CAPABILITIES } from "@dizkarte/domain";
import { loadUserContext } from "@dizkarte/adapter-supabase";
import { createSupabaseServerClient } from "./supabase-server";

/**
 * Admin session and server-side capability guard — real Supabase Auth.
 *
 * Authorization is never derived from client-supplied data: the signed-in user
 * is verified via Supabase (`auth.getUser`), and capabilities are read from the
 * `user_capabilities` table (RLS self-read) through `loadUserContext`. Only
 * users holding an Admin capability get a session; everyone else is treated as
 * unauthenticated for the Admin console.
 *
 * Middleware (see `middleware.ts`) performs a convenience redirect only. Every
 * protected layout/page/route handler/server action calls `requireAdminSession`
 * itself, so a bypassed or misconfigured middleware can never grant access.
 */

export type AdminSession = {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly capabilities: ReadonlyArray<AdminCapability>;
  /** True only for a synthetic/dev session; always false with real Supabase auth. */
  readonly synthetic: boolean;
};

export type LoginResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

const ADMIN_CAPABILITY_SET: ReadonlyArray<UserCapability> = ADMIN_CAPABILITIES;

function toAdminCapabilities(
  capabilities: ReadonlyArray<UserCapability>,
): ReadonlyArray<AdminCapability> {
  return capabilities.filter((cap): cap is AdminCapability =>
    (ADMIN_CAPABILITY_SET as ReadonlyArray<string>).includes(cap),
  );
}

/**
 * Verify email/password against Supabase Auth and confirm the user holds an
 * Admin capability. On success the `@supabase/ssr` client has already set the
 * auth cookies. A non-Admin (or invalid) credential is signed out again and
 * rejected with a generic message that never discloses account existence.
 */
export async function loginWithSupabase(email: string, password: string): Promise<LoginResult> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error || !data.user) {
    return { ok: false, message: "Incorrect email or password." };
  }
  const ctx = await loadUserContext(client, data.user.id);
  const adminCaps = ctx ? toAdminCapabilities(ctx.capabilities) : [];
  if (!ctx || adminCaps.length === 0 || ctx.accountStatus !== "active") {
    // Not an active Admin — do not leave an authenticated session behind.
    await client.auth.signOut();
    return { ok: false, message: "This account does not have Admin access." };
  }
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const client = await createSupabaseServerClient();
  await client.auth.signOut();
}

/**
 * Send a password-recovery email.
 *
 * Always resolves successfully, whether or not the address belongs to an Admin,
 * so the console never becomes an oracle for which emails exist or which of
 * them hold Admin access. `redirectTo` points at the confirm route handler,
 * which exchanges the emailed token for a short-lived recovery session before
 * handing off to the set-password screen.
 */
export async function requestAdminPasswordReset(
  email: string,
  origin: string,
): Promise<{ readonly ok: true }> {
  const client = await createSupabaseServerClient();
  await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${origin}/auth/confirm?next=/update-password`,
  });
  return { ok: true };
}

/**
 * Set a new password for the currently authenticated (recovery) session.
 *
 * Refuses unless the caller actually holds an Admin capability, so a recovery
 * link belonging to a non-Admin account can never be used to establish a
 * session against the console.
 */
export async function updateAdminPassword(newPassword: string): Promise<LoginResult> {
  const client = await createSupabaseServerClient();
  const { data, error: userError } = await client.auth.getUser();
  if (userError || !data.user) {
    return { ok: false, message: "This password reset link has expired. Request a new one." };
  }

  const ctx = await loadUserContext(client, data.user.id);
  const adminCaps = ctx ? toAdminCapabilities(ctx.capabilities) : [];
  if (!ctx || adminCaps.length === 0 || ctx.accountStatus !== "active") {
    await client.auth.signOut();
    return { ok: false, message: "This account does not have Admin access." };
  }

  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) {
    return { ok: false, message: "Could not update the password. Please try again." };
  }
  return { ok: true };
}

/**
 * Read the current Admin session without throwing. Returns null when signed
 * out or when the authenticated user holds no Admin capability.
 */
export async function readSession(): Promise<AdminSession | null> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;

  const ctx = await loadUserContext(client, data.user.id);
  if (!ctx || ctx.accountStatus !== "active") return null;

  const adminCaps = toAdminCapabilities(ctx.capabilities);
  if (adminCaps.length === 0) return null;

  return {
    userId: ctx.userId,
    displayName: ctx.displayName || (data.user.email ?? "Admin"),
    email: data.user.email ?? "",
    capabilities: adminCaps,
    synthetic: false,
  };
}

export class AdminAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAuthorizationError";
  }
}

/**
 * Server-side capability guard. Every protected layout, route handler, and
 * server action calls this directly rather than relying on middleware.
 */
export async function requireAdminSession(
  required?: ReadonlyArray<AdminCapability>,
): Promise<AdminSession> {
  const session = await readSession();
  if (!session) {
    throw new AdminAuthorizationError("UNAUTHENTICATED");
  }
  const requiredSet = required ?? ADMIN_CAPABILITIES;
  const allowed = session.capabilities.some(
    (capability) => capability === "ADMIN_SUPER" || requiredSet.includes(capability),
  );
  if (!allowed) {
    throw new AdminAuthorizationError("FORBIDDEN");
  }
  return session;
}

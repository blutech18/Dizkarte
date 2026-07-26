import { loadUserContext } from "@dizkarte/adapter-supabase";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { getSupabaseClient } from "../lib/supabase";
import type { MobileSession } from "./session-types";

/**
 * Real Supabase-backed authentication for the mobile app. Replaces the former
 * in-memory synthetic directory: identities live in Supabase Auth and
 * authorization (capabilities, verification, Tasker approval) is read from the
 * real backend tables via `loadUserContext`.
 */

export type AuthOutcome = { readonly ok: true } | { readonly ok: false; readonly message: string };

/**
 * Registration can succeed in two ways depending on the Supabase project's
 * email-confirmation setting: either a session is created immediately, or the
 * user must confirm their email first. `needsConfirmation` lets the UI branch
 * without inspecting Supabase internals.
 */
export type RegisterOutcome =
  | { readonly ok: true; readonly needsConfirmation: boolean }
  | { readonly ok: false; readonly message: string };

/** OAuth providers we may enable (config-gated; off by default). */
export type SocialProvider = "google";

const GENERIC_SIGN_IN_ERROR = "Incorrect email or password.";

/**
 * Build the client-visible session projection for an authenticated user by
 * reading their real authorization context. Returns `null` when no profile row
 * exists yet (e.g. the auth user was created but provisioning has not run).
 */
export async function buildMobileSession(
  userId: string,
  email: string,
): Promise<MobileSession | null> {
  const ctx = await loadUserContext(getSupabaseClient(), userId);
  if (!ctx) return null;
  return {
    userId: ctx.userId,
    email,
    displayName: ctx.displayName || email,
    capabilities: ctx.capabilities,
    accountStatus: ctx.accountStatus,
    verificationStatus: ctx.verificationStatus,
    taskerApplicationStatus: ctx.taskerApplicationStatus,
    synthetic: false,
  };
}

export async function signIn(email: string, password: string): Promise<AuthOutcome> {
  const client = getSupabaseClient();
  const { error } = await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  // Safe generic message: never disclose whether the email exists (R1).
  if (error) return { ok: false, message: GENERIC_SIGN_IN_ERROR };
  return { ok: true };
}

export async function register(
  email: string,
  password: string,
  displayName: string,
): Promise<RegisterOutcome> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { display_name: displayName.trim() } },
  });
  if (error) {
    // Generic message avoids disclosing whether the account already exists.
    return { ok: false, message: "Unable to create this account. Please try signing in instead." };
  }
  // When email confirmation is required, Supabase returns a user but no session.
  const needsConfirmation = data.session === null;
  return { ok: true, needsConfirmation };
}

/**
 * Resend the sign-up confirmation email. Resolves successfully even on error so
 * the UI never discloses whether the address is registered (R1).
 */
export async function resendConfirmation(email: string): Promise<{ ok: true }> {
  await getSupabaseClient().auth.resend({ type: "signup", email: email.trim().toLowerCase() });
  return { ok: true };
}

export async function signOutCurrent(): Promise<void> {
  await getSupabaseClient().auth.signOut();
}

/**
 * Trigger a password-reset email. Always resolves successfully regardless of
 * whether the email exists, so the UI never discloses account existence (R1).
 * The deep link routes the user back into the app's set-new-password screen.
 */
export async function requestPasswordReset(email: string): Promise<{ ok: true }> {
  const redirectTo = Linking.createURL("/(auth)/update-password");
  await getSupabaseClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo,
  });
  return { ok: true };
}

/**
 * Complete a password reset (or change) for the currently authenticated
 * recovery session by setting a new password.
 */
export async function updatePassword(newPassword: string): Promise<AuthOutcome> {
  const { error } = await getSupabaseClient().auth.updateUser({ password: newPassword });
  if (error) return { ok: false, message: "Could not update your password. Please try again." };
  return { ok: true };
}

/**
 * Extract Supabase auth tokens from an OAuth redirect URL. Tokens may arrive in
 * the URL fragment (`#access_token=...`) or the query string depending on the
 * provider/flow, so we check both.
 */
function extractAuthTokens(url: string): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  const raw =
    hashIndex >= 0
      ? url.slice(hashIndex + 1)
      : queryIndex >= 0
        ? url.slice(queryIndex + 1)
        : "";
  const params = new URLSearchParams(raw);
  return {
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
  };
}

/**
 * Approved social login (config-gated; hidden unless explicitly enabled). Opens
 * the provider consent screen in a secure auth session, then completes the
 * Supabase session from the returned tokens. `onAuthStateChange` picks up the
 * new session and builds the app's `MobileSession`.
 */
export async function signInWithProvider(provider: SocialProvider): Promise<AuthOutcome> {
  const client = getSupabaseClient();
  const redirectTo = Linking.createURL("/(auth)/auth-callback");
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) {
    return { ok: false, message: "Could not start sign-in. Please try again." };
  }
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") {
    return { ok: false, message: "Sign-in was cancelled." };
  }
  const { accessToken, refreshToken } = extractAuthTokens(result.url);
  if (!accessToken || !refreshToken) {
    return { ok: false, message: "Sign-in did not complete. Please try again." };
  }
  const { error: sessionError } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (sessionError) {
    return { ok: false, message: "Could not complete sign-in. Please try again." };
  }
  return { ok: true };
}

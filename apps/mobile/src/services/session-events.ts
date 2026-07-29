/**
 * Pure decision table for Supabase auth events.
 *
 * Extracted from `SessionProvider` so the rule that stopped signed-in users from
 * bouncing back to the welcome screen is verifiable without rendering the app or
 * touching the network.
 */

export type AuthAction =
  /** Short-lived recovery session: send the user to set a new password. */
  | "route-password-recovery"
  /** Supabase says there is no session. The only legitimate path to signed-out. */
  | "clear"
  /** Identity is unchanged; reuse the existing projection. */
  | "keep"
  /** A new or different user: build the session projection. */
  | "derive";

export type AuthEventInput = {
  readonly event: string;
  /** User id carried by the event, or null when the session is gone. */
  readonly nextUserId: string | null;
  /** User id of the session the app currently holds, or null if none. */
  readonly currentUserId: string | null;
};

/**
 * Decide what a given auth event should do.
 *
 * `TOKEN_REFRESHED` is the important case: it fires while the app sits idle and
 * carries the same user. Re-deriving there meant another five network queries
 * whose failure previously dropped the user to signed-out — so an idle app could
 * log itself out. Capabilities cannot change behind a token refresh, so the
 * existing projection is reused instead.
 */
export function decideAuthAction(input: AuthEventInput): AuthAction {
  if (input.event === "PASSWORD_RECOVERY") return "route-password-recovery";
  if (input.event === "SIGNED_OUT" || input.nextUserId === null) return "clear";
  if (input.currentUserId !== null && input.currentUserId === input.nextUserId) return "keep";
  return "derive";
}

/**
 * Whether a failed context derivation may downgrade the app to signed-out.
 *
 * Only when nothing was established yet. Once a session exists, Supabase still
 * holds valid tokens, so a transient backend failure must not sign the user out
 * — the next auth event re-derives.
 */
export function mayDowngradeToSignedOut(hasEstablishedSession: boolean): boolean {
  return !hasEstablishedSession;
}

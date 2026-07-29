import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { router } from "expo-router";
import type { MobileSession } from "../services/session-types";
import { getSupabaseClient } from "../lib/supabase";
import { buildMobileSession, register as authRegister, signIn as authSignIn } from "../services/auth";
import { decideAuthAction, mayDowngradeToSignedOut } from "../services/session-events";

type SessionStatus = "loading" | "signed-out" | "signed-in";

type SessionContextValue = {
  readonly session: MobileSession | null;
  readonly status: SessionStatus;
  readonly signIn: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  readonly register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ ok: boolean; message?: string; needsConfirmation?: boolean }>;
  readonly signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

/** Backoff delays for re-deriving the authorization context, in milliseconds. */
const RETRY_DELAYS_MS = [250, 750, 2000] as const;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Real Supabase-backed session provider.
 *
 * Supabase owns the auth session (persisted and auto-refreshed through the
 * client's AsyncStorage storage). This provider derives the app's
 * `MobileSession` projection — capabilities, verification state, Tasker approval
 * — from the authenticated user's real authorization context and keeps it in
 * sync via `onAuthStateChange`.
 *
 * Three rules keep that derivation from producing spurious sign-outs, which is
 * what made a freshly logged-in user bounce back to the welcome screen:
 *
 *  1. Only Supabase deciding there is no session (an absent session or an
 *     explicit `SIGNED_OUT`) may move the app to `signed-out`. A failure to
 *     *derive* the context — a dropped request, an expired token mid-flight — is
 *     retried and never downgrades an established session.
 *  2. Every derivation carries a sequence number, so a slow earlier response can
 *     never overwrite a newer one. `getSession()` and the `INITIAL_SESSION`
 *     event both fire at startup, so concurrent derivations are normal.
 *  3. Events that do not change identity (`TOKEN_REFRESHED`, `USER_UPDATED` for
 *     the same user) reuse the existing projection instead of re-querying.
 *     Capabilities cannot change behind a token refresh, and re-deriving on
 *     every refresh was both wasteful and a recurring chance to fail while the
 *     app sat idle.
 */
export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");

  const mounted = useRef(true);
  /** Monotonic token; only the newest derivation may publish a result. */
  const derivation = useRef(0);
  /** Latest session, readable inside async work without a stale closure. */
  const sessionRef = useRef<MobileSession | null>(null);

  const publish = useCallback((next: MobileSession | null, nextStatus: SessionStatus) => {
    sessionRef.current = next;
    setSession(next);
    setStatus(nextStatus);
  }, []);

  /** Supabase says there is no session. This is the only path to signed-out. */
  const clearSession = useCallback(() => {
    derivation.current += 1;
    if (mounted.current) publish(null, "signed-out");
  }, [publish]);

  /**
   * Build the session projection for an authenticated user.
   *
   * Resolves once the outcome has been published (or superseded), so callers
   * such as `signIn` can await it and only navigate when the app is genuinely
   * ready — navigating earlier is what let a protected layout see a stale
   * `signed-out` and redirect to the welcome screen.
   */
  const deriveSession = useCallback(
    async (userId: string, email: string): Promise<void> => {
      const token = (derivation.current += 1);
      const isStale = () => token !== derivation.current || !mounted.current;

      // Nothing is known yet, so show the loading gate rather than a
      // signed-out screen the user would be redirected away from.
      if (sessionRef.current === null && mounted.current) setStatus("loading");

      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        if (isStale()) return;
        try {
          const next = await buildMobileSession(userId, email);
          if (isStale()) return;
          if (next) {
            publish(next, "signed-in");
            return;
          }
          // Authenticated but no profile row. Immediately after registration the
          // provisioning trigger may not be visible yet, so retry before giving up.
        } catch {
          if (isStale()) return;
        }

        const delay = RETRY_DELAYS_MS[attempt];
        if (delay === undefined) break;
        await wait(delay);
      }

      if (isStale()) return;
      // Retries exhausted. Keep an established session rather than logging the
      // user out over a transient backend problem; Supabase still holds valid
      // tokens and the next event will re-derive.
      if (!mayDowngradeToSignedOut(sessionRef.current !== null)) return;
      publish(null, "signed-out");
    },
    [publish],
  );

  useEffect(() => {
    mounted.current = true;
    const client = getSupabaseClient();

    client.auth
      .getSession()
      .then(({ data }) => {
        const user = data.session?.user;
        if (!user) {
          clearSession();
          return;
        }
        void deriveSession(user.id, user.email ?? "");
      })
      .catch(() => {
        // Could not read persisted state; treat as signed-out so the user gets
        // a sign-in screen instead of an indefinite spinner.
        clearSession();
      });

    const { data: sub } = client.auth.onAuthStateChange((event, nextSession) => {
      // A password-recovery deep link opens a short-lived session solely to set
      // a new password. Route to the dedicated screen rather than treating it as
      // a normal sign-in.
      if (event === "PASSWORD_RECOVERY") {
        router.replace("/(auth)/update-password");
        return;
      }

      const user = nextSession?.user ?? null;
      const action = decideAuthAction({
        event,
        nextUserId: user?.id ?? null,
        currentUserId: sessionRef.current?.userId ?? null,
      });

      if (action === "clear") {
        clearSession();
        return;
      }
      if (action === "keep" || !user) return;
      void deriveSession(user.id, user.email ?? "");
    });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, [clearSession, deriveSession]);

  /**
   * Sign in and wait for the session to be usable.
   *
   * Deliberately does not return on `signInWithPassword` alone: the caller
   * navigates to a protected route as soon as this resolves, and that route's
   * guard reads `status`. Returning early left the guard looking at the previous
   * `signed-out` value, which redirected the user straight back to welcome.
   */
  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await authSignIn(email, password);
      if (!result.ok) return { ok: false, message: result.message };

      const { data } = await getSupabaseClient().auth.getUser();
      const user = data.user;
      if (!user) {
        return { ok: false, message: "Could not start your session. Please try again." };
      }

      await deriveSession(user.id, user.email ?? email);
      if (sessionRef.current === null) {
        return {
          ok: false,
          message: "Signed in, but your profile could not be loaded. Please try again.",
        };
      }
      return { ok: true };
    },
    [deriveSession],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const result = await authRegister(email, password, displayName);
      if (!result.ok) return { ok: false, message: result.message };

      // When confirmation is required no session exists yet, so there is nothing
      // to derive — the screen shows its "check your email" state instead.
      if (!result.needsConfirmation) {
        const { data } = await getSupabaseClient().auth.getUser();
        const user = data.user;
        if (user) await deriveSession(user.id, user.email ?? email);
      }
      return { ok: true, needsConfirmation: result.needsConfirmation };
    },
    [deriveSession],
  );

  const signOut = useCallback(async () => {
    // Invalidate any in-flight derivation first so a late response cannot
    // resurrect the session the user just ended.
    derivation.current += 1;
    await getSupabaseClient().auth.signOut();
    if (mounted.current) publish(null, "signed-out");
  }, [publish]);

  const value = useMemo<SessionContextValue>(
    () => ({ session, status, signIn, register, signOut }),
    [session, status, signIn, register, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}

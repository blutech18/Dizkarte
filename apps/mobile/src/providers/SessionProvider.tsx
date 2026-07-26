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

type SessionContextValue = {
  readonly session: MobileSession | null;
  readonly status: "loading" | "signed-out" | "signed-in";
  readonly signIn: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  readonly register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ ok: boolean; message?: string; needsConfirmation?: boolean }>;
  readonly signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Real Supabase-backed session provider.
 *
 * Supabase owns the auth session (persisted + auto-refreshed via the client's
 * AsyncStorage storage). This provider derives the app's `MobileSession`
 * projection from the authenticated user's real authorization context and
 * keeps it in sync through `onAuthStateChange`.
 */
export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [status, setStatus] = useState<"loading" | "signed-out" | "signed-in">("loading");
  const mounted = useRef(true);

  const applyUser = useCallback(
    async (userId: string | undefined, email: string | undefined) => {
      if (!userId) {
        if (mounted.current) {
          setSession(null);
          setStatus("signed-out");
        }
        return;
      }
      try {
        const next = await buildMobileSession(userId, email ?? "");
        if (!mounted.current) return;
        if (next) {
          setSession(next);
          setStatus("signed-in");
        } else {
          // Authenticated but no profile provisioned yet — treat as signed-out
          // rather than a half-built session.
          setSession(null);
          setStatus("signed-out");
        }
      } catch {
        if (mounted.current) {
          setSession(null);
          setStatus("signed-out");
        }
      }
    },
    [],
  );

  useEffect(() => {
    mounted.current = true;
    const client = getSupabaseClient();

    client.auth
      .getSession()
      .then(({ data }) => applyUser(data.session?.user.id, data.session?.user.email))
      .catch(() => {
        if (mounted.current) setStatus("signed-out");
      });

    const { data: sub } = client.auth.onAuthStateChange((event, nextSession) => {
      // A password-recovery deep link opens a temporary session solely to set a
      // new password. Route to the dedicated screen instead of letting the app
      // treat it as a normal sign-in.
      if (event === "PASSWORD_RECOVERY") {
        router.replace("/(auth)/update-password");
        return;
      }
      void applyUser(nextSession?.user.id, nextSession?.user.email);
    });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, [applyUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authSignIn(email, password);
    if (!result.ok) return { ok: false, message: result.message };
    // onAuthStateChange will rebuild the session; return success immediately.
    return { ok: true };
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const result = await authRegister(email, password, displayName);
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true, needsConfirmation: result.needsConfirmation };
  }, []);

  const signOut = useCallback(async () => {
    await getSupabaseClient().auth.signOut();
    if (mounted.current) {
      setSession(null);
      setStatus("signed-out");
    }
  }, []);

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

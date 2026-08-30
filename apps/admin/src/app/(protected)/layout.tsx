import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { loadServerConfig, isDevAdapterActive } from "@/lib/config";
import { AdminAuthorizationError, requireAdminSession } from "@/lib/session";
import { getAdminRepository } from "@/lib/repository";
import { AppShell } from "@/components/shell/AppShell";
import { ConfigurationBlockedState } from "@/components/ui/AsyncState";

/**
 * Every protected page depends on the request-scoped session cookie and
 * server configuration, so none of it can be statically prerendered.
 *
 * This is not a tuning choice that can be relaxed per route. Authorization is
 * derived from the httpOnly Supabase auth cookie (`createSupabaseServerClient`
 * calls `cookies()`), and a route that reads cookies is dynamic by definition —
 * so neither static rendering nor per-route `revalidate` is available to any
 * page under this layout, however static its content looks.
 *
 * Nor may the data itself be cached across requests. The repository client is
 * bound to the calling Admin's JWT and every read is RLS-scoped, so a result
 * cached under one Admin and replayed for another would hand over rows their
 * capabilities do not permit. `unstable_cache` and friends are therefore off
 * limits here regardless of how rarely a table changes.
 *
 * What is safe, and is already in place, is request-scoped sharing: both
 * `readSession` and `getAdminRepository` are wrapped in React `cache()`, so this
 * layout, the page it renders, and every Suspense boundary inside that page
 * share one session read and one Supabase client per request instead of
 * repeating the work per component.
 */
export const dynamic = "force-dynamic";

/**
 * Protected Admin layout.
 *
 * This is the real server-side capability guard (not middleware). Every page
 * under this route group renders behind `requireAdminSession()`. If the
 * server configuration itself fails closed (e.g. staging/production missing
 * required credentials), we render a configuration-blocked state instead of
 * silently proceeding.
 */
export default async function ProtectedLayout({ children }: { readonly children: ReactNode }) {
  let devMode: boolean;
  try {
    const config = loadServerConfig();
    devMode = isDevAdapterActive(config);
  } catch (error) {
    return (
      <main id="dk-main-content" className="dk-content">
        <ConfigurationBlockedState
          violations={
            error instanceof Error && "violations" in error
              ? (error as unknown as { violations: Array<{ code: string; message: string }> })
                  .violations
              : [{ code: "CONFIGURATION_ERROR", message: "Server configuration failed to load." }]
          }
        />
      </main>
    );
  }

  try {
    const session = await requireAdminSession();
    return (
      <AppShell session={session} devMode={devMode} syntheticData={getAdminRepository().synthetic}>
        {children}
      </AppShell>
    );
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      redirect("/login");
    }
    throw error;
  }
}

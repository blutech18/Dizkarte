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

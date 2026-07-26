"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { AdminSession } from "@/lib/session";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { BottomNav } from "./BottomNav";

/**
 * Client-side shell shared by every protected page. Owns the mobile drawer
 * open/close state so the server-rendered layout stays a plain server
 * component; the drawer auto-closes on route change.
 */
export function AppShell({
  session,
  devMode,
  syntheticData,
  children,
}: {
  readonly session: AdminSession;
  readonly devMode: boolean;
  /** True only when the console is reading the in-memory synthetic adapter. */
  readonly syntheticData: boolean;
  readonly children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="dk-shell">
      <Sidebar
        capabilities={session.capabilities}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <div className="dk-main">
        <Topbar
          session={session}
          devMode={devMode}
          syntheticData={syntheticData}
          onOpenSidebar={() => setDrawerOpen(true)}
        />
        <main id="dk-main-content" className="dk-content" tabIndex={-1}>
          {children}
        </main>
        <BottomNav capabilities={session.capabilities} />
      </div>
    </div>
  );
}

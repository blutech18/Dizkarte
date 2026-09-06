"use client";

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { AdminSession } from "@/lib/session";
import {
  NavigationProgressBar,
  NavigationProgressProvider,
  useNavigationProgress,
} from "@/components/ui/NavigationProgress";
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
    <NavigationProgressProvider pathname={pathname}>
      {/*
        The bar sits outside the shell so replacing page content cannot unmount
        it mid-navigation.
      */}
      <NavigationProgressBar />
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
          <MainRegion>{children}</MainRegion>
          <BottomNav capabilities={session.capabilities} />
        </div>
      </div>
    </NavigationProgressProvider>
  );
}

/**
 * The content region, marked `aria-busy` while a navigation is in flight.
 *
 * This is the accessible counterpart to the progress bar: assistive technology
 * is told the region is being replaced, without an `aria-live` announcement on
 * every click that would talk over the page the operator is leaving.
 */
function MainRegion({ children }: { readonly children: ReactNode }) {
  const mainRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const { pendingHref } = useNavigationProgress();

  const scrollToTop = useCallback(() => {
    if (typeof window === "undefined") return;

    const reset = () => {
      if (mainRef.current) {
        mainRef.current.scrollTop = 0;
      }
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    reset();
    // Re-assert on the next animation frame after layout/DOM reconciliation
    requestAnimationFrame(reset);
  }, []);

  // When pathname or page children change, scroll back to the very top
  useEffect(() => {
    scrollToTop();
  }, [pathname, children, scrollToTop]);

  // When a link navigation starts (e.g. clicking View or table links)
  useEffect(() => {
    if (pendingHref) {
      scrollToTop();
    }
  }, [pendingHref, scrollToTop]);

  // When browser back/forward history navigation occurs
  useEffect(() => {
    const handlePopState = () => {
      scrollToTop();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [scrollToTop]);

  // Capture clicks on navigation links so scroll resets immediately upon click
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = (e.target as HTMLElement | null)?.closest("a");
      if (!target) return;
      if (target.getAttribute("target") === "_blank" || target.hasAttribute("download")) return;
      const href = target.getAttribute("href");
      if (href && (href.startsWith("/") || href.startsWith(window.location.origin))) {
        if (href.startsWith("#")) return;
        scrollToTop();
      }
    };

    window.addEventListener("click", handleLinkClick, { capture: true });
    return () => window.removeEventListener("click", handleLinkClick, { capture: true });
  }, [scrollToTop]);

  return (
    <main
      ref={mainRef}
      id="dk-main-content"
      className="dk-content"
      tabIndex={-1}
      aria-busy={pendingHref !== null || undefined}
    >
      {children}
    </main>
  );
}

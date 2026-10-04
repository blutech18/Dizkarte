"use client";

import { AppLink } from "@/components/ui/AppLink";
import { usePathname } from "next/navigation";
import type { AdminSession } from "@/lib/session";
import { NAV_SECTIONS } from "@/lib/nav";
import { SignOutButton } from "./SignOutButton";
import { MenuIcon, ChevronRightIcon } from "./icons";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase() || "A";
}

function getPageLabel(pathname: string): string {
  if (!pathname || pathname === "/" || pathname === "/dashboard") {
    return "Dashboard";
  }
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return item.label;
      }
    }
  }
  if (pathname.startsWith("/audit")) return "Audit log";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/access-restricted")) return "Access restricted";
  return "Dashboard";
}

export function Topbar({
  session,
  devMode: _devMode,
  syntheticData: _syntheticData,
  onOpenSidebar,
}: {
  readonly session: AdminSession;
  readonly devMode?: boolean;
  readonly syntheticData?: boolean;
  readonly onOpenSidebar: () => void;
}) {
  const pathname = usePathname() ?? "";
  const currentPageTitle = getPageLabel(pathname);

  return (
    <header className="dk-app-topbar">
      <div className="dk-app-topbar-left">
        <button
          type="button"
          className="dk-hamburger-btn"
          onClick={onOpenSidebar}
          aria-label="Open navigation menu"
        >
          <MenuIcon width={20} height={20} />
        </button>
        <div
          className="dk-app-topbar-brand"
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          <AppLink href="/dashboard" style={{ display: "inline-flex", alignItems: "center" }}>
            <img
              src="/brand/text-icon-logo.png"
              alt="Dizkarte"
              style={{ height: 24, width: "auto", display: "block" }}
            />
          </AppLink>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              color: "var(--dk-textSecondary)",
              opacity: 0.4,
            }}
            aria-hidden="true"
          >
            <ChevronRightIcon width={14} height={14} />
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              fontWeight: 700,
              fontSize: 14,
              color: "var(--dk-textPrimary)",
              lineHeight: "1",
            }}
          >
            {currentPageTitle}
          </span>
        </div>
      </div>
      <div className="dk-topbar-right">
        <div className="dk-topbar-user">
          <span className="dk-avatar-circle" aria-hidden="true">
            {initialsFor(session.displayName)}
          </span>
          <span className="dk-avatar-name">{session.displayName}</span>
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}

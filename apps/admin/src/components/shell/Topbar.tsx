"use client";

import { useEffect, useRef, useState } from "react";
import type { AdminSession } from "@/lib/session";
import { SignOutButton } from "./SignOutButton";
import { MenuIcon } from "./icons";

const CAPABILITY_LABEL: Record<string, string> = {
  ADMIN_SUPER: "Super Admin",
  ADMIN_FINANCE: "Finance Admin",
  ADMIN_SUPPORT: "Support Admin",
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase() || "A";
}

export function Topbar({
  session,
  devMode,
  syntheticData,
  onOpenSidebar,
}: {
  readonly session: AdminSession;
  readonly devMode: boolean;
  readonly syntheticData: boolean;
  readonly onOpenSidebar: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const capabilityText = session.capabilities
    .map((capability) => CAPABILITY_LABEL[capability] ?? capability)
    .join(", ");

  return (
    <>
      {syntheticData ? (
        <div className="dk-dev-banner" role="status">
          Synthetic data — in-memory fixtures, not real users
        </div>
      ) : devMode ? (
        <div className="dk-dev-banner" role="status">
          Development environment — connected to real Supabase data
        </div>
      ) : null}
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
          <a href="/dashboard" className="dk-app-topbar-brand">
            <img src="/brand/app-icon-logo.png" alt="" />
            <span>Dizkarte</span>
          </a>
        </div>
        <div className="dk-topbar-user-menu" ref={menuRef}>
          <button
            type="button"
            className="dk-avatar-btn"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="dk-avatar-circle" aria-hidden="true">
              {initialsFor(session.displayName)}
            </span>
            <span className="dk-avatar-name">{session.displayName}</span>
          </button>
          {menuOpen ? (
            <div className="dk-user-menu-panel" role="menu">
              <div className="dk-user-menu-header">
                <strong>{session.displayName}</strong>
                <span>{capabilityText}</span>
              </div>
              <SignOutButton />
            </div>
          ) : null}
        </div>
      </header>
    </>
  );
}

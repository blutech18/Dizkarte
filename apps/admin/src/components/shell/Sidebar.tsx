"use client";

import { usePathname } from "next/navigation";
import type { AdminCapability } from "@dizkarte/domain";
import { NAV_SECTIONS, isNavItemVisible } from "@/lib/nav";
import { CloseIcon } from "./icons";

export function Sidebar({
  capabilities,
  open,
  onClose,
}: {
  readonly capabilities: ReadonlyArray<AdminCapability>;
  /** Controls the mobile drawer's visibility. Always visible on desktop widths. */
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      <div
        className={`dk-sidebar-backdrop ${open ? "dk-sidebar-backdrop-open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <nav
        className={`dk-sidebar ${open ? "dk-sidebar-open" : ""}`}
        aria-label="Admin navigation"
      >
        <div className="dk-sidebar-header">
          <div className="dk-sidebar-brand">
            <img src="/brand/app-icon-logo.png" alt="Dizkarte" style={{ height: 32, width: 32, display: "block" }} />
            <strong>Dizkarte Admin</strong>
          </div>
          <button
            type="button"
            className="dk-sidebar-close-btn"
            onClick={onClose}
            aria-label="Close navigation menu"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </div>
        <div className="dk-sidebar-body">
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter((item) =>
              isNavItemVisible(item, capabilities),
            );
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.title} className="dk-nav-section-group">
                <p className="dk-nav-section">{section.title}</p>
                {visibleItems.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      className="dk-nav-link"
                      aria-current={active ? "page" : undefined}
                      onClick={onClose}
                    >
                      {Icon ? (
                        <span className="dk-nav-link-icon" aria-hidden="true">
                          <Icon width={18} height={18} />
                        </span>
                      ) : null}
                      {item.label}
                    </a>
                  );
                })}
              </div>
            );
          })}
        </div>
      </nav>
    </>
  );
}

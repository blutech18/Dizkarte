"use client";

import { usePathname } from "next/navigation";
import type { AdminCapability } from "@dizkarte/domain";
import { BOTTOM_NAV_ITEMS, isNavItemVisible } from "@/lib/nav";

/**
 * Mobile-only always-visible quick-nav bar, mirroring Airtasker's app bottom
 * tab bar. Desktop/tablet widths hide this via CSS; the full Sidebar remains
 * the primary navigation there.
 */
export function BottomNav({
  capabilities,
}: {
  readonly capabilities: ReadonlyArray<AdminCapability>;
}) {
  const pathname = usePathname();
  const items = BOTTOM_NAV_ITEMS.filter((item) => isNavItemVisible(item, capabilities));

  return (
    <nav className="dk-bottom-nav" aria-label="Quick navigation">
      <ul className="dk-bottom-nav-list">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <a href={item.href} className="dk-bottom-nav-item" aria-current={active ? "page" : undefined}>
                {Icon ? <Icon width={20} height={20} aria-hidden="true" /> : null}
                <span>{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

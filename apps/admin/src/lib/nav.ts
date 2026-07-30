import type { AdminCapability } from "@dizkarte/domain";
import type { ComponentType, SVGProps } from "react";
import {
  GridIcon,
  ShieldIcon,
  TagIcon,
  ChatIcon,
  WalletIcon,
  ClipboardIcon,
} from "@/components/shell/icons";

export type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly capabilities?: ReadonlyArray<AdminCapability>;
  /** Optional glyph shown in the sidebar and, for top-level items, the bottom nav bar. */
  readonly icon?: ComponentType<SVGProps<SVGSVGElement>>;
};

export type NavSection = {
  readonly title: string;
  readonly items: ReadonlyArray<NavItem>;
};

export const NAV_SECTIONS: ReadonlyArray<NavSection> = [
  {
    title: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: GridIcon }],
  },
  {
    title: "Trust & safety",
    items: [
      { href: "/verification", label: "Identity verification", icon: ShieldIcon },
      { href: "/taskers", label: "Tasker applications", icon: ShieldIcon },
      { href: "/users", label: "Users", icon: ShieldIcon },
      { href: "/tasks", label: "Tasks & media", icon: ClipboardIcon },
    ],
  },
  {
    title: "Marketplace",
    items: [{ href: "/bookings", label: "Bookings", icon: ClipboardIcon }],
  },
  {
    title: "Catalog",
    items: [
      { href: "/categories", label: "Categories", capabilities: ["ADMIN_SUPER"], icon: TagIcon },
    ],
  },
  {
    title: "Support & disputes",
    items: [
      { href: "/reports", label: "Reports", icon: ChatIcon },
      { href: "/disputes", label: "Disputes", icon: ChatIcon },
      { href: "/support", label: "Support tickets", icon: ChatIcon },
      {
        href: "/reviews",
        label: "Reviews",
        capabilities: ["ADMIN_SUPPORT", "ADMIN_SUPER"],
        icon: ChatIcon,
      },
    ],
  },
  {
    title: "Finance",
    items: [
      {
        href: "/payments",
        label: "Payments & ledger",
        capabilities: ["ADMIN_FINANCE"],
        icon: WalletIcon,
      },
      {
        href: "/reconciliation",
        label: "Reconciliation",
        capabilities: ["ADMIN_FINANCE"],
        icon: WalletIcon,
      },
      {
        href: "/withdrawals",
        label: "Withdrawals & payouts",
        capabilities: ["ADMIN_FINANCE"],
        icon: WalletIcon,
      },
    ],
  },
  {
    title: "Governance",
    items: [
      { href: "/audit", label: "Audit log", capabilities: ["ADMIN_SUPER"], icon: ClipboardIcon },
      { href: "/settings", label: "Settings", capabilities: ["ADMIN_SUPER"], icon: GridIcon },
    ],
  },
];

/**
 * The four items surfaced in the mobile bottom quick-nav bar (Airtasker-style
 * always-visible shortcuts). Kept short and capability-checked the same way as
 * the full sidebar.
 */
export const BOTTOM_NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/dashboard", label: "Home", icon: GridIcon },
  { href: "/verification", label: "Verify", icon: ShieldIcon },
  { href: "/support", label: "Support", icon: ChatIcon },
  { href: "/payments", label: "Finance", capabilities: ["ADMIN_FINANCE"], icon: WalletIcon },
];

export function isNavItemVisible(
  item: NavItem,
  capabilities: ReadonlyArray<AdminCapability>,
): boolean {
  if (!item.capabilities) return true;
  if (capabilities.includes("ADMIN_SUPER")) return true;
  return item.capabilities.some((required) => capabilities.includes(required));
}

import type { AdminCapability } from "@dizkarte/domain";
import type { ComponentType, SVGProps } from "react";
import {
  GridIcon,
  ShieldIcon,
  TagIcon,
  ClipboardIcon,
  UserCheckIcon,
  UsersIcon,
  ImageIcon,
  CalendarIcon,
  FlagIcon,
  ScaleIcon,
  HeadphonesIcon,
  StarIcon,
  CreditCardIcon,
  ArrowLeftRightIcon,
  RotateCcwIcon,
  LandmarkIcon,
  TrendingUpIcon,
  HistoryIcon,
  SettingsIcon,
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
      {
        href: "/verification",
        label: "Identity verification",
        capabilities: ["ADMIN_SUPPORT"],
        icon: ShieldIcon,
      },
      {
        href: "/taskers",
        label: "Tasker applications",
        capabilities: ["ADMIN_SUPPORT"],
        icon: UserCheckIcon,
      },
      { href: "/users", label: "Users", capabilities: ["ADMIN_SUPPORT"], icon: UsersIcon },
      { href: "/tasks", label: "Tasks", capabilities: ["ADMIN_SUPPORT"], icon: ClipboardIcon },
      {
        href: "/media",
        label: "Task media",
        capabilities: ["ADMIN_SUPPORT", "ADMIN_SUPER"],
        icon: ImageIcon,
      },
    ],
  },
  {
    title: "Marketplace",
    items: [
      {
        href: "/bookings",
        label: "Bookings",
        capabilities: ["ADMIN_SUPPORT"],
        icon: CalendarIcon,
      },
    ],
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
      { href: "/reports", label: "Reports", capabilities: ["ADMIN_SUPPORT"], icon: FlagIcon },
      { href: "/disputes", label: "Disputes", capabilities: ["ADMIN_FINANCE"], icon: ScaleIcon },
      {
        href: "/support",
        label: "Support tickets",
        capabilities: ["ADMIN_SUPPORT"],
        icon: HeadphonesIcon,
      },
      {
        href: "/reviews",
        label: "Reviews",
        capabilities: ["ADMIN_SUPPORT", "ADMIN_SUPER"],
        icon: StarIcon,
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
        icon: CreditCardIcon,
      },
      {
        href: "/reconciliation",
        label: "Reconciliation",
        capabilities: ["ADMIN_FINANCE"],
        icon: ArrowLeftRightIcon,
      },
      {
        href: "/refunds",
        label: "Refunds",
        capabilities: ["ADMIN_FINANCE"],
        icon: RotateCcwIcon,
      },
      {
        href: "/withdrawals",
        label: "Withdrawals & payouts",
        capabilities: ["ADMIN_FINANCE"],
        icon: LandmarkIcon,
      },
      {
        href: "/revenue",
        label: "Revenue",
        capabilities: ["ADMIN_FINANCE"],
        icon: TrendingUpIcon,
      },
    ],
  },
  {
    title: "Governance",
    items: [
      { href: "/audit", label: "Audit log", capabilities: ["ADMIN_SUPER"], icon: HistoryIcon },
      { href: "/settings", label: "Settings", capabilities: ["ADMIN_SUPER"], icon: SettingsIcon },
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
  { href: "/verification", label: "Verify", capabilities: ["ADMIN_SUPPORT"], icon: ShieldIcon },
  { href: "/support", label: "Support", capabilities: ["ADMIN_SUPPORT"], icon: HeadphonesIcon },
  { href: "/payments", label: "Finance", capabilities: ["ADMIN_FINANCE"], icon: CreditCardIcon },
];

/**
 * The single capability rule used by every surface that decides whether to show
 * a link to a page: the sidebar, the bottom nav, and the dashboard cards.
 * `ADMIN_SUPER` always passes; an ungated destination is open to any Admin.
 *
 * This is presentation only. The page guard in `lib/guard.ts` is what actually
 * authorizes — this exists so no surface offers a destination the signed-in
 * Admin would be bounced from.
 */
export function hasAnyCapability(
  capabilities: ReadonlyArray<AdminCapability>,
  required?: ReadonlyArray<AdminCapability>,
): boolean {
  if (!required || required.length === 0) return true;
  if (capabilities.includes("ADMIN_SUPER")) return true;
  return required.some((cap) => capabilities.includes(cap));
}

export function isNavItemVisible(
  item: NavItem,
  capabilities: ReadonlyArray<AdminCapability>,
): boolean {
  return hasAnyCapability(capabilities, item.capabilities);
}

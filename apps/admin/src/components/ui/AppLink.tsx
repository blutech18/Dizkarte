"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect, type ComponentProps } from "react";
import { useNavigationProgress } from "./NavigationProgress";

/**
 * The one in-app link.
 *
 * Every protected route is server-rendered against live Supabase data, so a
 * navigation is a network request. `next/link` on its own gives no sign that the
 * click registered, and the console looked frozen until the destination
 * rendered. Routing every navigation through this component is what makes the
 * feedback consistent: a sidebar item, a table row, a breadcrumb, and a page
 * number all report to the same indicator.
 *
 * Props are `next/link`'s own, so this is a drop-in replacement and no call site
 * has to learn a second API.
 */
export type AppLinkProps = ComponentProps<typeof Link>;

/** Stable identity for a destination, whether it was given as a string or object. */
function hrefKey(href: AppLinkProps["href"]): string {
  return typeof href === "string" ? href : JSON.stringify(href);
}

/**
 * Reports the enclosing `<Link>`'s pending state upward. Must be rendered inside
 * the link — that is the hook's scope — and renders no DOM of its own, so it
 * cannot affect layout or a link's accessible name.
 */
function LinkStatusReporter({ hrefKey: key }: { readonly hrefKey: string }) {
  const { pending } = useLinkStatus();
  const { reportPending } = useNavigationProgress();

  useEffect(() => {
    reportPending(key, pending);
    // Unmounting mid-navigation (the mobile drawer closing, a row replaced by a
    // new result set) must not leave a signal nobody can lower.
    return () => reportPending(key, false);
  }, [key, pending, reportPending]);

  return null;
}

export function AppLink({ children, className, ...rest }: AppLinkProps) {
  const { pendingHref } = useNavigationProgress();
  const key = hrefKey(rest.href);
  const pending = pendingHref === key;

  const classes = [className, pending ? "dk-link-pending" : null].filter(Boolean).join(" ");

  return (
    <Link {...rest} {...(classes ? { className: classes } : {})}>
      {children}
      <LinkStatusReporter hrefKey={key} />
    </Link>
  );
}

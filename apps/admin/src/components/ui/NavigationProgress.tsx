"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * One shared "a navigation is in flight" signal for the Admin shell.
 *
 * `useLinkStatus` only reports to descendants of the `<Link>` that owns it, so a
 * link on its own can decorate nothing but itself. Every link therefore reports
 * upward and the shell renders a single indicator, which is what keeps the
 * feedback identical whether the operator clicked the sidebar, a table row, a
 * breadcrumb, or a page number.
 */

type NavigationProgressValue = {
  /** Key of the link currently navigating, or null when idle. */
  readonly pendingHref: string | null;
  readonly reportPending: (hrefKey: string, pending: boolean) => void;
};

const NavigationProgressContext = createContext<NavigationProgressValue>({
  pendingHref: null,
  reportPending: () => undefined,
});

/**
 * Wait this long before revealing the bar. Most navigations in a warm console
 * resolve faster than this, and an indicator that appears and vanishes inside
 * 100ms reads as a glitch rather than as progress.
 */
const REVEAL_DELAY_MS = 200;

/**
 * Once revealed, stay up at least this long. Without a floor, a navigation that
 * finishes just after the reveal produces a one-frame flash.
 */
const MINIMUM_VISIBLE_MS = 400;

export function NavigationProgressProvider({
  pathname,
  children,
}: {
  /**
   * Current pathname. Passed in rather than read here so the shell owns the
   * single `usePathname` subscription, and so arriving at a route always clears
   * the signal even if a link never reports itself settled.
   */
  readonly pathname: string;
  readonly children: ReactNode;
}) {
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null);

  const reportPending = useCallback(
    (hrefKey: string, isPending: boolean) => {
      if (isPending) {
        // Remember where the navigation started from; arriving anywhere else is
        // what proves it finished.
        setPending({ href: hrefKey, from: pathname });
        return;
      }
      // Only the link that raised the signal may lower it, so a sibling
      // settling cannot hide an indicator that is still needed.
      setPending((current) => (current?.href === hrefKey ? null : current));
    },
    [pathname],
  );

  // A completed navigation is the authoritative "done" signal, so a link that
  // never reports itself settled cannot leave the indicator stuck on screen.
  const pendingHref = pending && pending.from === pathname ? pending.href : null;

  const value = useMemo<NavigationProgressValue>(
    () => ({ pendingHref, reportPending }),
    [pendingHref, reportPending],
  );

  return (
    <NavigationProgressContext.Provider value={value}>
      {children}
    </NavigationProgressContext.Provider>
  );
}

export function useNavigationProgress(): NavigationProgressValue {
  return useContext(NavigationProgressContext);
}

/**
 * Debounced visibility for a transient activity signal.
 *
 * Exported for its own unit tests: the two thresholds are the whole reason this
 * indicator does not strobe, and they are easy to regress silently.
 */
export function useDebouncedActivity(
  active: boolean,
  { revealDelayMs = REVEAL_DELAY_MS, minimumVisibleMs = MINIMUM_VISIBLE_MS } = {},
): boolean {
  const [visible, setVisible] = useState(false);
  const revealedAt = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      if (visible) return;
      const timer = setTimeout(() => {
        revealedAt.current = Date.now();
        setVisible(true);
      }, revealDelayMs);
      return () => clearTimeout(timer);
    }

    if (!visible) return;
    const shownFor =
      revealedAt.current === null ? minimumVisibleMs : Date.now() - revealedAt.current;
    const timer = setTimeout(
      () => {
        revealedAt.current = null;
        setVisible(false);
      },
      Math.max(0, minimumVisibleMs - shownFor),
    );
    return () => clearTimeout(timer);
  }, [active, visible, revealDelayMs, minimumVisibleMs]);

  return visible;
}

/**
 * The navigation loading state: an indeterminate bar across the top of the
 * viewport.
 *
 * Peripheral on purpose. A centred overlay pulls the eye to the middle of the
 * screen and then hands off to a skeleton somewhere else, which is two attention
 * shifts for one navigation; and being centred it reads as a blocking modal even
 * when it is not. The bar is `aria-hidden` because it carries no information a
 * screen reader needs — the shell marks the content region `aria-busy` instead,
 * which is the correct semantic for "this region is being replaced".
 */
export function NavigationProgressBar() {
  const { pendingHref } = useNavigationProgress();
  const visible = useDebouncedActivity(pendingHref !== null);
  if (!visible) return null;
  return <div className="dk-nav-progress" aria-hidden="true" data-testid="nav-progress" />;
}

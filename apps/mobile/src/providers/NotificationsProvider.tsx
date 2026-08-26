import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { useSession } from "./SessionProvider";
import { useMarketplace } from "./MarketplaceProvider";
import { syncPushRegistration } from "../services/push";

/**
 * Shares one live "unread notifications" count across the app so the header
 * bell can show a badge without every screen re-querying.
 *
 * It stays current from three signals:
 *  - `revision` from `MarketplaceProvider` — bumped by `notifyChanged()` after
 *    the user reads one / marks all read, or after any action that creates a
 *    notification, so the badge reflects reads immediately.
 *  - the repository's realtime `subscribeToNotifications` — a notification
 *    arriving for this user refreshes the count with no user action.
 *  - app foreground — a notification may have landed while backgrounded.
 *
 * The count is 0 when signed out, and a failed refresh is swallowed: a transient
 * error must never blank out or crash the global header.
 */
type NotificationsContextValue = {
  readonly unreadCount: number;
  readonly refresh: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { readonly children: ReactNode }) {
  const { session } = useSession();
  const { repository, revision } = useMarketplace();
  const [unreadCount, setUnreadCount] = useState(0);

  const userId = session?.userId ?? null;

  const refresh = useCallback(() => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    repository
      .unreadNotificationCount(userId)
      .then(setUnreadCount)
      .catch(() => undefined);
  }, [repository, userId]);

  // Sign-in/out + any cross-screen change (e.g. marking read bumps `revision`).
  useEffect(() => {
    refresh();
  }, [refresh, revision]);

  // Live: a new notification for this user updates the badge with no action.
  useEffect(() => {
    if (!userId) return;
    return repository.subscribeToNotifications(userId, refresh);
  }, [repository, userId, refresh]);

  // Returning to the foreground may have missed a realtime event.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  // Register this device for push once a session exists.
  //
  // Deliberately fire-and-forget: an unsupported platform, a declined OS prompt,
  // or a build without push credentials must leave the app fully usable on the
  // in-app channel. The outcome is cached in the service and surfaced on the
  // notification-preferences screen rather than interrupting the user here.
  useEffect(() => {
    if (!userId) return;
    void syncPushRegistration(userId);
  }, [userId]);

  const value = useMemo<NotificationsContextValue>(
    () => ({ unreadCount, refresh }),
    [unreadCount, refresh],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}

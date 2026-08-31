import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Screen } from "../../src/components/ui/Screen";
import { AppHeader } from "../../src/components/ui/AppHeader";
import { Icon, type IconName } from "../../src/components/ui/Icon";
import {
  LoadingState,
  ErrorState,
  EmptyState,
  DeniedState,
} from "../../src/components/ui/AsyncState";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import type { NotificationRecord } from "../../src/services/marketplace/types";
import { theme, spacing, fontSize, radii } from "../../src/theme";

type LoadState = "loading" | "loaded" | "error";
type FilterTab = "all" | "unread";

function resourceRoute(
  notification: NotificationRecord,
): { pathname: string; params: Record<string, string> } | null {
  if (!notification.resourceId) return null;

  switch (notification.type) {
    case "NEARBY_TASK":
      return { pathname: "/task/[id]", params: { id: notification.resourceId } };
    case "REVIEW_REMINDER":
      return { pathname: "/review/[bookingId]", params: { bookingId: notification.resourceId } };
    default:
      break;
  }

  switch (notification.resourceType) {
    case "booking":
      return { pathname: "/booking/[id]", params: { id: notification.resourceId } };
    case "task":
      return { pathname: "/task/[id]/owned", params: { id: notification.resourceId } };
    default:
      return null;
  }
}

type NotificationStyleMeta = {
  readonly icon: IconName;
  readonly iconColor: string;
  readonly category: string;
};

function getNotificationMeta(notification: NotificationRecord): NotificationStyleMeta {
  switch (notification.type) {
    case "OFFER_RECEIVED":
    case "OFFER_SELECTED":
      return {
        icon: "note",
        iconColor: theme.primary,
        category: "Offer",
      };
    case "PAYMENT_CONFIRMED":
      return {
        icon: "shield",
        iconColor: theme.successSolid,
        category: "Payment",
      };
    case "PAYMENT_FAILED":
      return {
        icon: "alert-circle",
        iconColor: theme.errorSolid,
        category: "Payment",
      };
    case "BOOKING_STARTED":
    case "BOOKING_COMPLETED":
    case "COMPLETION_REQUESTED":
    case "COMPLETION_REMINDER":
      return {
        icon: "calendar",
        iconColor: theme.primary,
        category: "Booking",
      };
    case "REVIEW_RECEIVED":
    case "REVIEW_REMINDER":
      return {
        icon: "star",
        iconColor: "#D97706",
        category: "Review",
      };
    case "DISPUTE_OPENED":
    case "REPORT_RESOLVED":
      return {
        icon: "shield",
        iconColor: "#E11D48",
        category: "Safety",
      };
    case "MESSAGE_RECEIVED":
      return {
        icon: "chat",
        iconColor: theme.primary,
        category: "Message",
      };
    case "NEARBY_TASK":
      return {
        icon: "search",
        iconColor: theme.primary,
        category: "Nearby Task",
      };
    case "VERIFICATION_DECISION":
      return {
        icon: "check-circle",
        iconColor: theme.successSolid,
        category: "Account",
      };
    default:
      return {
        icon: "bell",
        iconColor: theme.primary,
        category: "Update",
      };
  }
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isYesterday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  return (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  );
}

function formatNotificationTime(iso: string): string {
  const d = new Date(iso);
  if (isToday(iso)) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (isYesterday(iso)) {
    return "Yesterday";
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function NotificationsScreen() {
  const { session } = useSession();
  const { repository, revision, notifyChanged } = useMarketplace();
  const [notifications, setNotifications] = useState<ReadonlyArray<NotificationRecord>>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    if (!session) return Promise.resolve();
    setState("loading");
    return repository
      .listNotifications(session.userId)
      .then((result) => {
        setNotifications(result);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [repository, session]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const handleRefresh = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    try {
      const [result] = await Promise.all([
        repository.listNotifications(session.userId),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
      setNotifications(result);
      setState("loaded");
    } finally {
      setRefreshing(false);
    }
  }, [repository, session]);

  useEffect(() => {
    if (!session) return;
    const userId = session.userId;
    return repository.subscribeToNotifications(userId, () => {
      void repository
        .listNotifications(userId)
        .then(setNotifications)
        .catch(() => undefined);
    });
  }, [repository, session]);

  const handleOpen = useCallback(
    async (notification: NotificationRecord) => {
      if (!session) return;
      if (!notification.readAt) {
        await repository.markNotificationRead(notification.id, session.userId);
        notifyChanged();
      }
      const route = resourceRoute(notification);
      if (route) router.push(route as never);
    },
    [session, repository, notifyChanged],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!session) return;
    await repository.markAllNotificationsRead(session.userId);
    notifyChanged();
  }, [session, repository, notifyChanged]);

  if (!session) return <DeniedState description="Sign in to see notifications." />;

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const filteredNotifications = useMemo(() => {
    if (filter === "unread") {
      return notifications.filter((n) => !n.readAt);
    }
    return notifications;
  }, [notifications, filter]);

  const groups = useMemo(() => {
    const today: NotificationRecord[] = [];
    const yesterday: NotificationRecord[] = [];
    const earlier: NotificationRecord[] = [];

    for (const n of filteredNotifications) {
      if (isToday(n.createdAt)) {
        today.push(n);
      } else if (isYesterday(n.createdAt)) {
        yesterday.push(n);
      } else {
        earlier.push(n);
      }
    }

    return [
      { key: "Today", items: today },
      { key: "Yesterday", items: yesterday },
      { key: "Earlier", items: earlier },
    ].filter((g) => g.items.length > 0);
  }, [filteredNotifications]);

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={handleRefresh}
      refreshControlTintColor={theme.primary}
    >
      <AppHeader
        title="Notifications"
        action={
          <Pressable
            onPress={() => router.push("/notification-preferences")}
            accessibilityRole="button"
            accessibilityLabel="Notification settings"
            style={({ pressed }) => [
              styles.headerSettingBtn,
              pressed ? styles.headerSettingBtnPressed : null,
            ]}
          >
            <Icon name="settings" size={20} color={theme.textPrimary} />
          </Pressable>
        }
      />

      {/* Control Bar: Filter Tabs on Left + Mark All Read on Right */}
      <View style={styles.controlBar}>
        <View style={styles.tabPillsContainer} role="tablist">
          <Pressable
            onPress={() => setFilter("all")}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === "all" }}
            accessibilityLabel={`All notifications, ${notifications.length} total`}
            style={({ pressed }) => [
              styles.tabPill,
              filter === "all" ? styles.tabPillActive : null,
              pressed ? styles.tabPillPressed : null,
            ]}
          >
            <Text
              style={[
                styles.tabPillText,
                filter === "all" ? styles.tabPillTextActive : null,
              ]}
            >
              All {notifications.length > 0 ? `(${notifications.length})` : ""}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setFilter("unread")}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === "unread" }}
            accessibilityLabel={`Unread notifications, ${unreadCount} total`}
            style={({ pressed }) => [
              styles.tabPill,
              filter === "unread" ? styles.tabPillActive : null,
              pressed ? styles.tabPillPressed : null,
            ]}
          >
            <Text
              style={[
                styles.tabPillText,
                filter === "unread" ? styles.tabPillTextActive : null,
              ]}
            >
              Unread {unreadCount > 0 ? `(${unreadCount})` : ""}
            </Text>
          </Pressable>
        </View>

        {unreadCount > 0 ? (
          <Pressable
            onPress={handleMarkAllRead}
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
            style={({ pressed }) => [
              styles.markAllButton,
              pressed ? styles.markAllButtonPressed : null,
            ]}
          >
            <Icon name="check-circle" size={13} color={theme.primary} />
            <Text style={styles.markAllButtonText}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      {state === "loading" ? <LoadingState label="Loading notifications" /> : null}
      {state === "error" ? <ErrorState onRetry={load} /> : null}

      {state === "loaded" && notifications.length === 0 ? (
        <EmptyState
          title="You're all caught up"
          description="Updates appear here after your account state changes — verification decisions, new offers, payments, and more."
        />
      ) : null}

      {state === "loaded" && notifications.length > 0 && filteredNotifications.length === 0 ? (
        <EmptyState
          title="No unread notifications"
          description="You're all caught up! Switch back to 'All' to see your previous notification history."
        />
      ) : null}

      {state === "loaded" && filteredNotifications.length > 0 ? (
        <View style={styles.listContainer}>
          {groups.map((group) => (
            <View key={group.key} style={styles.groupSection}>
              <View style={styles.groupHeaderRow}>
                <Text style={styles.groupLabel}>{group.key}</Text>
                <Text style={styles.groupCount}>{group.items.length}</Text>
              </View>

              <View style={styles.groupCardsList}>
                {group.items.map((notification) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    onOpen={handleOpen}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function NotificationCard({
  notification,
  onOpen,
}: {
  readonly notification: NotificationRecord;
  readonly onOpen: (n: NotificationRecord) => void;
}) {
  const unread = !notification.readAt;
  const meta = getNotificationMeta(notification);
  const route = resourceRoute(notification);

  return (
    <Pressable
      onPress={() => onOpen(notification)}
      accessibilityRole="button"
      accessibilityLabel={`${notification.title}, ${notification.body}${unread ? ", unread" : ""}`}
      style={({ pressed }) => [
        styles.card,
        unread ? styles.cardUnread : null,
        pressed ? styles.cardPressed : null,
      ]}
    >
      {unread ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={`notifGrad-${notification.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#F3EEFF" stopOpacity="0.9" />
                <Stop offset="55%" stopColor="#F9F7FE" stopOpacity="0.65" />
                <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.35" />
              </LinearGradient>
            </Defs>
            <Rect
              width="100%"
              height="100%"
              rx={radii.md + 2}
              ry={radii.md + 2}
              fill={`url(#notifGrad-${notification.id})`}
            />
          </Svg>
        </View>
      ) : null}

      <View style={styles.cardContent}>
        {/* Header Row: [Icon] [Title + unread dot] on left, [Time] on right */}
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardHeaderLeft}>
            <Icon name={meta.icon} size={16} color={meta.iconColor} />
            <Text
              style={[styles.cardTitle, unread ? styles.cardTitleUnread : null]}
              numberOfLines={1}
            >
              {notification.title}
            </Text>
            {unread ? <View style={styles.unreadDot} /> : null}
          </View>

          <Text style={styles.cardTimeText}>{formatNotificationTime(notification.createdAt)}</Text>
        </View>

        {/* Description Body: Starts below the icon, full-width aligned */}
        <Text style={styles.cardBody} numberOfLines={2}>
          {notification.body}
        </Text>

        {/* Footer Row: [Category] on left, [View details >] on right */}
        <View style={styles.cardFooterRow}>
          <Text style={styles.cardCategoryText}>{meta.category}</Text>

          {route ? (
            <View style={styles.cardActionRow}>
              <Text style={styles.cardActionText}>View details</Text>
              <Icon name="chevron-right" size={12} color={theme.primary} />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerSettingBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSettingBtnPressed: {
    opacity: 0.6,
  },

  // Filter Bar
  controlBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  tabPillsContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.pill,
    padding: 3,
  },
  tabPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
  },
  tabPillActive: {
    backgroundColor: theme.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabPillPressed: {
    opacity: 0.8,
  },
  tabPillText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: theme.textSecondary,
  },
  tabPillTextActive: {
    color: theme.primary,
    fontWeight: "700",
  },
  markAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
  },
  markAllButtonPressed: {
    opacity: 0.7,
  },
  markAllButtonText: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: theme.primary,
  },

  // Groups
  listContainer: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  groupSection: {
    gap: spacing.xs,
  },
  groupHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: theme.textSecondary,
  },
  groupCount: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  groupCardsList: {
    gap: spacing.sm,
  },

  // Notification Card
  card: {
    backgroundColor: theme.surface,
    borderRadius: radii.md + 2,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
    overflow: "hidden",
    position: "relative",
  },
  cardUnread: {
    borderColor: "rgba(92, 56, 222, 0.22)",
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  cardContent: {
    padding: spacing.md,
    gap: 6,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  cardHeaderLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.textPrimary,
    flexShrink: 1,
  },
  cardTitleUnread: {
    fontWeight: "700",
  },
  unreadDot: {
    width: 6.5,
    height: 6.5,
    borderRadius: 3.25,
    backgroundColor: theme.primary,
  },
  cardTimeText: {
    fontSize: 11.5,
    fontWeight: "500",
    color: theme.textSecondary,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 18.5,
    color: theme.textSecondary,
  },
  cardFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  cardCategoryText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.textSecondary,
  },
  cardActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  cardActionText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: theme.primary,
  },
});


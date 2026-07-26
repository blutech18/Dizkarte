import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "../../src/components/ui/Screen";
import { AppHeader } from "../../src/components/ui/AppHeader";
import { Button } from "../../src/components/ui/Button";
import { Icon, type IconName } from "../../src/components/ui/Icon";
import { LoadingState, ErrorState, EmptyState, DeniedState } from "../../src/components/ui/AsyncState";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import type { NotificationRecord } from "../../src/services/marketplace/types";
import { theme, spacing, fontSize, radii } from "../../src/theme";

type LoadState = "loading" | "loaded" | "error";

function resourceRoute(
  notification: NotificationRecord,
): { pathname: string; params: Record<string, string> } | null {
  if (!notification.resourceId) return null;
  switch (notification.resourceType) {
    case "booking":
      return { pathname: "/booking/[id]", params: { id: notification.resourceId } };
    case "task":
      return { pathname: "/task/[id]/owned", params: { id: notification.resourceId } };
    default:
      return null;
  }
}

/** A real vector icon per notification resource type (never an emoji). */
function iconFor(notification: NotificationRecord): IconName {
  switch (notification.resourceType) {
    case "booking":
      return "calendar";
    case "task":
      return "note";
    case "conversation":
      return "chat";
    case "dispute":
      return "shield";
    case "review":
      return "star";
    default:
      return "bell";
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

function shortTime(iso: string): string {
  const d = new Date(iso);
  return isToday(iso)
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Committed-event in-app notifications, presented as a grouped inbox. */
export default function NotificationsScreen() {
  const { session } = useSession();
  const { repository, revision, notifyChanged } = useMarketplace();
  const [notifications, setNotifications] = useState<ReadonlyArray<NotificationRecord>>([]);
  const [state, setState] = useState<LoadState>("loading");

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    repository
      .listNotifications(session.userId)
      .then((result) => {
        setNotifications(result);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [repository, session]);

  useEffect(() => {
    load();
  }, [load, revision]);

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

  const groups = useMemo(() => {
    const today = notifications.filter((n) => isToday(n.createdAt));
    const earlier = notifications.filter((n) => !isToday(n.createdAt));
    return [
      { key: "Today", items: today },
      { key: "Earlier", items: earlier },
    ].filter((g) => g.items.length > 0);
  }, [notifications]);

  if (!session) return <DeniedState description="Sign in to see notifications." />;

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <Screen>
      <AppHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
        action={
          <Button
            label="Preferences"
            onPress={() => router.push("/notification-preferences")}
            variant="text"
          />
        }
      />

      {unreadCount > 0 ? (
        <View style={styles.markAllRow}>
          <Button label="Mark all read" icon="check-circle" onPress={handleMarkAllRead} variant="text" />
        </View>
      ) : null}

      {state === "loading" ? <LoadingState label="Loading notifications" /> : null}
      {state === "error" ? <ErrorState onRetry={load} /> : null}
      {state === "loaded" && notifications.length === 0 ? (
        <EmptyState
          title="You're all caught up"
          description="Updates appear here after your account state changes — verification decisions, new offers, payments, and more."
        />
      ) : null}

      {state === "loaded" && notifications.length > 0
        ? groups.map((group) => (
            <View key={group.key} style={styles.group}>
              <Text style={styles.groupLabel}>{group.key}</Text>
              <View style={styles.inbox}>
                {group.items.map((notification) => {
                  const unread = !notification.readAt;
                  return (
                    <Pressable
                      key={notification.id}
                      onPress={() => handleOpen(notification)}
                      accessibilityRole="button"
                      accessibilityLabel={`${notification.title}${unread ? ", unread" : ""}`}
                      style={({ pressed }) => [
                        styles.row,
                        unread ? styles.rowUnread : null,
                        pressed ? styles.rowPressed : null,
                      ]}
                    >
                      <View style={[styles.iconCircle, unread ? styles.iconCircleUnread : null]}>
                        <Icon
                          name={iconFor(notification)}
                          size={18}
                          color={unread ? theme.primaryPressed : theme.textSecondary}
                        />
                      </View>
                      <View style={styles.rowBody}>
                        <Text
                          style={[styles.rowTitle, unread ? styles.rowTitleUnread : null]}
                          numberOfLines={1}
                        >
                          {notification.title}
                        </Text>
                        <Text style={styles.rowPreview} numberOfLines={1}>
                          {notification.body}
                        </Text>
                      </View>
                      <View style={styles.rowTrailing}>
                        <Text style={styles.rowTime}>{shortTime(notification.createdAt)}</Text>
                        {unread ? <View style={styles.unreadDot} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))
        : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  markAllRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: spacing.xs },
  group: { marginBottom: spacing.md },
  groupLabel: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: theme.textSecondary,
    marginBottom: spacing.xs,
  },
  inbox: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  rowUnread: { backgroundColor: theme.primarySoft },
  rowPressed: { opacity: 0.85 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleUnread: { backgroundColor: theme.surface },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: fontSize.sm, color: theme.textPrimary },
  rowTitleUnread: { fontWeight: "700" },
  rowPreview: { fontSize: fontSize.xs, color: theme.textSecondary },
  rowTrailing: { alignItems: "flex-end", gap: 6 },
  rowTime: { fontSize: fontSize.xs, color: theme.textSecondary },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary },
});

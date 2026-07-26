import { useCallback, useEffect, useState } from "react";
import { Switch, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { Screen } from "../src/components/ui/Screen";
import { StatusBadge } from "../src/components/ui/StatusBadge";
import { LoadingState, ErrorState, DeniedState } from "../src/components/ui/AsyncState";
import { useSession } from "../src/providers/SessionProvider";
import { useMarketplace } from "../src/providers/MarketplaceProvider";
import type {
  NotificationPreferenceCategory,
  NotificationPreferences,
} from "../src/services/marketplace/types";
import { theme, spacing, fontSize, radii } from "../src/theme";

const CATEGORY_LABELS: Record<NotificationPreferenceCategory, string> = {
  offers: "Offers",
  payments: "Payments",
  bookings: "Bookings",
  messages: "Messages",
  disputes: "Disputes",
  reviews: "Reviews",
};

type LoadState = "loading" | "loaded" | "error";

/**
 * Notification preferences with a truthful push-adapter outcome banner.
 *
 * No production push provider (Firebase/APNs) is configured in this repo —
 * the banner says exactly that ("not configured") rather than implying push
 * notifications are actually being delivered.
 */
export default function NotificationPreferencesScreen() {
  const { session } = useSession();
  const { repository } = useMarketplace();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    repository
      .getNotificationPreferences(session.userId)
      .then((result) => {
        setPreferences(result);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [repository, session]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = useCallback(
    async (category: NotificationPreferenceCategory, channel: "inApp" | "push", value: boolean) => {
      if (!session) return;
      const next = await repository.setNotificationPreference(
        session.userId,
        category,
        channel,
        value,
      );
      setPreferences(next);
    },
    [session, repository],
  );

  if (!session) return <DeniedState description="Sign in to manage notification preferences." />;
  if (state === "loading") return <LoadingState label="Loading preferences" />;
  if (state === "error") return <ErrorState onRetry={load} />;
  if (!preferences) return null;

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: "Notification preferences" }} />

      <View style={styles.pushBanner}>
        <StatusBadge tone="warning" label="Push: not configured" />
        <Text style={styles.pushBannerText}>
          This repo has no production push provider (Firebase/APNs) configured. Push toggles are
          saved as your preference, but no push notification is actually sent — outcomes are always
          reported truthfully rather than pretending delivery succeeded.
        </Text>
      </View>

      {(Object.keys(preferences) as NotificationPreferenceCategory[]).map((category) => (
        <View key={category} style={styles.card}>
          <Text style={styles.cardTitle}>{CATEGORY_LABELS[category]}</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>In-app</Text>
            <Switch
              value={preferences[category].inApp}
              onValueChange={(value) => handleToggle(category, "inApp", value)}
              accessibilityLabel={`${CATEGORY_LABELS[category]} in-app notifications`}
              accessibilityRole="switch"
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Push</Text>
            <Switch
              value={preferences[category].push}
              onValueChange={(value) => handleToggle(category, "push", value)}
              accessibilityLabel={`${CATEGORY_LABELS[category]} push notifications`}
              accessibilityRole="switch"
            />
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pushBanner: {
    backgroundColor: theme.warningSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  pushBannerText: { color: theme.warningOnSoft, fontSize: fontSize.xs },
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  rowLabel: { fontSize: fontSize.sm, color: theme.textPrimary },
});

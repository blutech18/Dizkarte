import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { Screen } from "../src/components/ui/Screen";
import { Icon, type IconName } from "../src/components/ui/Icon";
import { LoadingState, ErrorState } from "../src/components/ui/AsyncState";
import { ProfilePageIntro, ProfilePageSection } from "../src/components/profile/ProfilePageSection";
import { useSession } from "../src/providers/SessionProvider";
import { useMarketplace } from "../src/providers/MarketplaceProvider";
import type {
  NotificationPreferenceCategory,
  NotificationPreferences,
} from "../src/services/marketplace/types";
import { getLastPushRegistrationResult, syncPushRegistration } from "../src/services/push";
import type { PushRegistrationStatus } from "../src/services/push/registration";
import { theme, spacing, fontSize, lineHeight, radii, useResponsiveLayout } from "../src/theme";

const CATEGORY_META: Record<
  NotificationPreferenceCategory,
  { readonly label: string; readonly description: string; readonly icon: IconName }
> = {
  offers: {
    label: "Offers & bids",
    description: "Updates when Taskers submit or change offers on your tasks.",
    icon: "note",
  },
  payments: {
    label: "Payments",
    description: "Payment confirmations, protected-balance releases, and refunds.",
    icon: "wallet",
  },
  bookings: {
    label: "Bookings & work",
    description: "Changes when bookings are accepted, started, or completed.",
    icon: "check-circle",
  },
  messages: {
    label: "Chat & messages",
    description: "New direct messages inside confirmed bookings.",
    icon: "chat",
  },
  disputes: {
    label: "Disputes & support",
    description: "Important support-case and dispute status changes.",
    icon: "shield",
  },
  reviews: {
    label: "Reviews & feedback",
    description: "Ratings and review updates from your booking counterpart.",
    icon: "star",
  },
  nearby: {
    label: "Nearby tasks",
    description: "New tasks posted near your service area.",
    icon: "map-pin",
  },
  promotions: {
    label: "Product updates",
    description: "Occasional Dizkarte features and announcements.",
    icon: "bell",
  },
  safety: {
    label: "Safety alerts",
    description: "Important account-security and marketplace safety notices.",
    icon: "lock",
  },
};

type LoadState = "loading" | "loaded" | "error";
type Channel = "inApp" | "push";

/**
 * What this device's push registration actually is — not a blanket claim.
 *
 * Wave 3B requires truthful delivery copy: the screen previously always said
 * "development mode" regardless of whether the device had registered, which was
 * a guess in both directions. Each state below is a real outcome of
 * `syncPushRegistration`.
 */
const PUSH_NOTICES: Readonly<
  Record<PushRegistrationStatus | "checking", { title: string; description: string }>
> = {
  checking: {
    title: "Checking push delivery on this device",
    description: "Your choices are saved to your account. In-app alerts work immediately.",
  },
  registered: {
    title: "Push is active on this device",
    description:
      "This device is registered for push. Muting a category below stops both the in-app alert and the push.",
  },
  denied: {
    title: "Push is blocked in your device settings",
    description:
      "In-app alerts still work. To receive push, allow notifications for Dizkarte in your device settings.",
  },
  not_configured: {
    title: "Push delivery is not configured yet",
    description:
      "Your choices are saved to your account and in-app alerts work now. Device push starts once the app's push credentials are in place.",
  },
  unsupported: {
    title: "Push is not available on this platform",
    description: "In-app alerts work here. Push delivery is available on the iOS and Android apps.",
  },
  error: {
    title: "Push could not be set up on this device",
    description: "In-app alerts still work. Reopen the app to try registering this device again.",
  },
};

export default function NotificationPreferencesScreen() {
  const { session, status } = useSession();
  const { repository } = useMarketplace();
  const { isTablet } = useResponsiveLayout();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<PushRegistrationStatus | "checking">(
    () => getLastPushRegistrationResult()?.status ?? "checking",
  );
  const pushNotice = PUSH_NOTICES[pushStatus];

  // Registration is attempted by `NotificationsProvider` on sign-in; asking here
  // is idempotent (the service caches the outcome) and covers the case where the
  // user opens this screen before that has resolved.
  useEffect(() => {
    if (!session) return;
    let active = true;
    void syncPushRegistration(session.userId).then((result) => {
      if (active) setPushStatus(result.status);
    });
    return () => {
      active = false;
    };
  }, [session]);

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    setSaveError(null);
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
    async (category: NotificationPreferenceCategory, channel: Channel, value: boolean) => {
      if (!session || !preferences || savingKey) return;
      const previous = preferences;
      const key = `${category}:${channel}`;
      setSavingKey(key);
      setSaveError(null);
      setPreferences({
        ...preferences,
        [category]: { ...preferences[category], [channel]: value },
      });
      try {
        const next = await repository.setNotificationPreference(
          session.userId,
          category,
          channel,
          value,
        );
        setPreferences(next);
      } catch {
        setPreferences(previous);
        setSaveError("That preference could not be saved. Check your connection and try again.");
      } finally {
        setSavingKey(null);
      }
    },
    [preferences, repository, savingKey, session],
  );

  if (status === "loading") return <LoadingState label="Loading" />;
  if (!session) return <Redirect href="/(auth)/welcome" />;

  return (
    <Screen subPageTitle="Notification preferences">
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.content}>
        <ProfilePageIntro
          title="Choose your alerts"
          description="Control which updates appear inside Dizkarte and on your device."
        />

        <View style={styles.modeNotice}>
          <View style={styles.modeHeader}>
            <Icon name="bell" size={20} color={theme.warningOnSoft} />
            <Text style={styles.modeTitle}>{pushNotice.title}</Text>
          </View>
          <Text style={styles.modeDescription}>{pushNotice.description}</Text>
        </View>

        {saveError ? (
          <View style={styles.errorNotice} accessibilityRole="alert">
            <Icon name="alert-circle" size={20} color={theme.errorOnSoft} />
            <Text style={styles.errorText}>{saveError}</Text>
          </View>
        ) : null}

        {state === "loading" ? <LoadingState label="Loading preferences" /> : null}
        {state === "error" ? (
          <ErrorState
            title="Could not load preferences"
            description="Check your connection and try again."
            onRetry={load}
          />
        ) : null}

        {state === "loaded" && preferences ? (
          <View style={[styles.grid, isTablet ? styles.gridTablet : null]}>
            {(Object.keys(preferences) as NotificationPreferenceCategory[]).map((category) => {
              const meta = CATEGORY_META[category];
              return (
                <View
                  key={category}
                  style={[styles.gridItem, isTablet ? styles.gridItemTablet : null]}
                >
                  <ProfilePageSection
                    icon={meta.icon}
                    title={meta.label}
                    description={meta.description}
                  >
                    <PreferenceToggle
                      label="In-app notifications"
                      description="Banners and badge alerts inside Dizkarte"
                      value={preferences[category].inApp}
                      disabled={savingKey !== null}
                      saving={savingKey === `${category}:inApp`}
                      onChange={(value) => void handleToggle(category, "inApp", value)}
                    />
                    <View style={styles.divider} />
                    <PreferenceToggle
                      label="Push notifications"
                      description="Device lock-screen and push-banner alerts"
                      value={preferences[category].push}
                      disabled={savingKey !== null}
                      saving={savingKey === `${category}:push`}
                      onChange={(value) => void handleToggle(category, "push", value)}
                    />
                  </ProfilePageSection>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function PreferenceToggle({
  label,
  description,
  value,
  disabled,
  saving,
  onChange,
}: {
  readonly label: string;
  readonly description: string;
  readonly value: boolean;
  readonly disabled: boolean;
  readonly saving: boolean;
  readonly onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDescription}>
          {saving ? "Saving preference..." : description}
        </Text>
      </View>
      <View style={styles.switchWrap}>
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ false: theme.borderControl, true: theme.primary }}
          thumbColor={theme.surface}
          accessibilityLabel={label}
          accessibilityRole="switch"
          accessibilityState={{ disabled, busy: saving }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  modeNotice: {
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: theme.warningSoft,
  },
  modeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  modeTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "800",
    color: theme.warningOnSoft,
  },
  modeDescription: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.warningOnSoft,
  },
  errorNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: theme.errorSoft,
  },
  errorText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
    color: theme.errorOnSoft,
  },
  grid: {
    gap: spacing.md,
  },
  gridTablet: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  gridItem: {
    minWidth: 0,
  },
  gridItemTablet: {
    flexGrow: 1,
    flexBasis: 300,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  toggleText: {
    flex: 1,
    gap: 3,
    justifyContent: "center",
  },
  toggleLabel: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
    lineHeight: lineHeight.sm,
  },
  toggleDescription: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
  },
  switchWrap: {
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  divider: {
    height: 1,
    marginVertical: spacing.sm,
    backgroundColor: theme.borderSubtle,
  },
});

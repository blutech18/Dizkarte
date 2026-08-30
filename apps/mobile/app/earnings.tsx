import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, Stack } from "expo-router";
import { formatPhpSigned } from "@dizkarte/domain";
import { Screen } from "../src/components/ui/Screen";
import { Button } from "../src/components/ui/Button";
import { Icon, type IconName } from "../src/components/ui/Icon";
import { ErrorState, LoadingState } from "../src/components/ui/AsyncState";
import { WithdrawalPanel } from "../src/components/task/WithdrawalPanel";
import { MyOfferHistoryList } from "../src/components/task/MyOfferHistoryList";
import { TaskerApplicationPrompt } from "../src/components/task/TaskerApplicationPrompt";
import { useSession } from "../src/providers/SessionProvider";
import { useMarketplace } from "../src/providers/MarketplaceProvider";
import { isApprovedTasker } from "../src/services/session-types";
import type { TaskerWorkSnapshot } from "../src/services/marketplace/types";
import { theme, spacing, fontSize, radii } from "../src/theme";

type LoadState = "loading" | "loaded" | "error";

/**
 * Earnings & payouts.
 *
 * There is no separate "Tasker dashboard": every account signs in as a Client
 * and the same person can also work as a Tasker, so the tabs (Home, Browse,
 * My Tasks, Bookings, Profile) are the same for everyone. Only the things that
 * are genuinely earning-side — the ledger-derived balance, payouts, and the
 * offers this user has submitted — live here, reached from Profile.
 *
 * Work queues are deliberately not repeated: available work is the Browse tab
 * and every booking (as Client or as Tasker) is the Bookings tab.
 */
export default function EarningsScreen() {
  const { session } = useSession();

  // Earning requires an approved Tasker application. Same on-ramp the Browse
  // tab uses, so "become a Tasker" is never a dead end.
  if (!isApprovedTasker(session)) {
    return (
      <Screen scroll subPageTitle="Earnings & payouts">
        <Stack.Screen options={{ headerShown: false }} />
        <TaskerApplicationPrompt
          standalone={false}
          title="Turn your skills into income"
          description="Create and complete your Tasker application to start earning, track completed jobs, and manage your payouts."
        />
      </Screen>
    );
  }

  return (
    <Screen scroll subPageTitle="Earnings & payouts">
      <Stack.Screen options={{ headerShown: false }} />
      <EarningsContent />
    </Screen>
  );
}

function EarningsContent() {
  const { session } = useSession();
  const { repository, revision } = useMarketplace();
  const [snapshot, setSnapshot] = useState<TaskerWorkSnapshot | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [withdrawalPanelOpen, setWithdrawalPanelOpen] = useState(false);

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    repository
      .getTaskerWorkSnapshot(session.userId)
      .then((result) => {
        setSnapshot(result);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [repository, session]);

  useEffect(() => {
    load();
  }, [load, revision]);

  if (!session) return null;
  if (state === "loading") return <LoadingState label="Loading your earnings" />;
  if (state === "error") return <ErrorState onRetry={load} />;
  if (!snapshot) return null;

  const { ledger } = snapshot;
  const ratingLabel = snapshot.ratingAverage !== null ? snapshot.ratingAverage.toFixed(1) : "—";

  return (
    <View style={styles.container}>
      {/* Balance hero — the primary figure + its one action. */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available balance</Text>
        {/*
          Ledger figures are derived sums, not amounts being created, so they
          are formatted signed: a ledger anomaly shows as a negative figure
          instead of throwing and taking the screen down.
        */}
        <Text style={styles.balanceValue}>{formatPhpSigned(ledger.availableCentavos)}</Text>
        <Button
          label="Withdraw"
          icon="wallet"
          variant="secondary"
          fullWidth
          onPress={() => setWithdrawalPanelOpen(true)}
        />
        <View style={styles.miniGrid}>
          <MiniStat label="Protected" value={formatPhpSigned(ledger.protectedCentavos)} />
          <MiniStat label="Pending" value={formatPhpSigned(ledger.pendingCentavos)} />
          <MiniStat label="Reserved" value={formatPhpSigned(ledger.reservedCentavos)} />
          <MiniStat label="Withdrawn" value={formatPhpSigned(ledger.withdrawnCentavos)} />
        </View>
        <Text style={styles.balanceCaption}>
          Balances are derived from the platform ledger and update as work is confirmed. Payouts
          become available once a payout provider is approved.
        </Text>
      </View>

      <View style={styles.tileRow}>
        <StatTile
          label="Completed"
          value={String(snapshot.completedWork.length)}
          icon="check-circle"
        />
        <StatTile label="Rating" value={ratingLabel} icon="star" />
      </View>
      <View style={styles.tileRow}>
        <StatTile label="Reviews" value={String(snapshot.ratingCount)} icon="chat" />
        <StatTile
          label="All-time done"
          value={String(snapshot.completionCount)}
          icon="check-circle"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your offer history</Text>
        <Text style={styles.caption}>Every offer you have submitted, across all tasks.</Text>
        <MyOfferHistoryList
          taskerId={session.userId}
          emptyTitle="No offers submitted yet"
          emptyDescription="Offers you submit on any task will appear here."
        />
      </View>

      <Button
        label="See all your bookings"
        icon="calendar"
        variant="secondary"
        fullWidth
        onPress={() => router.push("/(tabs)/bookings")}
      />
      <Button
        label="Browse available work"
        icon="search"
        variant="secondary"
        fullWidth
        onPress={() => router.push("/(tabs)/browse")}
      />

      <WithdrawalPanel
        visible={withdrawalPanelOpen}
        onClose={() => setWithdrawalPanelOpen(false)}
        availableCentavos={ledger.availableCentavos}
        payoutProviderAvailable={snapshot.payoutProviderAvailable}
        onSettled={load}
      />
    </View>
  );
}

function MiniStat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text
        style={styles.miniStatLabel}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>
      <Text
        style={styles.miniStatValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {value}
      </Text>
    </View>
  );
}

function StatTile({
  label,
  value,
  icon,
}: {
  readonly label: string;
  readonly value: string;
  readonly icon: IconName;
}) {
  return (
    <View
      style={styles.statTile}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
    >
      <View style={styles.statTileHeader}>
        <Text
          style={styles.statLabel}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {label}
        </Text>
        <Icon name={icon} size={18} color={theme.primary} />
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  balanceCard: {
    backgroundColor: theme.primary,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
    elevation: 8,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  balanceLabel: { fontSize: fontSize.md, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  balanceValue: {
    fontSize: 38,
    fontWeight: "800",
    color: theme.onPrimary,
    marginBottom: spacing.xs,
  },
  balanceCaption: { fontSize: fontSize.xs, color: "rgba(255,255,255,0.7)", marginTop: spacing.xs },
  miniGrid: {
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: spacing.sm,
  },
  miniStat: { width: "50%", minWidth: 0, paddingVertical: spacing.xs },
  miniStatLabel: {
    minWidth: 0,
    fontSize: fontSize.xs,
    color: "rgba(255,255,255,0.7)",
  },
  miniStatValue: {
    minWidth: 0,
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.onPrimary,
  },

  tileRow: { minWidth: 0, flexDirection: "row", gap: spacing.sm },
  statTile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: theme.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  statTileHeader: {
    minWidth: 0,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  statValue: {
    minWidth: 0,
    fontSize: fontSize.xxl,
    fontWeight: "800",
    color: theme.textPrimary,
    marginTop: 2,
  },
  statLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    fontWeight: "600",
  },

  section: {
    backgroundColor: theme.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: "800", color: theme.textPrimary },
  caption: { fontSize: fontSize.xs, color: theme.textSecondary },
});

import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { formatPhp } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { AppHeader } from "../../src/components/ui/AppHeader";
import { Button } from "../../src/components/ui/Button";
import { StatusBadge, type BadgeTone } from "../../src/components/ui/StatusBadge";
import { Icon, type IconName } from "../../src/components/ui/Icon";
import { ErrorState, LoadingState } from "../../src/components/ui/AsyncState";
import { ClientMyTasks } from "../../src/components/task/ClientMyTasks";
import { WithdrawalPanel } from "../../src/components/task/WithdrawalPanel";
import { MyOfferHistoryList } from "../../src/components/task/MyOfferHistoryList";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { isApprovedTasker, isClient } from "../../src/services/session-types";
import type { BookingRecord, TaskerDashboardSnapshot } from "../../src/services/marketplace/types";
import { theme, spacing, fontSize, radii } from "../../src/theme";

/**
 * Capability-aware work tab: Client task management or Tasker Dashboard.
 */
export default function WorkScreen() {
  const { session } = useSession();

  if (isApprovedTasker(session)) {
    return <TaskerDashboard />;
  }
  if (isClient(session)) {
    return (
      <Screen>
        <ClientMyTasks />
      </Screen>
    );
  }
  return <TaskerApplicationPrompt />;
}

type LoadState = "loading" | "loaded" | "error";

const BOOKING_STATUS_TONE: Record<BookingRecord["status"], BadgeTone> = {
  PAYMENT_PENDING: "warning",
  PAYMENT_FAILED: "error",
  CONFIRMED: "info",
  IN_PROGRESS: "info",
  COMPLETION_REQUESTED: "warning",
  COMPLETED: "success",
  CANCELLED: "neutral",
  DISPUTED: "error",
  REFUNDED: "neutral",
};

const BOOKING_STATUS_LABEL: Record<BookingRecord["status"], string> = {
  PAYMENT_PENDING: "Payment pending",
  PAYMENT_FAILED: "Payment failed",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In progress",
  COMPLETION_REQUESTED: "Completion requested",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DISPUTED: "Disputed",
  REFUNDED: "Refunded",
};

/**
 * Stats-first Tasker Dashboard.
 *
 * The top of the screen is a balance hero + at-a-glance stat tiles (so it
 * reads like a dashboard, not another task list). Below that are compact work
 * sections. Browsing available work lives on the Tasker Home feed, so the
 * dashboard links there rather than repeating the feed. Every figure is read
 * from `getTaskerDashboard` — no static placeholders.
 */
function TaskerDashboard() {
  const { session } = useSession();
  const { repository, revision } = useMarketplace();
  const [snapshot, setSnapshot] = useState<TaskerDashboardSnapshot | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [withdrawalPanelOpen, setWithdrawalPanelOpen] = useState(false);

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    repository
      .getTaskerDashboard(session.userId)
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
  if (state === "loading") return <LoadingState label="Loading your dashboard" />;
  if (state === "error") return <ErrorState onRetry={load} />;
  if (!snapshot) return null;

  const { ledger } = snapshot;
  const ratingLabel = snapshot.ratingAverage !== null ? snapshot.ratingAverage.toFixed(1) : "—";

  return (
    <Screen>
      <AppHeader title="Tasker Dashboard" subtitle="Your earnings and work at a glance" />

      {/* Balance hero — the primary dashboard figure + action. */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceHeaderRow}>
          <Text style={styles.balanceLabel}>Available balance</Text>
          <StatusBadge tone="warning" label="Sandbox data" />
        </View>
        <Text style={styles.balanceValue}>{formatPhp(ledger.availableCentavos)}</Text>
        <Button
          label="Withdraw"
          icon="wallet"
          fullWidth
          onPress={() => setWithdrawalPanelOpen(true)}
        />
        <View style={styles.miniGrid}>
          <MiniStat label="Protected" value={formatPhp(ledger.protectedCentavos)} />
          <MiniStat label="Pending" value={formatPhp(ledger.pendingCentavos)} />
          <MiniStat label="Reserved" value={formatPhp(ledger.reservedCentavos)} />
          <MiniStat label="Withdrawn" value={formatPhp(ledger.withdrawnCentavos)} />
        </View>
        <Text style={styles.caption}>
          Development-only projection mirroring the production ledger categories (pending,
          protected, available, reserved, withdrawn). The backend ledger stays authoritative once
          wired.
        </Text>
      </View>

      {/* At-a-glance stat tiles. */}
      <View style={styles.tileRow}>
        <StatTile
          label="Available work"
          value={String(snapshot.availableWork.length)}
          icon="briefcase"
          onPress={() => router.push("/(tabs)/home")}
        />
        <StatTile label="Active" value={String(snapshot.activeBookings.length)} icon="calendar" />
        <StatTile label="Completed" value={String(snapshot.completedWork.length)} icon="check-circle" />
      </View>
      <View style={styles.tileRow}>
        <StatTile label="Rating" value={ratingLabel} icon="star" />
        <StatTile label="Reviews" value={String(snapshot.ratingCount)} icon="chat" />
        <StatTile label="All-time done" value={String(snapshot.completionCount)} icon="check-circle" />
      </View>

      <Button
        label="Browse available work"
        icon="search"
        variant="secondary"
        fullWidth
        onPress={() => router.push("/(tabs)/home")}
      />

      {/* Compact work sections. */}
      <WorkSection
        title="Active work"
        count={snapshot.activeBookings.length}
        emptyText="Bookings you are confirmed for will appear here."
        bookings={snapshot.activeBookings}
      />
      <WorkSection
        title="Awaiting client confirmation"
        count={snapshot.completionRequested.length}
        emptyText="Work you mark complete appears here until the client confirms it."
        bookings={snapshot.completionRequested}
      />
      <WorkSection
        title="Completed work"
        count={snapshot.completedWork.length}
        emptyText="Finished and confirmed bookings appear here."
        bookings={snapshot.completedWork}
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your offer history</Text>
        <Text style={styles.caption}>Every offer you have submitted, across all tasks.</Text>
        <MyOfferHistoryList
          taskerId={session.userId}
          emptyTitle="No offers submitted yet"
          emptyDescription="Offers you submit on any task will appear here."
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile & verification</Text>
        <View style={styles.badgeRow}>
          {session.verificationStatus === "APPROVED" ? (
            <StatusBadge tone="success" icon="check-circle" label="Identity verified" />
          ) : (
            <StatusBadge tone="warning" label={`Identity: ${session.verificationStatus}`} />
          )}
          <StatusBadge tone="success" icon="shield" label="Tasker approved" />
        </View>
      </View>

      <WithdrawalPanel
        visible={withdrawalPanelOpen}
        onClose={() => setWithdrawalPanelOpen(false)}
        availableCentavos={ledger.availableCentavos}
        payoutProviderAvailable={snapshot.payoutProviderAvailable}
        onSettled={load}
      />
    </Screen>
  );
}

function MiniStat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatLabel}>{label}</Text>
      <Text style={styles.miniStatValue}>{value}</Text>
    </View>
  );
}

function StatTile({
  label,
  value,
  icon,
  onPress,
}: {
  readonly label: string;
  readonly value: string;
  readonly icon: IconName;
  readonly onPress?: () => void;
}) {
  const content = (
    <>
      <Icon name={icon} size={18} color={theme.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        onPress={onPress}
        style={({ pressed }) => [styles.statTile, pressed ? styles.statTilePressed : null]}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View style={styles.statTile} accessibilityRole="text" accessibilityLabel={`${label}: ${value}`}>
      {content}
    </View>
  );
}

function WorkSection({
  title,
  count,
  emptyText,
  bookings,
}: {
  readonly title: string;
  readonly count: number;
  readonly emptyText: string;
  readonly bookings: ReadonlyArray<BookingRecord>;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {title} ({count})
      </Text>
      {bookings.length === 0 ? (
        <Text style={styles.sectionEmptyText}>{emptyText}</Text>
      ) : (
        bookings.map((booking) => <BookingRow key={booking.id} booking={booking} />)
      )}
    </View>
  );
}

function BookingRow({ booking }: { readonly booking: BookingRecord }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/booking/[id]", params: { id: booking.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${booking.taskTitle}, ${formatPhp(booking.agreedCentavos)}, ${BOOKING_STATUS_LABEL[booking.status]}`}
      style={styles.listRow}
    >
      <View style={styles.listRowTextGroup}>
        <Text style={styles.listRowTitle} numberOfLines={1}>
          {booking.taskTitle}
        </Text>
        <StatusBadge
          tone={BOOKING_STATUS_TONE[booking.status] ?? "neutral"}
          label={BOOKING_STATUS_LABEL[booking.status] ?? booking.status}
        />
      </View>
      <Text style={styles.listRowMeta}>{formatPhp(booking.agreedCentavos)}</Text>
    </Pressable>
  );
}

function TaskerApplicationPrompt() {
  return (
    <Screen>
      <AppHeader title="Become a Tasker" />
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>Apply to start earning</Text>
        <Text style={styles.emptyCaption}>
          Submit your specialties, service areas, and experience. Admin reviews every application
          manually.
        </Text>
        <Link href="/tasker-application" asChild>
          <Button label="Start application" onPress={() => {}} />
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Balance hero
  balanceCard: {
    backgroundColor: theme.surfaceBrand,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  balanceHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balanceLabel: { fontSize: fontSize.sm, color: theme.textSecondary, fontWeight: "600" },
  balanceValue: { fontSize: 34, fontWeight: "800", color: theme.textPrimary, marginBottom: spacing.xs },
  miniGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: spacing.sm,
  },
  miniStat: { width: "50%", paddingVertical: spacing.xs },
  miniStatLabel: { fontSize: fontSize.xs, color: theme.textSecondary },
  miniStatValue: { fontSize: fontSize.md, fontWeight: "700", color: theme.textPrimary },

  // Stat tiles
  tileRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  statTile: {
    flex: 1,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: "flex-start",
    gap: 2,
  },
  statTilePressed: { backgroundColor: theme.surfaceSubtle },
  statValue: { fontSize: fontSize.xl, fontWeight: "800", color: theme.textPrimary },
  statLabel: { fontSize: fontSize.xs, color: theme.textSecondary },

  // Sections
  section: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: { fontSize: fontSize.md, fontWeight: "700", color: theme.textPrimary },
  sectionEmptyText: { fontSize: fontSize.sm, color: theme.textSecondary },
  caption: { fontSize: fontSize.xs, color: theme.textSecondary },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },

  // Booking rows
  listRow: {
    minHeight: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  listRowTextGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 1,
  },
  listRowTitle: { fontSize: fontSize.sm, color: theme.textPrimary, flexShrink: 1 },
  listRowMeta: { fontSize: fontSize.sm, fontWeight: "700", color: theme.textPrimary },

  // Application prompt
  emptyCard: {
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: theme.textPrimary,
    textAlign: "center",
  },
  emptyCaption: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    textAlign: "center",
  },
});

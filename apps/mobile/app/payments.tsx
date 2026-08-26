import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect, Stack, router } from "expo-router";
import { formatPhp } from "@dizkarte/domain";
import { Screen } from "../src/components/ui/Screen";
import { Icon } from "../src/components/ui/Icon";
import { StatusBadge } from "../src/components/ui/StatusBadge";
import { ErrorState, LoadingState, EmptyState } from "../src/components/ui/AsyncState";
import { useSession } from "../src/providers/SessionProvider";
import { useMarketplace } from "../src/providers/MarketplaceProvider";
import type { BookingRecord } from "../src/services/marketplace/types";
import {
  bookingsForDirection,
  settlementLabel,
  settlementStateFor,
  settlementTone,
  totalsFor,
  type PaymentDirection,
} from "../src/components/payments/paymentHistory";
import { theme, spacing, fontSize, lineHeight, radii } from "../src/theme";

type LoadState = "loading" | "loaded" | "error";

/**
 * Payment history — money in (Earned) and money out (Outgoing).
 *
 * One account can be both a Client and a Tasker, so the same history carries
 * both sides and the tabs separate them. Every row and total is derived from a
 * real booking's agreed amount and its authoritative status; a booking whose
 * payment never cleared is listed with that stated plainly and is excluded from
 * the totals, so a figure here never implies money that did not move.
 *
 * No platform-fee or tax line is shown: neither is exposed to the mobile client
 * and the tax model is not yet approved, so the screen says so rather than
 * presenting an invented split.
 */
export default function PaymentHistoryScreen() {
  const { session, status } = useSession();
  const { repository, revision } = useMarketplace();

  const [bookings, setBookings] = useState<ReadonlyArray<BookingRecord>>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [direction, setDirection] = useState<PaymentDirection>("outgoing");

  const viewerId = session?.userId ?? null;

  const load = useCallback(() => {
    if (!viewerId) return;
    setState("loading");
    repository
      .listMyBookings(viewerId)
      .then((result) => {
        setBookings(result);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [repository, viewerId]);

  useEffect(() => {
    load();
  }, [load, revision]);

  const earnedCount = useMemo(
    () => (viewerId ? bookingsForDirection(bookings, viewerId, "earned").length : 0),
    [bookings, viewerId],
  );
  const outgoingCount = useMemo(
    () => (viewerId ? bookingsForDirection(bookings, viewerId, "outgoing").length : 0),
    [bookings, viewerId],
  );

  const rows = useMemo(
    () => (viewerId ? bookingsForDirection(bookings, viewerId, direction) : []),
    [bookings, viewerId, direction],
  );
  const totals = useMemo(
    () =>
      viewerId
        ? totalsFor(bookings, viewerId, direction)
        : { releasedCentavos: 0, protectedCentavos: 0 },
    [bookings, viewerId, direction],
  );

  if (status === "loading") {
    return (
      <Screen subPageTitle="Payment history">
        <LoadingState label="Loading" />
      </Screen>
    );
  }
  if (!session) return <Redirect href="/(auth)/welcome" />;

  return (
    <Screen subPageTitle="Payment history">
      <Stack.Screen options={{ headerShown: false }} />

      {state === "loading" ? <LoadingState label="Loading your payment history" /> : null}
      {state === "error" ? <ErrorState title="Could not load payments" onRetry={load} /> : null}

      {state === "loaded" ? (
        <View style={styles.content}>
          <View style={styles.tabBar} accessibilityRole="tablist">
            <DirectionTab
              label="Earned"
              count={earnedCount}
              active={direction === "earned"}
              onPress={() => setDirection("earned")}
            />
            <DirectionTab
              label="Outgoing"
              count={outgoingCount}
              active={direction === "outgoing"}
              onPress={() => setDirection("outgoing")}
            />
          </View>

          {/* Totals, counting only payments that actually cleared. */}
          <View style={styles.totalsCard}>
            <Text style={styles.totalsEyebrow}>
              {direction === "earned" ? "RELEASED TO YOU" : "PAID OUT"}
            </Text>
            <Text style={styles.totalsValue}>{formatPhp(totals.releasedCentavos)}</Text>
            <View style={styles.totalsDivider} />
            <View style={styles.totalsRow}>
              <Text style={styles.totalsRowLabel}>
                {direction === "earned" ? "Protected until completion" : "Still held by platform"}
              </Text>
              <Text style={styles.totalsRowValue}>{formatPhp(totals.protectedCentavos)}</Text>
            </View>
            <Text style={styles.totalsCaption}>
              Amounts are the agreed booking price. A fee and tax breakdown will appear here once
              the platform&apos;s charging model is approved and configured.
            </Text>
          </View>

          {rows.length === 0 ? (
            <EmptyState
              title={direction === "earned" ? "No earnings yet" : "No payments yet"}
              description={
                direction === "earned"
                  ? "Bookings you complete as a Tasker will appear here."
                  : "Bookings you pay for as a Client will appear here."
              }
            />
          ) : (
            <View style={styles.list}>
              {rows.map((booking) => (
                <PaymentRow key={booking.id} booking={booking} direction={direction} />
              ))}
            </View>
          )}
        </View>
      ) : null}
    </Screen>
  );
}

function DirectionTab({
  label,
  count,
  active,
  onPress,
}: {
  readonly label: string;
  readonly count: number;
  readonly active: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${count} ${count === 1 ? "booking" : "bookings"}`}
      style={({ pressed }) => [
        styles.tab,
        active ? styles.tabActive : null,
        pressed ? { opacity: 0.85 } : null,
      ]}
    >
      <Text style={[styles.tabLabel, active ? styles.tabLabelActive : null]}>{label}</Text>
      <View style={[styles.tabCount, active ? styles.tabCountActive : null]}>
        <Text style={[styles.tabCountText, active ? styles.tabCountTextActive : null]}>
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

function PaymentRow({
  booking,
  direction,
}: {
  readonly booking: BookingRecord;
  readonly direction: PaymentDirection;
}) {
  const settlement = settlementStateFor(booking.status);
  const counterpart =
    direction === "earned" ? booking.clientDisplayName : booking.taskerDisplayName;

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/receipt/[bookingId]", params: { bookingId: booking.id } })
      }
      accessibilityRole="button"
      accessibilityLabel={`${booking.taskTitle}, ${formatPhp(booking.agreedCentavos)}, ${settlementLabel(settlement, direction)}`}
      accessibilityHint="Opens the receipt for this booking"
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {booking.taskTitle}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {direction === "earned" ? "From" : "To"} {counterpart || "—"} ·{" "}
          {shortDate(booking.createdAt)}
        </Text>
        <StatusBadge
          tone={settlementTone(settlement)}
          label={settlementLabel(settlement, direction)}
        />
      </View>
      <View style={styles.rowTrailing}>
        <Text style={styles.rowAmount}>{formatPhp(booking.agreedCentavos)}</Text>
        <Icon name="arrow-right" size={14} color={theme.textSecondary} />
      </View>
    </Pressable>
  );
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  tabBar: {
    minWidth: 0,
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md,
    padding: 4,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radii.sm,
  },
  tabActive: {
    backgroundColor: theme.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabLabel: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textSecondary,
  },
  tabLabelActive: {
    color: theme.primary,
  },
  tabCount: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.pill,
    backgroundColor: theme.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCountActive: {
    backgroundColor: theme.primarySoft,
  },
  tabCountText: {
    fontSize: fontSize.xs,
    fontWeight: "800",
    color: theme.textSecondary,
  },
  tabCountTextActive: {
    color: theme.primaryPressed,
  },
  totalsCard: {
    backgroundColor: theme.primary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  totalsEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "rgba(255,255,255,0.8)",
  },
  totalsValue: {
    fontSize: 34,
    fontWeight: "800",
    color: theme.onPrimary,
  },
  totalsDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginVertical: spacing.sm,
  },
  totalsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  totalsRowLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "600",
  },
  totalsRowValue: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.onPrimary,
  },
  totalsCaption: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: "rgba(255,255,255,0.7)",
    marginTop: spacing.sm,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  rowPressed: {
    backgroundColor: theme.surfaceSubtle,
    transform: [{ scale: 0.995 }],
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  rowTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  rowMeta: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
  },
  rowTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 0,
  },
  rowAmount: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.textPrimary,
  },
});

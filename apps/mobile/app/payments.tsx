import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  // Tab indicator & synchronized content sliding animation (0 = earned, 1 = outgoing)
  const slideAnim = useRef(new Animated.Value(direction === "earned" ? 0 : 1)).current;

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

  function handleTabChange(next: PaymentDirection) {
    if (next === direction) return;
    setDirection(next);
    const toVal = next === "earned" ? 0 : 1;

    Animated.spring(slideAnim, {
      toValue: toVal,
      damping: 22,
      stiffness: 240,
      mass: 0.8,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }

  const earnedRows = useMemo(
    () => (viewerId ? bookingsForDirection(bookings, viewerId, "earned") : []),
    [bookings, viewerId],
  );
  const outgoingRows = useMemo(
    () => (viewerId ? bookingsForDirection(bookings, viewerId, "outgoing") : []),
    [bookings, viewerId],
  );

  const earnedTotals = useMemo(
    () =>
      viewerId
        ? totalsFor(bookings, viewerId, "earned")
        : { releasedCentavos: 0, protectedCentavos: 0 },
    [bookings, viewerId],
  );
  const outgoingTotals = useMemo(
    () =>
      viewerId
        ? totalsFor(bookings, viewerId, "outgoing")
        : { releasedCentavos: 0, protectedCentavos: 0 },
    [bookings, viewerId],
  );

  if (status === "loading") {
    return (
      <Screen subPageTitle="Payment history">
        <LoadingState label="Loading" />
      </Screen>
    );
  }
  if (!session) return <Redirect href="/(auth)/welcome" />;

  const tabWidth = tabBarWidth > 0 ? (tabBarWidth - 8) / 2 : 0;

  return (
    <Screen subPageTitle="Payment history">
      <Stack.Screen options={{ headerShown: false }} />

      {state === "loading" ? <LoadingState label="Loading your payment history" /> : null}
      {state === "error" ? <ErrorState title="Could not load payments" onRetry={load} /> : null}

      {state === "loaded" ? (
        <View style={styles.content}>
          <View
            style={styles.tabBar}
            accessibilityRole="tablist"
            onLayout={(e) => setTabBarWidth(e.nativeEvent.layout.width)}
          >
            {/* Sliding Pill Indicator */}
            {tabWidth > 0 && (
              <Animated.View
                style={[
                  styles.tabIndicator,
                  {
                    width: tabWidth,
                    transform: [
                      {
                        translateX: slideAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, tabWidth],
                        }),
                      },
                    ],
                  },
                ]}
                pointerEvents="none"
              />
            )}

            <DirectionTab
              label="Earned"
              count={earnedRows.length}
              active={direction === "earned"}
              onPress={() => handleTabChange("earned")}
            />
            <DirectionTab
              label="Outgoing"
              count={outgoingRows.length}
              active={direction === "outgoing"}
              onPress={() => handleTabChange("outgoing")}
            />
          </View>

          {/* Synchronized Pager Viewport */}
          <View
            style={styles.slidingContainer}
            onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
          >
            {containerWidth > 0 ? (
              <Animated.View
                style={[
                  styles.slidingTrack,
                  {
                    width: containerWidth * 2,
                    transform: [
                      {
                        translateX: slideAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -containerWidth],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View
                  style={[styles.paneWrapper, { width: containerWidth }]}
                  pointerEvents={direction === "earned" ? "auto" : "none"}
                >
                  <PaymentDirectionPane
                    direction="earned"
                    totals={earnedTotals}
                    rows={earnedRows}
                  />
                </View>
                <View
                  style={[styles.paneWrapper, { width: containerWidth }]}
                  pointerEvents={direction === "outgoing" ? "auto" : "none"}
                >
                  <PaymentDirectionPane
                    direction="outgoing"
                    totals={outgoingTotals}
                    rows={outgoingRows}
                  />
                </View>
              </Animated.View>
            ) : (
              <PaymentDirectionPane
                direction={direction}
                totals={direction === "earned" ? earnedTotals : outgoingTotals}
                rows={direction === "earned" ? earnedRows : outgoingRows}
              />
            )}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function PaymentDirectionPane({
  direction,
  totals,
  rows,
}: {
  readonly direction: PaymentDirection;
  readonly totals: { readonly releasedCentavos: number; readonly protectedCentavos: number };
  readonly rows: ReadonlyArray<BookingRecord>;
}) {
  return (
    <View style={styles.pane}>
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
          Amounts are the agreed booking price. A fee and tax breakdown will appear here once the
          platform&apos;s charging model is approved and configured.
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
      <View style={styles.cardBody}>
        <Text style={styles.rowTitle}>
          {booking.taskTitle}
        </Text>
        <View style={styles.rowMetaRow}>
          <Text style={styles.rowMetaLeft} numberOfLines={1}>
            {direction === "earned" ? "From" : "To"} {counterpart || "—"}
          </Text>
          <Text style={styles.rowMetaDate}>
            {shortDate(booking.createdAt)}
          </Text>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <StatusBadge
          tone={settlementTone(settlement)}
          label={settlementLabel(settlement, direction)}
        />
        <View style={styles.amountContainer}>
          <Text style={styles.rowAmount}>{formatPhp(booking.agreedCentavos)}</Text>
          <Icon name="arrow-right" size={14} color={theme.textSecondary} />
        </View>
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
  slidingContainer: {
    width: "100%",
    overflow: "hidden",
  },
  slidingTrack: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  paneWrapper: {
    flexShrink: 0,
  },
  pane: {
    width: "100%",
    gap: spacing.md,
  },
  tabBar: {
    position: "relative",
    minWidth: 0,
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md,
    padding: 4,
  },
  tabIndicator: {
    position: "absolute",
    top: 4,
    left: 4,
    bottom: 4,
    backgroundColor: theme.surface,
    borderRadius: radii.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    zIndex: 0,
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
    zIndex: 1,
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
    gap: spacing.md,
  },
  row: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.md,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  rowPressed: {
    backgroundColor: theme.surfaceSubtle,
    borderColor: theme.borderControl,
    transform: [{ scale: 0.995 }],
  },
  cardBody: {
    gap: 6,
  },
  rowTitle: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: "700",
    color: theme.textPrimary,
  },
  rowMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowMetaLeft: {
    flex: 1,
    fontSize: fontSize.xs,
    color: theme.textSecondary,
  },
  rowMetaDate: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    textAlign: "right",
    flexShrink: 0,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  amountContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  rowAmount: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.textPrimary,
  },
});



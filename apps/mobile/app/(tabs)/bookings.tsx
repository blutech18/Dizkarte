import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type { BookingStatus } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { AppHeader } from "../../src/components/ui/AppHeader";
import { StatusBadge, type BadgeTone } from "../../src/components/ui/StatusBadge";
import { Icon } from "../../src/components/ui/Icon";
import { LoadingState, ErrorState, EmptyState } from "../../src/components/ui/AsyncState";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import type { BookingRecord } from "../../src/services/marketplace/types";
import { theme, spacing, fontSize, radii } from "../../src/theme";

/** The happy-path booking timeline. Terminal states render as a status, not a step. */
const STEP_LABELS = ["Payment", "In progress", "Completion", "Released"] as const;

type StepView =
  | { readonly kind: "step"; readonly index: number; readonly hint: string; readonly actionable: boolean }
  | { readonly kind: "terminal"; readonly tone: BadgeTone; readonly label: string; readonly hint: string };

function stepView(status: BookingStatus): StepView {
  switch (status) {
    case "PAYMENT_PENDING":
      return { kind: "step", index: 0, hint: "Complete payment to confirm this booking.", actionable: true };
    case "CONFIRMED":
      return { kind: "step", index: 1, hint: "Chat is open — coordinate the work.", actionable: true };
    case "IN_PROGRESS":
      return { kind: "step", index: 1, hint: "Work is in progress.", actionable: false };
    case "COMPLETION_REQUESTED":
      return { kind: "step", index: 2, hint: "Confirm completion to release funds.", actionable: true };
    case "COMPLETED":
      return { kind: "step", index: 3, hint: "Completed and funds released.", actionable: false };
    case "PAYMENT_FAILED":
      return { kind: "terminal", tone: "error", label: "Payment failed", hint: "Payment did not go through." };
    case "CANCELLED":
      return { kind: "terminal", tone: "neutral", label: "Cancelled", hint: "This booking was cancelled." };
    case "DISPUTED":
      return { kind: "terminal", tone: "error", label: "Disputed", hint: "Under review by support." };
    case "REFUNDED":
      return { kind: "terminal", tone: "neutral", label: "Refunded", hint: "This booking was refunded." };
    default:
      return { kind: "terminal", tone: "neutral", label: status, hint: "" };
  }
}

type LoadState = "loading" | "loaded" | "error";

export default function BookingsScreen() {
  const { session } = useSession();
  const { repository, revision } = useMarketplace();
  const [bookings, setBookings] = useState<ReadonlyArray<BookingRecord>>([]);
  const [state, setState] = useState<LoadState>("loading");

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    repository
      .listMyBookings(session.userId)
      .then((result) => {
        setBookings(result);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [repository, session]);

  useEffect(() => {
    load();
  }, [load, revision]);

  if (!session) {
    return (
      <Screen>
        <AppHeader title="Bookings" />
        <EmptyState title="Sign in" description="Sign in to see your bookings." />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title="Bookings" subtitle="Track each booking through to release" />
      {state === "loading" ? <LoadingState label="Loading bookings" /> : null}
      {state === "error" ? <ErrorState onRetry={load} /> : null}
      {state === "loaded" && bookings.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          description="Once a task is booked and paid, it appears here with chat, work status, and completion actions."
        />
      ) : null}
      {state === "loaded" && bookings.length > 0 ? (
        <View style={styles.list}>
          {bookings.map((booking) => {
            const view = stepView(booking.status);
            const isClient = booking.clientId === session.userId;
            return (
              <Pressable
                key={booking.id}
                onPress={() =>
                  router.push({ pathname: "/booking/[id]", params: { id: booking.id } })
                }
                accessibilityRole="button"
                accessibilityLabel={`${booking.taskTitle}, ${view.kind === "step" ? STEP_LABELS[view.index] : view.label}`}
                style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {booking.taskTitle}
                  </Text>
                  <Text style={styles.cardAmount}>{formatPhp(booking.agreedCentavos)}</Text>
                </View>
                <Text style={styles.cardMeta}>
                  {isClient
                    ? `Tasker: ${booking.taskerDisplayName}`
                    : `Client: ${booking.clientDisplayName}`}
                </Text>

                {view.kind === "step" ? (
                  <Stepper currentIndex={view.index} />
                ) : (
                  <View style={styles.terminalRow}>
                    <StatusBadge tone={view.tone} label={view.label} />
                  </View>
                )}

                <View style={styles.hintRow}>
                  <Text
                    style={
                      view.kind === "step" && view.actionable
                        ? styles.hintTextActive
                        : styles.hintTextMuted
                    }
                  >
                    {view.hint}
                  </Text>
                  {view.kind === "step" && view.actionable ? (
                    <Icon name="arrow-right" size={16} color={theme.primaryPressed} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}

function Stepper({ currentIndex }: { readonly currentIndex: number }) {
  return (
    <View style={styles.stepper} accessibilityRole="text">
      {STEP_LABELS.map((label, index) => {
        const reached = index <= currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <View key={label} style={styles.stepItem}>
            <View style={styles.stepDotRow}>
              {index > 0 ? (
                <View style={[styles.connector, reached ? styles.connectorOn : null]} />
              ) : (
                <View style={styles.connectorSpacer} />
              )}
              <View
                style={[
                  styles.stepDot,
                  reached ? styles.stepDotReached : null,
                  isCurrent ? styles.stepDotCurrent : null,
                ]}
              />
              {index < STEP_LABELS.length - 1 ? (
                <View style={[styles.connector, index < currentIndex ? styles.connectorOn : null]} />
              ) : (
                <View style={styles.connectorSpacer} />
              )}
            </View>
            <Text style={[styles.stepLabel, isCurrent ? styles.stepLabelCurrent : null]}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardPressed: { backgroundColor: theme.surfaceSubtle },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardTitle: { fontSize: fontSize.md, fontWeight: "700", color: theme.textPrimary, flexShrink: 1 },
  cardAmount: { fontSize: fontSize.md, fontWeight: "700", color: theme.primary },
  cardMeta: { fontSize: fontSize.xs, color: theme.textSecondary },
  stepper: { flexDirection: "row", marginTop: spacing.xs },
  stepItem: { flex: 1, alignItems: "center", gap: 4 },
  stepDotRow: { flexDirection: "row", alignItems: "center", width: "100%", justifyContent: "center" },
  connector: { flex: 1, height: 2, backgroundColor: theme.borderSubtle },
  connectorOn: { backgroundColor: theme.primary },
  connectorSpacer: { flex: 1, height: 2 },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.borderSubtle,
  },
  stepDotReached: { backgroundColor: theme.primary },
  stepDotCurrent: {
    borderWidth: 3,
    borderColor: theme.primarySoft,
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  stepLabel: { fontSize: 10, color: theme.textSecondary, textAlign: "center" },
  stepLabelCurrent: { color: theme.primaryPressed, fontWeight: "700" },
  terminalRow: { flexDirection: "row", marginTop: spacing.xs },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  hintTextActive: { flex: 1, fontSize: fontSize.sm, fontWeight: "700", color: theme.primaryPressed },
  hintTextMuted: { flex: 1, fontSize: fontSize.sm, color: theme.textSecondary },
});

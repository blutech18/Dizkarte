import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import type { BookingId } from "@dizkarte/domain";
import { formatPhp, isCommunicationUnlocked } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { Button } from "../../src/components/ui/Button";
import { StatusBadge } from "../../src/components/ui/StatusBadge";
import { AttachmentLabel } from "../../src/components/ui/AttachmentLabel";
import { SignedImage } from "../../src/components/media/SignedImage";
import { LoadingState, ErrorState, DeniedState } from "../../src/components/ui/AsyncState";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import type { BookingRecord } from "../../src/services/marketplace/types";
import { theme, spacing, fontSize, radii } from "../../src/theme";

type LoadState = "loading" | "loaded" | "denied" | "error";

/**
 * Booking detail.
 *
 * Exact location/contact/chat are gated to authoritative confirmed-or-later
 * booking participants only (`isCommunicationUnlocked`). A privacy
 * explanation is shown before payment so the gate is understandable, not
 * just enforced.
 */
export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    repository
      .getBooking(id as BookingId, session.userId)
      .then((result) => {
        if (!result) {
          setState("denied");
          return;
        }
        setBooking(result);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [id, repository, session]);

  useEffect(() => {
    load();
  }, [load]);

  const isClientRole = !!session && booking?.clientId === session.userId;
  const isTaskerRole = !!session && booking?.taskerId === session.userId;

  const runAction = useCallback(
    async (action: () => Promise<{ ok: boolean }>) => {
      setActionPending(true);
      setActionError(null);
      try {
        const result = await action();
        if (!result.ok) {
          setActionError("This action is not available for the booking's current state.");
          return;
        }
        notifyChanged();
        load();
      } finally {
        setActionPending(false);
      }
    },
    [notifyChanged, load],
  );

  if (!session) return <DeniedState description="Sign in to view this booking." />;
  if (state === "loading") return <LoadingState label="Loading booking" />;
  if (state === "error") return <ErrorState onRetry={load} />;
  if (state === "denied" || !booking) {
    return (
      <DeniedState
        title="Booking not found"
        description="This booking does not exist or you are not a participant."
      />
    );
  }

  const unlocked = isCommunicationUnlocked(booking.status);

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: "Booking" }} />

      <View style={styles.headerRow}>
        <Text style={styles.title}>{booking.taskTitle}</Text>
        <StatusBadge tone="brand" label={booking.status} />
      </View>
      <Text style={styles.amount}>{formatPhp(booking.agreedCentavos)}</Text>
      <Text style={styles.meta}>
        {isClientRole
          ? `Tasker: ${booking.taskerDisplayName}`
          : `Client: ${booking.clientDisplayName}`}
      </Text>

      {booking.status === "PAYMENT_PENDING" ? (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingText}>
            This booking is awaiting authoritative payment confirmation from the provider.
          </Text>
          {isClientRole ? (
            <Button
              label="Continue to payment"
              onPress={() =>
                router.push({ pathname: "/payment/[bookingId]", params: { bookingId: booking.id } })
              }
              fullWidth
            />
          ) : null}
        </View>
      ) : null}

      {booking.status === "PAYMENT_FAILED" && isClientRole ? (
        <View style={styles.failedCard}>
          <StatusBadge tone="error" label="Payment failed" />
          <Button
            label="Retry payment"
            onPress={() =>
              router.push({ pathname: "/payment/[bookingId]", params: { bookingId: booking.id } })
            }
            fullWidth
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location & contact</Text>
        {unlocked ? (
          <>
            <Text style={styles.body}>{booking.exactAddress}</Text>
            <Text style={styles.body}>
              {isClientRole ? booking.taskerContactMasked : booking.clientContactMasked}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.privacyNote}>
              The exact address and contact details are private. They are shared only once payment
              is authoritatively confirmed — never before, and never based on this app's own
              navigation.
            </Text>
          </>
        )}
      </View>

      {unlocked ? (
        <Button
          label="Open chat"
          onPress={() =>
            router.push({ pathname: "/chat/[bookingId]", params: { bookingId: booking.id } })
          }
          variant="secondary"
          fullWidth
        />
      ) : null}

      {booking.status === "CONFIRMED" && isTaskerRole ? (
        <View style={{ marginTop: spacing.md }}>
          <Button
            label="Start work"
            onPress={() => runAction(() => repository.startWork(booking.id, session.userId))}
            loading={actionPending}
            fullWidth
          />
        </View>
      ) : null}

      {booking.status === "IN_PROGRESS" && isTaskerRole ? (
        <View style={{ marginTop: spacing.md }}>
          <Button
            label="Request completion"
            onPress={() =>
              router.push({ pathname: "/booking/[id]/complete", params: { id: booking.id } })
            }
            fullWidth
          />
        </View>
      ) : null}

      {booking.status === "COMPLETION_REQUESTED" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Completion evidence</Text>
          {booking.completionEvidence.length === 0 ? (
            <Text style={styles.body}>No evidence submitted.</Text>
          ) : (
            booking.completionEvidence.map((item) => (
              <View key={item.id} style={styles.evidenceItem}>
                {item.kind === "image" && item.storagePath ? (
                  <SignedImage
                    bucket="evidence"
                    path={item.storagePath}
                    accessibilityLabel={`Completion evidence ${item.fileName ?? ""}`}
                  />
                ) : null}
                <AttachmentLabel
                  kind={item.kind}
                  text={item.kind === "note" ? (item.note ?? "") : (item.fileName ?? "")}
                />
              </View>
            ))
          )}
          {isClientRole ? (
            <>
              <Button
                label="Confirm & release funds"
                onPress={() =>
                  runAction(() => repository.confirmCompletion(booking.id, session.userId))
                }
                loading={actionPending}
                fullWidth
              />
              <Text style={styles.releaseNote}>
                Release is Client-confirmed and manual. No Tasker or automatic release occurs.
              </Text>
            </>
          ) : (
            <Text style={styles.body}>Waiting for the Client to confirm completion.</Text>
          )}
        </View>
      ) : null}

      {booking.status === "COMPLETED" ? (
        <Button
          label="Leave a review"
          onPress={() =>
            router.push({ pathname: "/review/[bookingId]", params: { bookingId: booking.id } })
          }
          variant="secondary"
          fullWidth
        />
      ) : null}

      {["CONFIRMED", "IN_PROGRESS", "COMPLETION_REQUESTED", "COMPLETED"].includes(
        booking.status,
      ) ? (
        <View style={{ marginTop: spacing.md }}>
          <Button
            label="Open a dispute"
            onPress={() =>
              router.push({ pathname: "/dispute/[bookingId]", params: { bookingId: booking.id } })
            }
            variant="destructive"
            fullWidth
          />
        </View>
      ) : null}

      <View style={{ marginTop: spacing.md }}>
        <Button
          label="Report a problem"
          onPress={() =>
            router.push({
              pathname: "/support",
              params: { subjectType: "booking", subjectId: booking.id },
            })
          }
          variant="secondary"
          fullWidth
        />
      </View>

      {booking.status === "DISPUTED" ? (
        <View style={styles.disputedCard}>
          <StatusBadge tone="error" label="Disputed" />
          <Text style={styles.body}>
            This booking's financial activity is frozen pending review. Ledger history is not
            rewritten.
          </Text>
        </View>
      ) : null}

      {actionError ? (
        <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {actionError}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: theme.textPrimary, flexShrink: 1 },
  amount: { fontSize: fontSize.xl, fontWeight: "700", color: theme.primary, marginTop: spacing.xs },
  meta: { fontSize: fontSize.sm, color: theme.textSecondary, marginBottom: spacing.lg },
  pendingCard: {
    backgroundColor: theme.warningSoft,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  pendingText: { color: theme.warningOnSoft, fontSize: fontSize.sm },
  failedCard: {
    backgroundColor: theme.errorSoft,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
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
  evidenceItem: { gap: spacing.xs, marginTop: spacing.xs },
  body: { fontSize: fontSize.sm, color: theme.textPrimary },
  privacyNote: { fontSize: fontSize.sm, color: theme.textSecondary },
  releaseNote: { fontSize: fontSize.xs, color: theme.textSecondary },
  disputedCard: {
    backgroundColor: theme.errorSoft,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  errorText: {
    color: theme.errorOnSoft,
    backgroundColor: theme.errorSoft,
    padding: spacing.md,
    borderRadius: radii.sm,
    fontWeight: "600",
    marginTop: spacing.md,
  },
});

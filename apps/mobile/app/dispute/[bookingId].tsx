import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import type { BookingId } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { Button } from "../../src/components/ui/Button";
import { TextField } from "../../src/components/ui/TextField";
import { StatusBadge, type BadgeTone } from "../../src/components/ui/StatusBadge";
import { LoadingState, ErrorState } from "../../src/components/ui/AsyncState";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import type { DisputeRecord } from "../../src/services/marketplace/types";
import { theme, spacing, fontSize, lineHeight, radii } from "../../src/theme";

type LoadState = "loading" | "loaded" | "error";

/** How each dispute status reads to the participant who opened (or is party to) it. */
const DISPUTE_STATUS: Record<DisputeRecord["status"], { label: string; tone: BadgeTone }> = {
  OPEN: { label: "Under review", tone: "warning" },
  UNDER_REVIEW: { label: "Under review", tone: "warning" },
  RESOLVED: { label: "Resolved", tone: "success" },
  REJECTED: { label: "Closed — not upheld", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

/**
 * Open a dispute on a live/completed booking, or — if one already exists —
 * show its current status instead of the form. Opening freezes financial
 * activity; ledger history is never rewritten.
 */
export default function DisputeScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { session, status } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<LoadState>("loading");
  const [dispute, setDispute] = useState<DisputeRecord | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    repository
      .getDisputeForBooking(bookingId as BookingId, session.userId)
      .then((result) => {
        setDispute(result);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [session, bookingId, repository]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = useCallback(async () => {
    if (!session) return;
    if (reason.trim().length === 0) {
      setError("Describe the issue before opening a dispute.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const opened = await repository.openDispute(
        { bookingId: bookingId as BookingId, reason },
        session.userId,
      );
      if (!opened) {
        setError("A dispute cannot be opened for this booking right now.");
        return;
      }
      notifyChanged();
      setDispute(opened);
    } finally {
      setSubmitting(false);
    }
  }, [session, reason, bookingId, repository, notifyChanged]);

  if (status === "loading") return <LoadingState label="Loading" />;
  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (state === "loading") return <LoadingState label="Loading dispute" />;
  if (state === "error") {
    return (
      <Screen subPageTitle="Dispute">
        <Stack.Screen options={{ headerShown: false }} />
        <ErrorState onRetry={load} />
      </Screen>
    );
  }

  // An existing dispute (or one just opened): reflect its real status rather
  // than re-showing the form.
  if (dispute) {
    const meta = DISPUTE_STATUS[dispute.status] ?? {
      label: dispute.status,
      tone: "warning" as const,
    };
    return (
      <Screen subPageTitle="Dispute">
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.card}>
          <StatusBadge tone={meta.tone} label={meta.label} />
          <Text style={styles.cardText}>
            This booking&apos;s financial activity is frozen while the dispute is reviewed. Ledger
            history is not rewritten — an Admin reviews the evidence and decides the outcome.
          </Text>
          <View style={styles.reasonBlock}>
            <Text style={styles.reasonLabel}>REPORTED ISSUE</Text>
            <Text style={styles.reasonText}>{dispute.reason}</Text>
          </View>
          <Text style={styles.metaText}>Opened {new Date(dispute.createdAt).toLocaleString()}</Text>
        </View>
        <Button
          label="Back to booking"
          onPress={() => router.replace({ pathname: "/booking/[id]", params: { id: bookingId } })}
          fullWidth
        />
      </Screen>
    );
  }

  // No dispute yet: show the open-a-dispute form.
  return (
    <Screen subPageTitle="Open a dispute">
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={styles.intro}>
        Opening a dispute freezes financial activity on this booking while it is reviewed. Use this
        only for a genuine disagreement about this booking.
      </Text>
      <TextField
        label="What went wrong?"
        required
        multiline
        value={reason}
        onChangeText={setReason}
        error={error ?? undefined}
      />
      <Button
        label="Open dispute"
        onPress={handleSubmit}
        loading={submitting}
        variant="destructive"
        fullWidth
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: theme.errorSoft,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  cardText: { color: theme.errorOnSoft, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  reasonBlock: { gap: spacing.xs, marginTop: spacing.xs },
  reasonLabel: {
    color: theme.errorOnSoft,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  reasonText: { color: theme.errorOnSoft, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  metaText: { color: theme.errorOnSoft, fontSize: fontSize.xs, opacity: 0.8 },
});

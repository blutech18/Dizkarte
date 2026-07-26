import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import type { BookingId } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { Button } from "../../src/components/ui/Button";
import { TextField } from "../../src/components/ui/TextField";
import { StatusBadge } from "../../src/components/ui/StatusBadge";
import { useSession } from "../../src/providers/SessionProvider";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { theme, spacing, fontSize, radii } from "../../src/theme";

/** Open a dispute on a live/completed booking. Freezes financial activity; never rewrites ledger history. */
export default function DisputeScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { session } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [opened, setOpened] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!session) return;
    if (reason.trim().length === 0) {
      setError("Describe the issue before opening a dispute.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const dispute = await repository.openDispute(
        { bookingId: bookingId as BookingId, reason },
        session.userId,
      );
      if (!dispute) {
        setError("A dispute cannot be opened for this booking right now.");
        return;
      }
      notifyChanged();
      setOpened(true);
    } finally {
      setSubmitting(false);
    }
  }, [session, reason, bookingId, repository, notifyChanged]);

  if (!session) return null;

  if (opened) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: true, title: "Dispute opened" }} />
        <View style={styles.card}>
          <StatusBadge tone="error" label="Dispute opened" />
          <Text style={styles.cardText}>
            This booking's financial activity is now frozen pending review. Ledger history is not
            rewritten. An Admin will review the evidence.
          </Text>
        </View>
        <Button
          label="Back to booking"
          onPress={() => router.replace({ pathname: "/booking/[id]", params: { id: bookingId } })}
          fullWidth
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: "Open a dispute" }} />
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
  intro: { fontSize: fontSize.sm, color: theme.textSecondary, marginBottom: spacing.lg },
  card: {
    backgroundColor: theme.errorSoft,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  cardText: { color: theme.errorOnSoft, fontSize: fontSize.sm },
});

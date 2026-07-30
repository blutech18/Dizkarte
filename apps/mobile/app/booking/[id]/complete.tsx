import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import type { BookingId } from "@dizkarte/domain";
import { Screen } from "../../../src/components/ui/Screen";
import { Button } from "../../../src/components/ui/Button";
import { TextField } from "../../../src/components/ui/TextField";
import { MediaPicker } from "../../../src/components/media/MediaPicker";
import type { UploadedObject } from "../../../src/services/storage/upload";
import { useSession } from "../../../src/providers/SessionProvider";
import { useMarketplace } from "../../../src/providers/MarketplaceProvider";
import { theme, spacing, fontSize, radii } from "../../../src/theme";

/**
 * Tasker completion request with photo/video evidence.
 *
 * Files upload to the private `evidence` bucket as they are picked, scoped to
 * the booking. Only an object that actually exists is recorded, so the Client
 * and any assigned Admin never see an attachment they cannot open.
 */
export default function RequestCompletionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<ReadonlyArray<UploadedObject>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!session) return;
    if (note.trim().length === 0 && evidence.length === 0) {
      setError("Add a note or at least one evidence item before submitting.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await repository.requestCompletion(
        {
          bookingId: id as BookingId,
          note,
          evidence: evidence.map((item) => ({
            kind: item.kind === "video" ? ("video" as const) : ("image" as const),
            fileName: item.fileName,
            storagePath: item.path,
          })),
        },
        session.userId,
      );
      if (!result.ok) {
        setError("This booking is not currently in progress, so completion cannot be requested.");
        return;
      }
      notifyChanged();
      setDone(true);
    } catch {
      setError("Your completion request could not be submitted. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [session, note, evidence, id, repository, notifyChanged]);

  if (!session) return null;

  if (done) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: true, title: "Completion requested" }} />
        <View style={styles.successCard}>
          <Text style={styles.successText}>
            Completion request sent. The Client will review your evidence and confirm.
          </Text>
        </View>
        <Button
          label="Back to booking"
          onPress={() => router.replace({ pathname: "/booking/[id]", params: { id } })}
          fullWidth
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: "Request completion" }} />
      <TextField
        label="Note to Client"
        multiline
        value={note}
        onChangeText={setNote}
        description="Describe what was completed."
      />
      <MediaPicker
        bucket="evidence"
        userId={session.userId}
        scopeId={id}
        value={evidence}
        onChange={setEvidence}
        label="Evidence"
        hint="Photos or a short clip of the finished work."
        allowVideo
        disabled={submitting}
      />
      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button
        label="Submit completion request"
        onPress={() => void handleSubmit()}
        loading={submitting}
        fullWidth
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: theme.errorOnSoft,
    backgroundColor: theme.errorSoft,
    padding: spacing.md,
    borderRadius: radii.sm,
    fontWeight: "600",
    marginBottom: spacing.md,
  },
  successCard: {
    backgroundColor: theme.successSoft,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  successText: { color: theme.successOnSoft, fontSize: fontSize.sm },
});

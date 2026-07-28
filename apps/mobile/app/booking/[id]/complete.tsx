import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import type { BookingId } from "@dizkarte/domain";
import { Screen } from "../../../src/components/ui/Screen";
import { Button } from "../../../src/components/ui/Button";
import { TextField } from "../../../src/components/ui/TextField";
import { AttachmentLabel } from "../../../src/components/ui/AttachmentLabel";
import { useSession } from "../../../src/providers/SessionProvider";
import { useMarketplace } from "../../../src/providers/MarketplaceProvider";
import { theme, spacing, fontSize, radii } from "../../../src/theme";

type EvidenceDraft = {
  readonly id: string;
  readonly kind: "image" | "video";
  readonly fileName: string;
};

/** Tasker completion request with deterministic evidence metadata attachment. */
export default function RequestCompletionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<ReadonlyArray<EvidenceDraft>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function addEvidence(kind: "image" | "video") {
    const index = evidence.length + 1;
    setEvidence((prev) => [
      ...prev,
      {
        id: `evidence-${Date.now()}-${index}`,
        kind,
        fileName:
          kind === "image" ? `completion-photo-${index}.jpg` : `completion-clip-${index}.mp4`,
      },
    ]);
  }

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
          evidence: evidence.map((e) => ({ kind: e.kind, fileName: e.fileName })),
        },
        session.userId,
      );
      if (!result.ok) {
        setError("This booking is not currently in progress, so completion cannot be requested.");
        return;
      }
      notifyChanged();
      setDone(true);
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
      <View style={styles.evidenceSection}>
        <Text style={styles.evidenceTitle}>Evidence</Text>
        <View style={styles.buttonRow}>
          <Button
            label="Attach photo"
            onPress={() => addEvidence("image")}
            variant="secondary"
          />
          <Button
            label="Attach video"
            onPress={() => addEvidence("video")}
            variant="secondary"
          />
        </View>
        {evidence.length === 0 ? (
          <Text style={styles.emptyText}>No evidence attached yet.</Text>
        ) : (
          evidence.map((item) => (
            <AttachmentLabel key={item.id} kind={item.kind} text={item.fileName} />
          ))
        )}
      </View>
      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button
        label="Submit completion request"
        onPress={handleSubmit}
        loading={submitting}
        fullWidth
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  evidenceSection: { marginBottom: spacing.lg, gap: spacing.sm },
  evidenceTitle: { fontSize: fontSize.sm, fontWeight: "700", color: theme.textPrimary },
  buttonRow: { flexDirection: "row", gap: spacing.sm },
  emptyText: { fontSize: fontSize.sm, color: theme.textSecondary },
  evidenceItem: {
    fontSize: fontSize.sm,
    color: theme.textPrimary,
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
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

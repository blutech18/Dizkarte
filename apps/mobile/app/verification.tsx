import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { Screen } from "../src/components/ui/Screen";
import { Button } from "../src/components/ui/Button";
import { StatusBadge } from "../src/components/ui/StatusBadge";
import { useSession } from "../src/providers/SessionProvider";
import { theme, spacing, fontSize, radii } from "../src/theme";

/**
 * Identity verification submit/status/resubmission screen.
 *
 * Copy is deliberately truthful about manual review — this UI never claims
 * automated KYC (requirement R2). Document upload uses placeholder
 * "attach" buttons since no camera/file-picker dependency is pinned in this
 * pass; the submit action is a deterministic synthetic transition so the
 * full status lifecycle (submitted → in review → approved/rejected/
 * resubmission) is demonstrable end-to-end in development.
 */
export default function VerificationScreen() {
  const { session } = useSession();
  const [idFrontAttached, setIdFrontAttached] = useState(false);
  const [selfieAttached, setSelfieAttached] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localStatus, setLocalStatus] = useState(session?.verificationStatus ?? "DRAFT");

  if (!session) return null;

  const canSubmit = idFrontAttached && selfieAttached && !submitting;

  async function handleSubmit() {
    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setSubmitting(false);
    setLocalStatus("SUBMITTED");
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: "Identity verification" }} />
      <Text style={styles.intro}>
        Verification is reviewed manually by our Admin team — there is no automated ID check. You
        will see a decision with a reason here once it is complete.
      </Text>

      {localStatus === "SUBMITTED" || localStatus === "IN_REVIEW" ? (
        <View style={styles.statusCard}>
          <StatusBadge tone="warning" label="Submitted — awaiting manual review" />
          <Text style={styles.caption}>This usually takes 1–2 business days.</Text>
        </View>
      ) : localStatus === "APPROVED" ? (
        <View style={styles.statusCard}>
          <StatusBadge tone="success" label="Verified" />
        </View>
      ) : localStatus === "REJECTED" || localStatus === "RESUBMISSION_REQUIRED" ? (
        <View style={styles.statusCard}>
          <StatusBadge
            tone="error"
            label={localStatus === "REJECTED" ? "Rejected" : "Resubmission required"}
          />
          <Text style={styles.caption}>
            Reason: Selfie was blurry. Please retake in good lighting.
          </Text>
        </View>
      ) : (
        <View style={styles.form}>
          <AttachRow
            label="Government ID (front)"
            attached={idFrontAttached}
            onPress={() => setIdFrontAttached(true)}
          />
          <AttachRow
            label="Selfie"
            attached={selfieAttached}
            onPress={() => setSelfieAttached(true)}
          />
          <Button
            label="Submit for review"
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
            fullWidth
          />
        </View>
      )}
    </Screen>
  );
}

function AttachRow({
  label,
  attached,
  onPress,
}: {
  readonly label: string;
  readonly attached: boolean;
  readonly onPress: () => void;
}) {
  return (
    <View style={styles.attachRow}>
      <Text style={styles.attachLabel}>{label}</Text>
      {attached ? (
        <StatusBadge tone="success" label="Attached" />
      ) : (
        <Button label="Attach" onPress={onPress} variant="secondary" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: {
    fontSize: fontSize.sm,
    color: theme.textSecondary,
    marginBottom: spacing.lg,
  },
  statusCard: {
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  caption: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
  },
  form: {
    gap: spacing.md,
  },
  attachRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  attachLabel: {
    fontSize: fontSize.md,
    color: theme.textPrimary,
    fontWeight: "600",
  },
});

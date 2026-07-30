import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { Screen } from "../src/components/ui/Screen";
import { Button } from "../src/components/ui/Button";
import { StatusBadge } from "../src/components/ui/StatusBadge";
import { MediaPicker } from "../src/components/media/MediaPicker";
import { useSession } from "../src/providers/SessionProvider";
import { useMarketplace } from "../src/providers/MarketplaceProvider";
import type {
  VerificationCaseRecord,
  VerificationDocumentKind,
} from "../src/services/marketplace/types";
import type { UploadedObject } from "../src/services/storage/upload";
import { theme, spacing, fontSize, radii } from "../src/theme";

type LoadState = "loading" | "ready" | "error";

/**
 * Identity verification: attach documents, submit, and follow the decision.
 *
 * Review is manual by design (requirement R2) and the copy says so — nothing
 * here claims automated KYC.
 *
 * The case is opened server-side before any file is picked because its id is
 * both the storage scope for the upload path and the row the document is
 * attached to. Uploads land in the private `id-documents` bucket, whose policy
 * checks the first path segment against `auth.uid()`, so a document can only
 * ever be written under the uploader's own prefix.
 */
export default function VerificationScreen() {
  const { session } = useSession();
  const { repository } = useMarketplace();

  const [state, setState] = useState<LoadState>("loading");
  const [verificationCase, setVerificationCase] = useState<VerificationCaseRecord | null>(null);
  const [idFront, setIdFront] = useState<ReadonlyArray<UploadedObject>>([]);
  const [selfie, setSelfie] = useState<ReadonlyArray<UploadedObject>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setState("loading");
    repository
      .startVerification()
      .then((result) => {
        if (!active) return;
        setVerificationCase(result);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [repository]);

  /**
   * Record an uploaded object against the case.
   *
   * The upload already succeeded by the time this runs, so a failure here would
   * leave a file in storage with no row pointing at it. Surfacing the message and
   * dropping the attachment from the form keeps the two in step.
   */
  const attach = useCallback(
    async (kind: VerificationDocumentKind, next: ReadonlyArray<UploadedObject>) => {
      const target = verificationCase;
      if (!target) return false;
      const added = next[next.length - 1];
      if (!added) return true;

      const outcome = await repository.addVerificationDocument({
        caseId: target.id,
        kind,
        storagePath: added.path,
        mimeType: added.mimeType,
        sizeBytes: added.sizeBytes,
      });
      if (!outcome.ok) {
        setError(outcome.reason ?? "That document could not be saved.");
        return false;
      }
      setError(null);
      return true;
    },
    [repository, verificationCase],
  );

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const outcome = await repository.submitVerification();
      if (!outcome.ok) {
        setError(outcome.reason);
        return;
      }
      setVerificationCase(outcome.case);
      setIdFront([]);
      setSelfie([]);
    } finally {
      setSubmitting(false);
    }
  }

  if (!session) return null;

  const status = verificationCase?.status ?? "DRAFT";
  const canAttach = status === "DRAFT" || status === "RESUBMISSION_REQUIRED";
  const canSubmit = idFront.length > 0 && selfie.length > 0 && !submitting;

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: "Identity verification" }} />
      <Text style={styles.intro}>
        Verification is reviewed manually by our Admin team — there is no automated ID check. You
        will see a decision with a reason here once it is complete.
      </Text>

      {state === "loading" ? (
        <Text style={styles.caption}>Loading your verification status…</Text>
      ) : state === "error" ? (
        <Text style={styles.error} accessibilityRole="alert">
          We could not load your verification status. Check your connection and try again.
        </Text>
      ) : status === "SUBMITTED" || status === "IN_REVIEW" ? (
        <View style={styles.statusCard}>
          <StatusBadge tone="warning" label="Submitted — awaiting manual review" />
          <Text style={styles.caption}>This usually takes 1–2 business days.</Text>
        </View>
      ) : status === "APPROVED" ? (
        <View style={styles.statusCard}>
          <StatusBadge tone="success" label="Verified" />
          <Text style={styles.caption}>
            You can post tasks and, once approved as a Tasker, submit offers.
          </Text>
        </View>
      ) : (
        <View style={styles.form}>
          {status === "REJECTED" || status === "RESUBMISSION_REQUIRED" ? (
            <View style={styles.statusCard}>
              <StatusBadge
                tone="error"
                label={status === "REJECTED" ? "Rejected" : "Resubmission required"}
              />
              {verificationCase?.decisionReason ? (
                <Text style={styles.caption}>Reason: {verificationCase.decisionReason}</Text>
              ) : null}
            </View>
          ) : null}

          {error ? (
            <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          {canAttach && verificationCase ? (
            <>
              <MediaPicker
                bucket="id-documents"
                userId={session.userId}
                scopeId={verificationCase.id}
                value={idFront}
                onChange={(next) => {
                  setIdFront(next);
                  void attach("government_id_front", next);
                }}
                label="Government ID (front)"
                hint="A clear photo of the whole card, all four corners visible. JPEG or PNG."
                maxCount={1}
                photoUploadKind="document"
                disabled={submitting}
              />
              <MediaPicker
                bucket="id-documents"
                userId={session.userId}
                scopeId={verificationCase.id}
                value={selfie}
                onChange={(next) => {
                  setSelfie(next);
                  void attach("selfie", next);
                }}
                label="Selfie"
                hint="Face the camera in good lighting, no hat or sunglasses. JPEG or PNG."
                maxCount={1}
                photoUploadKind="document"
                disabled={submitting}
              />
              <Button
                label="Submit for review"
                onPress={() => void handleSubmit()}
                disabled={!canSubmit}
                loading={submitting}
                fullWidth
              />
            </>
          ) : (
            <Text style={styles.caption}>
              This case cannot accept new documents. Contact support if you need help.
            </Text>
          )}
        </View>
      )}
    </Screen>
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
  error: {
    color: theme.errorOnSoft,
    backgroundColor: theme.errorSoft,
    padding: spacing.sm,
    borderRadius: radii.sm,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
});

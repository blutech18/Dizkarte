import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect, Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "../src/components/ui/Screen";
import { Button } from "../src/components/ui/Button";
import { Icon } from "../src/components/ui/Icon";
import { LoadingState, ErrorState } from "../src/components/ui/AsyncState";
import { VerificationDocumentPicker } from "../src/components/verification/VerificationDocumentPicker";
import { useSession } from "../src/providers/SessionProvider";
import { useMarketplace } from "../src/providers/MarketplaceProvider";
import type {
  VerificationCaseRecord,
  VerificationDocumentKind,
  VerificationDocumentRecord,
} from "../src/services/marketplace/types";
import type { UploadedObject } from "../src/services/storage/upload";
import { theme, spacing, fontSize, lineHeight, radii, useResponsiveLayout } from "../src/theme";

type LoadState = "loading" | "ready" | "error";

/**
 * Manual identity-verification flow.
 *
 * A case is created before upload so private Storage RLS can bind every object
 * path to the authenticated owner and the real case id. A document appears in
 * the UI only after both its private upload and verification_documents row
 * succeed; removal deletes the row first, then cleans up the private object.
 */
export default function VerificationScreen() {
  const { session, status: sessionStatus } = useSession();
  const { repository } = useMarketplace();
  const insets = useSafeAreaInsets();
  const { gutter, isTablet } = useResponsiveLayout();

  const [state, setState] = useState<LoadState>("loading");
  const [verificationCase, setVerificationCase] = useState<VerificationCaseRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    setError(null);
    repository
      .startVerification()
      .then((result) => {
        setVerificationCase(result);
        setState("ready");
      })
      .catch(() => {
        setState("error");
      });
  }, [repository, session]);

  useEffect(() => {
    load();
  }, [load]);

  const attach = useCallback(
    async (
      kind: VerificationDocumentKind,
      object: UploadedObject,
    ): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> => {
      const target = verificationCase;
      if (!target) return { ok: false, reason: "No verification case is open." };

      const outcome = await repository.addVerificationDocument({
        caseId: target.id,
        kind,
        storagePath: object.path,
        mimeType: object.mimeType,
        sizeBytes: object.sizeBytes,
      });
      if (!outcome.ok) return outcome;

      setVerificationCase((current) =>
        current && current.id === target.id
          ? { ...current, documents: [...current.documents, outcome.document] }
          : current,
      );
      setError(null);
      return { ok: true };
    },
    [repository, verificationCase],
  );

  const removeDocument = useCallback(
    async (
      document: VerificationDocumentRecord,
    ): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> => {
      const target = verificationCase;
      if (!target) return { ok: false, reason: "No verification case is open." };

      const outcome = await repository.removeVerificationDocument({
        caseId: target.id,
        documentId: document.id,
      });
      if (!outcome.ok) return outcome;

      setVerificationCase((current) =>
        current && current.id === target.id
          ? {
              ...current,
              documents: current.documents.filter((item) => item.id !== document.id),
            }
          : current,
      );
      setError(null);
      return { ok: true };
    },
    [repository, verificationCase],
  );

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const outcome = await repository.submitVerification();
      if (!outcome.ok) {
        setError(outcome.reason);
        return;
      }
      setVerificationCase(outcome.case);
    } catch {
      setError("Could not submit verification. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }, [repository]);

  if (sessionStatus === "loading") return <LoadingState label="Loading" />;
  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (state === "loading") return <LoadingState label="Loading verification" />;
  if (state === "error" || !verificationCase) {
    return (
      <Screen subPageTitle="Identity verification">
        <Stack.Screen options={{ headerShown: false }} />
        <ErrorState
          title="Verification unavailable"
          description="We could not load your verification status."
          onRetry={load}
        />
      </Screen>
    );
  }

  const status = verificationCase.status;
  const canAttach = status === "DRAFT" || status === "RESUBMISSION_REQUIRED";
  const idFront =
    verificationCase.documents.find((document) => document.kind === "government_id_front") ?? null;
  const selfie = verificationCase.documents.find((document) => document.kind === "selfie") ?? null;
  const completedCount = Number(Boolean(idFront)) + Number(Boolean(selfie));
  const canSubmit = completedCount === 2 && !submitting;
  const introCopy = verificationIntro(status);

  return (
    <Screen subPageTitle="Identity verification" scroll={false} padded={false}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.page}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: gutter, paddingBottom: spacing.xl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contentFrame}>
            <View style={styles.intro}>
              <Text
                style={styles.pageTitle}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                accessibilityRole="header"
              >
                {introCopy.title}
              </Text>
              <Text style={styles.pageSubtitle}>{introCopy.description}</Text>
            </View>

            <View style={styles.privacyNotice}>
              <View style={styles.noticeHeader}>
                <View style={styles.cardHeaderIcon}>
                  <Icon name="shield" size={22} color={theme.infoOnSoft} />
                </View>
                <Text style={styles.noticeTitle}>Private and securely stored</Text>
              </View>
              <Text style={styles.noticeBody}>
                Your documents are never public. Only an assigned verification reviewer can access
                them through an audited, short-lived link.
              </Text>
            </View>

            {status === "SUBMITTED" || status === "IN_REVIEW" ? (
              <StatusPanel
                icon="calendar"
                title={status === "IN_REVIEW" ? "Review in progress" : "Submitted for review"}
                description="Manual review usually takes 1-2 business days. You will receive a notification when a decision is ready."
                tone="info"
              />
            ) : status === "APPROVED" ? (
              <StatusPanel
                icon="check-circle"
                title="Identity verified"
                description="Your identity verification is approved. You can now continue using verified marketplace features."
                tone="success"
                action={
                  <Button
                    label="Back to profile"
                    onPress={() => router.replace("/(tabs)/profile")}
                    fullWidth
                  />
                }
              />
            ) : (
              <>
                {status === "RESUBMISSION_REQUIRED" ? (
                  <StatusPanel
                    icon="alert-circle"
                    title="New documents required"
                    description={
                      verificationCase.decisionReason ??
                      "The reviewer requested clearer or updated documents."
                    }
                    tone="error"
                  />
                ) : null}

                <View style={styles.progressCard}>
                  <View style={styles.progressHeader}>
                    <View>
                      <Text style={styles.progressTitle}>Required documents</Text>
                      <Text style={styles.progressCaption}>
                        {completedCount} of 2 securely attached
                      </Text>
                    </View>
                    <Text style={styles.progressValue}>
                      {Math.round((completedCount / 2) * 100)}%
                    </Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.round((completedCount / 2) * 100)}%` },
                      ]}
                    />
                  </View>
                </View>

                {error ? (
                  <View
                    style={styles.errorCard}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                  >
                    <Icon name="alert-circle" size={20} color={theme.errorOnSoft} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                {canAttach ? (
                  <View style={[styles.documentGrid, isTablet ? styles.documentGridTablet : null]}>
                    <VerificationDocumentPicker
                      title="Government ID"
                      hint="Show the full front of the card with all four corners visible."
                      icon="note"
                      userId={session.userId}
                      caseId={verificationCase.id}
                      document={idFront}
                      onAttach={(object) => attach("government_id_front", object)}
                      onRemove={removeDocument}
                      disabled={submitting}
                    />
                    <VerificationDocumentPicker
                      title="Selfie"
                      hint="Face the camera in good lighting without a hat or sunglasses."
                      icon="user"
                      userId={session.userId}
                      caseId={verificationCase.id}
                      document={selfie}
                      onAttach={(object) => attach("selfie", object)}
                      onRemove={removeDocument}
                      disabled={submitting}
                    />
                  </View>
                ) : (
                  <StatusPanel
                    icon="lock"
                    title="Documents locked"
                    description="This verification case cannot accept new documents. Contact support if you need assistance."
                    tone="neutral"
                  />
                )}
              </>
            )}
          </View>
        </ScrollView>

        {canAttach ? (
          <View
            style={[styles.actionFooter, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
          >
            <View style={[styles.actionFooterInner, { paddingHorizontal: gutter }]}>
              <Button
                label={canSubmit ? "Submit for manual review" : "Attach both documents"}
                icon="send"
                onPress={() => void handleSubmit()}
                disabled={!canSubmit}
                loading={submitting}
                accessibilityHint={
                  canSubmit
                    ? "Submits your documents to the Admin review queue"
                    : "A government ID and selfie are required"
                }
                fullWidth
              />
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function StatusPanel({
  icon,
  title,
  description,
  tone,
  action,
}: {
  readonly icon: "calendar" | "check-circle" | "alert-circle" | "lock";
  readonly title: string;
  readonly description: string;
  readonly tone: "info" | "success" | "error" | "neutral";
  readonly action?: ReactNode;
}) {
  const colors = {
    info: { background: theme.infoSoft, text: theme.infoOnSoft },
    success: { background: theme.successSoft, text: theme.successOnSoft },
    error: { background: theme.errorSoft, text: theme.errorOnSoft },
    neutral: { background: theme.surfaceSubtle, text: theme.textSecondary },
  }[tone];

  return (
    <View style={[styles.statusPanel, { backgroundColor: colors.background }]}>
      <View style={styles.statusHeader}>
        <View style={styles.cardHeaderIcon}>
          <Icon name={icon} size={22} color={colors.text} />
        </View>
        <Text style={[styles.statusTitle, { color: colors.text }]}>{title}</Text>
      </View>
      <Text style={[styles.statusDescription, { color: colors.text }]}>{description}</Text>
      {action ? <View style={styles.statusAction}>{action}</View> : null}
    </View>
  );
}

function verificationIntro(status: VerificationCaseRecord["status"]): {
  readonly title: string;
  readonly description: string;
} {
  switch (status) {
    case "SUBMITTED":
      return {
        title: "Verification submitted",
        description: "Your documents are waiting for manual review by the Dizkarte Admin team.",
      };
    case "IN_REVIEW":
      return {
        title: "Verification in review",
        description: "An assigned reviewer is currently checking your submitted documents.",
      };
    case "APPROVED":
      return {
        title: "Identity verified",
        description: "Your identity has been approved for verified marketplace features.",
      };
    case "RESUBMISSION_REQUIRED":
      return {
        title: "Update your documents",
        description: "Review the decision reason and attach clear replacement photos.",
      };
    case "REJECTED":
      return {
        title: "Verification decision",
        description: "Review the decision details below or contact support for assistance.",
      };
    case "DRAFT":
      return {
        title: "Verify your identity",
        description: "Submit two clear photos for manual review by the Dizkarte Admin team.",
      };
  }
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: spacing.lg },
  contentFrame: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    gap: spacing.lg,
  },
  intro: {
    gap: spacing.sm,
  },
  pageTitle: {
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  pageSubtitle: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
  },
  privacyNotice: {
    alignItems: "flex-start",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: theme.infoSoft,
  },
  noticeHeader: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: spacing.sm,
  },
  noticeTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.infoOnSoft,
  },
  noticeBody: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.infoOnSoft,
  },
  progressCard: {
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
    gap: spacing.md,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  progressTitle: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  progressCaption: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: theme.textSecondary,
  },
  progressValue: {
    fontSize: fontSize.md,
    fontWeight: "800",
    color: theme.primary,
  },
  progressTrack: {
    height: 7,
    overflow: "hidden",
    borderRadius: radii.pill,
    backgroundColor: theme.borderSubtle,
  },
  progressFill: {
    height: "100%",
    borderRadius: radii.pill,
    backgroundColor: theme.primary,
  },
  documentGrid: {
    gap: spacing.md,
  },
  documentGridTablet: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: theme.errorSoft,
  },
  errorText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
    color: theme.errorOnSoft,
  },
  statusPanel: {
    alignItems: "flex-start",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
  statusHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardHeaderIcon: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: "800",
  },
  statusDescription: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  statusAction: {
    marginTop: spacing.md,
  },
  actionFooter: {
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    paddingTop: spacing.sm,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  actionFooterInner: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
});

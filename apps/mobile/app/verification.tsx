import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type KeyboardEvent,
} from "react-native";
import { Redirect, Stack, router } from "expo-router";
import { Screen } from "../src/components/ui/Screen";
import { Button } from "../src/components/ui/Button";
import { Icon } from "../src/components/ui/Icon";
import { LoadingState, ErrorState } from "../src/components/ui/AsyncState";
import { VerificationDocumentPicker } from "../src/components/verification/VerificationDocumentPicker";
import { useSession } from "../src/providers/SessionProvider";
import { useMarketplace } from "../src/providers/MarketplaceProvider";
import { ScreenScrollProvider } from "../src/providers/ScreenScrollContext";
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
  const { gutter, isTablet } = useResponsiveLayout();

  const [state, setState] = useState<LoadState>("loading");
  const [verificationCase, setVerificationCase] = useState<VerificationCaseRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const footerOpacity = useRef(new Animated.Value(1)).current;
  const footerTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: KeyboardEvent) => {
      setKeyboardVisible(true);
      const duration = e?.duration && e.duration > 0 ? e.duration : 200;
      Animated.parallel([
        Animated.timing(footerOpacity, {
          toValue: 0,
          duration: Math.min(duration, 160),
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(footerTranslateY, {
          toValue: 16,
          duration: Math.min(duration, 160),
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    };

    const onHide = (e: KeyboardEvent) => {
      setKeyboardVisible(false);
      const duration = e?.duration && e.duration > 0 ? e.duration : 220;
      Animated.parallel([
        Animated.timing(footerOpacity, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(footerTranslateY, {
          toValue: 0,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [footerOpacity, footerTranslateY]);

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
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: gutter, paddingBottom: keyboardVisible ? 380 : 120 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={true}
          showsVerticalScrollIndicator={false}
        >
          <ScreenScrollProvider scrollViewRef={scrollRef}>
            <View style={styles.contentFrame}>

            {/* APPROVED: full hero success state */}
            {status === "APPROVED" ? (
              <View style={styles.approvedHero}>
                {/* Hero checkmark ring */}
                <View style={styles.heroIconRing}>
                  <Icon name="check-circle" size={40} color={theme.successSolid} />
                </View>

                {/* Title + subtitle */}
                <View style={styles.heroTextBlock}>
                  <Text style={styles.heroTitle}>{introCopy.title}</Text>
                  <Text style={styles.heroSubtitle}>{introCopy.description}</Text>
                </View>

                {/* Privacy info */}
                <InfoCard
                  icon="shield"
                  title="Private and securely stored"
                  body="Your documents are never public. Only an assigned verification reviewer can access them through an audited, short-lived link."
                  tone="info"
                />

                {/* Verified status info */}
                <InfoCard
                  icon="check-circle"
                  title="Identity verified"
                  body="Your identity verification is approved. You can now continue using verified marketplace features."
                  tone="success"
                />

                <Button
                  label="Back to profile"
                  onPress={() => router.replace("/(tabs)/profile")}
                  fullWidth
                />
              </View>
            ) : (
              <>
                {/* Non-approved: standard page header */}
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

                {/* Privacy notice */}
                <InfoCard
                  icon="shield"
                  title="Private and securely stored"
                  body="Your documents are never public. Only an assigned verification reviewer can access them through an audited, short-lived link."
                  tone="info"
                />

                {status === "SUBMITTED" || status === "IN_REVIEW" ? (
                  <StatusPanel
                    icon="calendar"
                    title={status === "IN_REVIEW" ? "Review in progress" : "Submitted for review"}
                    description="Manual review usually takes 1-2 business days. You will receive a notification when a decision is ready."
                    tone="info"
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
                        <View style={styles.progressHeaderInfo}>
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
                        <Icon name="alert-circle" size={18} color={theme.errorOnSoft} />
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
              </>
            )}
          </View>
        </ScreenScrollProvider>
      </ScrollView>

        {canAttach ? (
          <Animated.View
            pointerEvents={keyboardVisible ? "none" : "auto"}
            style={[
              styles.stickyOverlayFooter,
              {
                paddingVertical: spacing.md,
                opacity: footerOpacity,
                transform: [{ translateY: footerTranslateY }],
              },
            ]}
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
          </Animated.View>
        ) : null}
      </View>
    </Screen>
  );
}

/**
 * Minimal inline info card with plain icon beside bold title and body text below.
 * No icon container background — just icon + title on one row, body below.
 */
function InfoCard({
  icon,
  title,
  body,
  tone,
}: {
  readonly icon: "shield" | "check-circle";
  readonly title: string;
  readonly body: string;
  readonly tone: "info" | "success";
}) {
  const colors = {
    info: {
      background: theme.infoSoft,
      iconColor: theme.infoOnSoft,
      textColor: theme.infoOnSoft,
    },
    success: {
      background: theme.successSoft,
      iconColor: theme.successSolid,
      textColor: theme.successOnSoft,
    },
  }[tone];

  return (
    <View style={[styles.infoCard, { backgroundColor: colors.background }]}>
      <View style={styles.infoCardHeader}>
        <Icon name={icon} size={18} color={colors.iconColor} />
        <Text style={[styles.infoCardTitle, { color: colors.textColor }]}>{title}</Text>
      </View>
      <Text style={[styles.infoCardBody, { color: colors.textColor }]}>{body}</Text>
    </View>
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
        <Icon name={icon} size={18} color={colors.text} />
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

  // Approved Hero
  approvedHero: {
    gap: spacing.lg,
    paddingTop: spacing.xl,
    alignItems: "stretch",
  },
  heroIconRing: {
    alignSelf: "center",
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme.successSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTextBlock: {
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  heroTitle: {
    fontSize: fontSize.xl,
    fontWeight: "800",
    color: theme.textPrimary,
    textAlign: "center",
    lineHeight: lineHeight.xl,
  },
  heroSubtitle: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
    textAlign: "center",
  },

  // Standard page intro
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

  // Info Card
  infoCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    gap: spacing.sm,
  },
  infoCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  infoCardTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "700",
    lineHeight: lineHeight.sm,
  },
  infoCardBody: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },

  // Progress Card
  progressCard: {
    minWidth: 0,
    width: "100%",
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
    gap: spacing.md,
  },
  progressHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  progressHeaderInfo: {
    flex: 1,
    minWidth: 0,
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
    flexShrink: 0,
    textAlign: "right",
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

  // Status Panel
  statusPanel: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  statusTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: "700",
    lineHeight: lineHeight.sm,
  },
  statusDescription: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  statusAction: {
    marginTop: spacing.sm,
  },

  // Footer
  stickyOverlayFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  actionFooterInner: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
});



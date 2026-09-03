import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Screen } from "../ui/Screen";
import { AppHeader } from "../ui/AppHeader";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { useSession } from "../../providers/SessionProvider";
import { useMarketplace } from "../../providers/MarketplaceProvider";
import type { TaskerApplicationRecord } from "../../services/marketplace/types";
import { theme, spacing, fontSize, lineHeight, radii, useResponsiveLayout } from "../../theme";

type ApplicationStep = {
  readonly number: string;
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
};

const DEFAULT_STEPS: ReadonlyArray<ApplicationStep> = [
  {
    number: "1",
    icon: "edit",
    title: "Build your profile",
    description: "Tell us about your skills, experience, and the areas you serve.",
  },
  {
    number: "2",
    icon: "shield",
    title: "Complete review",
    description: "Our team manually reviews every application for marketplace safety.",
  },
  {
    number: "3",
    icon: "briefcase",
    title: "Browse local work",
    description: "Once approved, discover open tasks and submit offers that suit you.",
  },
];

const IN_REVIEW_STEPS: ReadonlyArray<ApplicationStep> = [
  {
    number: "1",
    icon: "check-circle",
    title: "Application submitted",
    description: "Your bio, specialties, experience, and service area have been recorded.",
  },
  {
    number: "2",
    icon: "clock",
    title: "Under manual review",
    description: "Our team is reviewing your profile details for quality and trust.",
  },
  {
    number: "3",
    icon: "lock",
    title: "Browse local work",
    description: "Once approved, discover open tasks and submit offers that suit you.",
  },
];

export type TaskerApplicationPromptProps = {
  readonly standalone?: boolean;
  readonly title?: string;
  readonly description?: string;
};

/**
 * Tasker on-ramp shown on the Browse tab or unapproved subpages (e.g. Earnings)
 * to any user who is not yet an approved Tasker.
 */
export function TaskerApplicationPrompt({
  standalone = true,
  title,
  description,
}: TaskerApplicationPromptProps = {}) {
  const { contentWidth, isTablet } = useResponsiveLayout();
  const { session } = useSession();
  const { repository, revision, notifyChanged } = useMarketplace();
  const [refreshing, setRefreshing] = useState(false);
  const [application, setApplication] = useState<TaskerApplicationRecord | null>(null);

  const loadApplication = useCallback(async () => {
    if (!session?.userId) {
      setApplication(null);
      return;
    }
    try {
      const app = await repository.getMyTaskerApplication(session.userId);
      setApplication(app);
    } catch {
      setApplication(null);
    }
  }, [repository, session?.userId]);

  useEffect(() => {
    void loadApplication();
  }, [loadApplication, revision]);

  useFocusEffect(
    useCallback(() => {
      void loadApplication();
    }, [loadApplication])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      notifyChanged();
      await loadApplication();
      await new Promise((resolve) => setTimeout(resolve, 300));
    } finally {
      setRefreshing(false);
    }
  }, [notifyChanged, loadApplication]);

  const isUnderReview = useMemo(() => {
    const status = application?.status ?? session?.taskerApplicationStatus;
    return status === "SUBMITTED" || status === "IN_REVIEW";
  }, [application?.status, session?.taskerApplicationStatus]);

  const isResubmission = useMemo(() => {
    const status = application?.status ?? session?.taskerApplicationStatus;
    return status === "RESUBMISSION_REQUIRED";
  }, [application?.status, session?.taskerApplicationStatus]);

  const steps = isUnderReview ? IN_REVIEW_STEPS : DEFAULT_STEPS;

  const heroIconSize = isTablet ? 32 : 28;
  const supportingIconSize = isTablet ? 22 : 20;

  const heroTitleFontSize = isTablet ? fontSize.xl : contentWidth >= 380 ? fontSize.lg : 16;
  const heroTitleLineHeight = isTablet ? lineHeight.xl : contentWidth >= 380 ? lineHeight.lg : 22;

  const content = (
    <View style={styles.content}>
      <View style={[styles.heroCard, isTablet ? styles.heroCardWide : null]}>
        <View style={styles.heroContent}>
          <View style={styles.heroIconAnchor}>
            <Icon
              name={isUnderReview ? "clock" : isResubmission ? "alert-circle" : "briefcase"}
              size={heroIconSize}
              color={theme.onPrimary}
            />
          </View>
          <Text
            style={[
              styles.heroTitle,
              { fontSize: heroTitleFontSize, lineHeight: heroTitleLineHeight },
            ]}
            accessibilityRole="header"
          >
            {isUnderReview
              ? "Application In Review"
              : isResubmission
                ? "Updates Requested"
                : title ?? "Turn your skills into income"}
          </Text>
          <Text style={styles.heroDescription}>
            {isUnderReview
              ? "Your Tasker profile and qualifications are currently being reviewed by our team. We typically review applications within 1–2 business days."
              : isResubmission
                ? application?.decisionReason || "Please update your application with the requested details to proceed."
                : description ??
                  "Find nearby tasks, choose work that fits your schedule, and build trusted client relationships in your community."}
          </Text>
        </View>

        <View style={styles.heroAction}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isUnderReview
                ? "View Application Status"
                : isResubmission
                  ? "Update Application"
                  : "Start Tasker Application"
            }
            style={({ pressed }) => [
              styles.heroCtaButton,
              pressed && styles.heroCtaButtonPressed,
            ]}
            onPress={() => router.push("/tasker-application")}
          >
            <Icon name="arrow-right" size={15} color={theme.primary} />
            <Text style={styles.heroCtaText}>
              {isUnderReview
                ? "View Application Status"
                : isResubmission
                  ? "Update Application"
                  : "Start Tasker Application"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {isUnderReview ? "Application progress" : "How it works"}
        </Text>
        <Text style={styles.sectionDescription}>
          {isUnderReview
            ? "Here is the current status of your Tasker onboarding process."
            : "A straightforward review keeps work opportunities reliable for everyone."}
        </Text>
      </View>

      <View style={[styles.stepsGrid, isTablet ? styles.stepsGridWide : null]}>
        {steps.map((step) => (
          <View key={step.number} style={styles.stepCard}>
            <View style={styles.stepHeadingRow}>
              <View style={styles.stepTitleGroup}>
                <View
                  style={[
                    styles.stepNumberBadge,
                    isUnderReview && step.number === "1"
                      ? styles.stepNumberBadgeCompleted
                      : isUnderReview && step.number === "2"
                        ? styles.stepNumberBadgeActive
                        : null,
                  ]}
                  accessible
                  accessibilityLabel={`Step ${step.number}`}
                >
                  <Text
                    style={[
                      styles.stepNumber,
                      isUnderReview && step.number === "1"
                        ? styles.stepNumberCompleted
                        : isUnderReview && step.number === "2"
                          ? styles.stepNumberActive
                          : null,
                    ]}
                  >
                    {step.number}
                  </Text>
                </View>
                <Text style={styles.stepTitle} accessibilityRole="header">
                  {step.title}
                </Text>
              </View>
              <View style={styles.supportingIconAnchor}>
                <Icon
                  name={step.icon}
                  size={supportingIconSize}
                  color={
                    isUnderReview && step.number === "1"
                      ? "#059669"
                      : isUnderReview && step.number === "2"
                        ? "#D97706"
                        : theme.primary
                  }
                />
              </View>
            </View>
            <Text style={styles.stepDescription}>{step.description}</Text>
          </View>
        ))}
      </View>

      {/* Simplified Centered Guidance (No container boxes) */}
      <View style={styles.guidanceBlock}>
        <View style={styles.guidanceHeaderRow}>
          <Icon name="shield" size={18} color={theme.infoOnSoft} />
          <Text style={styles.guidanceHeading} accessibilityRole="header">
            {isUnderReview ? "You will be notified" : "Manual application review"}
          </Text>
        </View>
        <Text style={styles.guidanceBody}>
          {isUnderReview
            ? "You'll receive an in-app notification when the review is complete. You can continue using Dizkarte to post and browse tasks in the meantime."
            : "Our team reviews every application for quality and marketplace safety. Approval is required before browsing client tasks or submitting offers."}
        </Text>
      </View>
    </View>
  );

  if (!standalone) {
    return content;
  }

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={handleRefresh}
      refreshControlTintColor={theme.primary}
    >
      <AppHeader
        title="Browse work"
        subtitle={
          isUnderReview
            ? "Your Tasker application is currently under manual review"
            : "Create a Tasker profile to unlock flexible local opportunities"
        }
      />
      {content}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    minWidth: 0,
    gap: spacing.xl,
    paddingBottom: spacing.xl,
  },
  heroCard: {
    minWidth: 0,
    backgroundColor: theme.primary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#30106B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
  },
  heroCardWide: {
    padding: spacing.xl,
  },
  heroContent: {
    minWidth: 0,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
  },
  heroIconAnchor: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  heroTitle: {
    color: theme.onPrimary,
    fontWeight: "800",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  heroDescription: {
    minWidth: 0,
    color: "rgba(255,255,255,0.86)",
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    textAlign: "center",
    maxWidth: 480,
  },
  heroAction: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  heroCtaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  heroCtaButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  heroCtaText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.primary,
  },
  sectionHeading: {
    minWidth: 0,
    gap: spacing.xs,
  },
  sectionTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
  },
  sectionDescription: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  stepsGrid: {
    minWidth: 0,
    gap: spacing.md,
  },
  stepsGridWide: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  stepCard: {
    minWidth: 0,
    flex: 1,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  stepHeadingRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  stepTitleGroup: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  supportingIconAnchor: {
    width: 22,
    height: 22,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberBadge: {
    width: 26,
    height: 26,
    flexShrink: 0,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.surfaceSubtle,
  },
  stepNumberBadgeCompleted: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  stepNumberCompleted: {
    color: "#059669",
  },
  stepNumberBadgeActive: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  stepNumberActive: {
    color: "#B45309",
  },
  stepNumber: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: "800",
  },
  stepTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.textPrimary,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: "800",
  },
  stepDescription: {
    minWidth: 0,
    width: "100%",
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  guidanceBlock: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
  },
  guidanceHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  guidanceHeading: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
    textAlign: "center",
  },
  guidanceBody: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: theme.textSecondary,
    textAlign: "center",
    maxWidth: 480,
  },
});

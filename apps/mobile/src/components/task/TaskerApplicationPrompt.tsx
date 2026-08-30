import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "../ui/Screen";
import { AppHeader } from "../ui/AppHeader";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { useMarketplace } from "../../providers/MarketplaceProvider";
import { theme, spacing, fontSize, lineHeight, radii, useResponsiveLayout } from "../../theme";

type ApplicationStep = {
  readonly number: string;
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
};

const APPLICATION_STEPS: ReadonlyArray<ApplicationStep> = [
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
  const { notifyChanged } = useMarketplace();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      notifyChanged();
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      setRefreshing(false);
    }
  }, [notifyChanged]);

  const heroIconSize = isTablet ? 28 : 24;
  const supportingIconSize = isTablet ? 22 : 20;

  const heroTitleFontSize = isTablet ? fontSize.xl : contentWidth >= 380 ? fontSize.lg : 16;
  const heroTitleLineHeight = isTablet ? lineHeight.xl : contentWidth >= 380 ? lineHeight.lg : 22;

  const content = (
    <View style={styles.content}>
      <View style={[styles.heroCard, isTablet ? styles.heroCardWide : null]}>
        <View style={styles.heroContent}>
          <View style={styles.heroTitleRow}>
            <View style={styles.heroIconAnchor}>
              <Icon name="briefcase" size={heroIconSize} color={theme.onPrimary} />
            </View>
            <Text
              style={[
                styles.heroTitle,
                { fontSize: heroTitleFontSize, lineHeight: heroTitleLineHeight },
              ]}
              numberOfLines={1}
              accessibilityRole="header"
            >
              {title ?? "Turn your skills into income"}
            </Text>
          </View>
          <Text style={styles.heroDescription}>
            {description ??
              "Find nearby tasks, choose work that fits your schedule, and build trusted client relationships in your community."}
          </Text>
        </View>

        <View style={[styles.heroAction, isTablet ? styles.heroActionWide : null]}>
          <Button
            label="Start Tasker application"
            icon="arrow-right"
            variant="secondary"
            fullWidth
            onPress={() => router.push("/tasker-application")}
          />
        </View>
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          How it works
        </Text>
        <Text style={styles.sectionDescription}>
          A straightforward review keeps work opportunities reliable for everyone.
        </Text>
      </View>

      <View style={[styles.stepsGrid, isTablet ? styles.stepsGridWide : null]}>
        {APPLICATION_STEPS.map((step) => (
          <View key={step.number} style={styles.stepCard}>
            <View style={styles.stepHeadingRow}>
              <View style={styles.stepTitleGroup}>
                <View style={styles.supportingIconAnchor}>
                  <Icon name={step.icon} size={supportingIconSize} color={theme.primary} />
                </View>
                <Text style={styles.stepTitle} accessibilityRole="header">
                  {step.title}
                </Text>
              </View>
              <View
                style={styles.stepNumberBadge}
                accessible
                accessibilityLabel={`Step ${step.number}`}
              >
                <Text style={styles.stepNumber}>{step.number}</Text>
              </View>
            </View>
            <Text style={styles.stepDescription}>{step.description}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.guidanceGrid, isTablet ? styles.guidanceGridWide : null]}>
        <View style={styles.earningNote}>
          <View style={styles.noteHeadingRow}>
            <View style={styles.supportingIconAnchor}>
              <Icon name="wallet" size={supportingIconSize} color={theme.primaryPressed} />
            </View>
            <Text style={styles.noteTitle} accessibilityRole="header">
              You stay in control
            </Text>
          </View>
          <Text style={styles.noteDescription}>
            Browse before you offer, choose tasks that suit you, and keep every booking and chat
            organized in Dizkarte.
          </Text>
        </View>

        <View style={styles.trustCard}>
          <View style={styles.trustHeadingRow}>
            <View style={styles.supportingIconAnchor}>
              <Icon name="shield" size={supportingIconSize} color={theme.infoOnSoft} />
            </View>
            <Text style={styles.trustTitle} accessibilityRole="header">
              Manual application review
            </Text>
          </View>
          <Text style={styles.trustDescription}>
            Approval is required before browsing client tasks or submitting offers.
          </Text>
        </View>
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
        subtitle="Create a Tasker profile to unlock flexible local opportunities"
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
    shadowColor: "#30106B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
  },
  heroCardWide: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl,
  },
  heroContent: {
    minWidth: 0,
    flex: 1,
    gap: spacing.sm,
  },
  heroTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  heroIconAnchor: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  heroTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.onPrimary,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  heroDescription: {
    minWidth: 0,
    color: "rgba(255,255,255,0.86)",
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  heroAction: {
    minWidth: 0,
    width: "100%",
  },
  heroActionWide: {
    width: 248,
    flexShrink: 0,
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
  guidanceGrid: {
    minWidth: 0,
    gap: spacing.md,
  },
  guidanceGridWide: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  earningNote: {
    minWidth: 0,
    flex: 1,
    gap: spacing.md,
    backgroundColor: theme.primarySoft,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  noteHeadingRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  noteTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.primaryPressed,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: "800",
  },
  noteDescription: {
    minWidth: 0,
    width: "100%",
    color: theme.primaryPressed,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  trustCard: {
    minWidth: 0,
    flex: 1,
    gap: spacing.md,
    backgroundColor: theme.infoSoft,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  trustHeadingRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  trustTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.infoOnSoft,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: "800",
  },
  trustDescription: {
    minWidth: 0,
    width: "100%",
    color: theme.infoOnSoft,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
  },
});

import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import type { PublicTaskFeedItem, TaskId } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { LoadingState, EmptyState, ErrorState } from "../../src/components/ui/AsyncState";
import { StatusBadge } from "../../src/components/ui/StatusBadge";
import { Icon } from "../../src/components/ui/Icon";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { useSession } from "../../src/providers/SessionProvider";
import { useCategories } from "../../src/providers/CategoriesProvider";
import { isEligibleTasker } from "../../src/services/session-types";
import { theme, spacing, radii, fontSize, lineHeight, useResponsiveLayout } from "../../src/theme";
import { QuestionAndOfferPanel } from "../../src/components/task/QuestionAndOfferPanel";
import type { TaskAnswerRecord } from "../../src/services/marketplace/types";

type LoadState = "loading" | "loaded" | "empty" | "error";

function taskTimingLabel(task: PublicTaskFeedItem): string {
  if (task.sameDay) return "Needed today";
  if (!task.scheduledFor) return "Flexible schedule";
  const scheduled = new Date(task.scheduledFor);
  if (Number.isNaN(scheduled.getTime())) return "Flexible schedule";
  const weekday = scheduled.toLocaleDateString("en-US", { weekday: "long" });
  const datePart = scheduled.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `${weekday} - ${datePart}`;
}

export default function TaskDetailScreen() {
  const { id, ownershipChecked } = useLocalSearchParams<{
    id: string;
    ownershipChecked?: string;
  }>();
  const { session } = useSession();
  const { repository } = useMarketplace();
  const { nameFor } = useCategories();
  const { isTablet } = useResponsiveLayout();
  const [task, setTask] = useState<PublicTaskFeedItem | null>(null);
  const [answers, setAnswers] = useState<ReadonlyArray<TaskAnswerRecord>>([]);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    // Reset so a previously viewed task's specifics cannot flash on this one.
    setAnswers([]);
    repository
      .getPublicTask(id as TaskId)
      .then(async (result) => {
        if (cancelled) return;
        if (!result) {
          setState("empty");
          return;
        }
        // Deep links still resolve owners here. Browse cards perform the same
        // RLS-protected check before pushing and mark a confirmed public route,
        // preventing this screen from starting a second animated replacement.
        if (session && ownershipChecked !== "1") {
          const owned = await repository.getOwnedTask(id as TaskId, session.userId);
          if (!cancelled && owned) {
            router.replace({ pathname: "/task/[id]/owned", params: { id: owned.id } });
            return;
          }
        }
        if (cancelled) return;
        setTask(result);
        setState("loaded");
        // Structured answers are additive detail: a failure to read them must
        // not take down the task brief itself.
        repository
          .listTaskAnswers(id as TaskId)
          .then((rows) => {
            if (!cancelled) setAnswers(rows);
          })
          .catch(() => {
            if (!cancelled) setAnswers([]);
          });
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [id, ownershipChecked, repository, session]);

  if (state === "loading") return <LoadingState label="Loading task" />;
  if (state === "error") return <ErrorState />;
  if (state === "empty" || !task) {
    return (
      <EmptyState
        title="Task not found"
        description="This task may have been removed or is no longer available."
      />
    );
  }

  const eligibleToOffer = isEligibleTasker(session);
  const categoryLabel = nameFor(task.categoryId) ?? "Task";
  const offerLabel = task.offerCount + " offer" + (task.offerCount === 1 ? "" : "s");

  return (
    <Screen subPageTitle="Task details" keyboardAvoiding>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.page}>
        <View style={styles.briefDocument}>
          {/* Card 1: Task Summary Card */}
          <View style={styles.taskSummaryCard}>
            <Text style={styles.taskTitle} accessibilityRole="header">
              {task.title}
            </Text>
            <Text style={styles.taskDescription}>{task.description}</Text>

            {answers.length > 0 ? (
              <View style={styles.answerList}>
                {answers.map((answer) => (
                  <Text key={answer.questionId} style={styles.answerLine}>
                    <Text style={styles.answerLineLabel}>{answer.label}: </Text>
                    {answer.answer}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>

          {/* Card 2: Overview / Details Card */}
          <View style={styles.overviewCard}>
            <View style={styles.overviewTopRow}>
              <Text style={styles.overviewSectionTitle}>Task details</Text>
              <View style={styles.badgeGroup}>
                <StatusBadge tone="brand" label={categoryLabel} />
                {task.sameDay ? <StatusBadge tone="warning" label="Same-day" /> : null}
              </View>
            </View>

            {/* Spec Tiles: Schedule & Area */}
            <View style={[styles.specGrid, isTablet ? styles.specGridTablet : null]}>
              <View style={[styles.specTile, isTablet ? styles.specTileTablet : null]}>
                <View style={styles.specHeader}>
                  <Icon name="calendar" size={14} color={theme.primary} />
                  <Text style={styles.specLabel}>SCHEDULE</Text>
                </View>
                <Text style={styles.specValue}>{taskTimingLabel(task)}</Text>
              </View>

              <View style={[styles.specTile, isTablet ? styles.specTileTablet : null]}>
                <View style={styles.specHeader}>
                  <Icon name="map-pin" size={14} color={theme.primary} />
                  <Text style={styles.specLabel}>APPROXIMATE AREA</Text>
                </View>
                <Text style={styles.specValue}>
                  {task.landmark?.trim() || "Approximate area not specified"}
                </Text>
              </View>
            </View>

            {/* Formal Financial & Activity Banner */}
            <View style={styles.financialBanner}>
              <View style={styles.financialCol}>
                <Text style={styles.financialLabel}>ESTIMATED BUDGET</Text>
                <Text style={styles.financialAmount} numberOfLines={1}>
                  {formatPhp(task.budgetCentavos)}
                </Text>
              </View>
              <View style={styles.financialColRight}>
                <Text style={[styles.financialLabel, styles.financialLabelCenter]}>
                  OFFER ACTIVITY
                </Text>
                <Text style={styles.financialActivity}>{offerLabel}</Text>
              </View>
            </View>
          </View>

          {/* Privacy Notice */}
          <View style={styles.privacyStatement}>
            <View style={styles.privacyHeader}>
              <Icon name="shield" size={15} color={theme.textSecondary} />
              <Text style={styles.privacyTitle}>Private until payment is confirmed</Text>
            </View>
            <Text style={styles.privacyText}>
              The exact address and direct contact details are released only to the selected Tasker
              after provider-confirmed payment.
            </Text>
          </View>
        </View>

        <QuestionAndOfferPanel
          taskId={task.id}
          eligibleToOffer={eligibleToOffer}
          session={session}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    minWidth: 0,
    width: "100%",
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  briefDocument: {
    minWidth: 0,
    width: "100%",
    gap: spacing.md,
  },
  taskSummaryCard: {
    minWidth: 0,
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  taskTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  taskDescription: {
    minWidth: 0,
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm + 4,
  },
  answerList: {
    minWidth: 0,
    gap: 2,
    marginTop: spacing.xs,
  },
  answerLine: {
    minWidth: 0,
    color: theme.textPrimary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
  },
  answerLineLabel: {
    color: theme.textSecondary,
    fontWeight: "700",
  },
  overviewCard: {
    minWidth: 0,
    padding: spacing.md + 2,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    gap: spacing.md,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  overviewTopRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  overviewSectionTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.md,
    fontWeight: "800",
  },
  badgeGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  specGrid: {
    minWidth: 0,
    gap: spacing.sm,
  },
  specGridTablet: {
    flexDirection: "row",
    gap: spacing.md,
  },
  specTile: {
    minWidth: 0,
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: 4,
  },
  specTileTablet: {
    flex: 1,
  },
  specHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  specLabel: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  specValue: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm + 2,
    fontWeight: "700",
  },
  financialBanner: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  financialCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  financialColRight: {
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  financialLabel: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  financialLabelCenter: {
    textAlign: "center",
  },
  financialAmount: {
    color: theme.primary,
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  financialActivity: {
    color: theme.textPrimary,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: "800",
    textAlign: "center",
  },
  privacyStatement: {
    minWidth: 0,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  privacyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  privacyTitle: {
    color: theme.textSecondary,
    fontSize: fontSize.xs + 1,
    lineHeight: lineHeight.sm,
    fontWeight: "700",
    textAlign: "center",
  },
  privacyText: {
    maxWidth: 380,
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs + 4,
    textAlign: "center",
  },
});

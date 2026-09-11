import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import type { PublicTaskFeedItem, TaskId } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { LoadingState, EmptyState, ErrorState } from "../../src/components/ui/AsyncState";
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
  if (task.sameDay) return "Needed today (Same-day)";
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

function formatTaskStatus(status: PublicTaskFeedItem["status"]): string {
  switch (status) {
    case "OPEN":
      return "Open for offers";
    case "BOOKING_PENDING":
      return "Payment pending";
    case "ASSIGNED":
      return "Assigned";
    case "IN_PROGRESS":
      return "In progress";
    case "COMPLETION_REQUESTED":
      return "Completion requested";
    case "COMPLETED":
      return "Completed";
    case "EXPIRED":
      return "Expired";
    case "CANCELLED":
      return "Cancelled";
    case "DISPUTED":
      return "In dispute";
    case "DRAFT":
      return "Draft";
    case "REMOVED":
      return "Removed";
    default:
      return status;
  }
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
            <View style={styles.overviewHeader}>
              <View style={styles.overviewTitleRow}>
                <Icon name="note" size={16} color={theme.primary} />
                <Text style={styles.overviewSectionTitle} accessibilityRole="header">
                  Task details
                </Text>
              </View>
            </View>

            {/* Spec List */}
            <View style={styles.specList}>
              <View style={styles.specRow}>
                <View style={styles.specCol}>
                  <View style={styles.specHeader}>
                    <Icon name="briefcase" size={14} color={theme.primary} />
                    <Text style={styles.specLabel}>CATEGORY</Text>
                  </View>
                  <Text style={styles.specValue} numberOfLines={1}>
                    {categoryLabel}
                  </Text>
                </View>

                <View style={styles.specCol}>
                  <View style={styles.specHeader}>
                    <Icon name="check-circle" size={14} color={theme.primary} />
                    <Text style={styles.specLabel}>STATUS</Text>
                  </View>
                  <Text style={styles.specValue} numberOfLines={1}>
                    {formatTaskStatus(task.status)}
                  </Text>
                </View>
              </View>

              <View style={[styles.specRow, isTablet ? null : styles.specRowStacked]}>
                <View style={styles.specCol}>
                  <View style={styles.specHeader}>
                    <Icon name="calendar" size={14} color={theme.primary} />
                    <Text style={styles.specLabel}>SCHEDULE</Text>
                  </View>
                  <Text style={styles.specValue}>{taskTimingLabel(task)}</Text>
                </View>

                <View style={styles.specCol}>
                  <View style={styles.specHeader}>
                    <Icon name="map-pin" size={14} color={theme.primary} />
                    <Text style={styles.specLabel}>APPROXIMATE AREA</Text>
                  </View>
                  <Text style={styles.specValue}>
                    {task.landmark?.trim() || "Approximate area not specified"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Clean Financial Row with Hairline Divider */}
            <View style={styles.financialRow}>
              <View style={styles.financialCol}>
                <Text style={styles.financialLabel}>ESTIMATED BUDGET</Text>
                <Text style={styles.financialAmount} numberOfLines={1}>
                  {formatPhp(task.budgetCentavos)}
                </Text>
              </View>
              <View style={styles.financialColRight}>
                <Text style={styles.financialLabelRight}>OFFER ACTIVITY</Text>
                <Text style={styles.financialActivity}>{offerLabel}</Text>
              </View>
            </View>
          </View>
        </View>

        <QuestionAndOfferPanel
          taskId={task.id}
          eligibleToOffer={eligibleToOffer}
          session={session}
        />

        {/* Privacy Notice - at most bottom last */}
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
    padding: spacing.lg,
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
  overviewHeader: {
    minWidth: 0,
    gap: spacing.xs,
  },
  overviewTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  overviewSectionTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: "800",
  },
  specList: {
    minWidth: 0,
    gap: spacing.md,
  },
  specRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  specRowStacked: {
    flexDirection: "column",
    gap: spacing.md,
  },
  specCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
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
  financialRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    gap: spacing.md,
  },
  financialCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  financialColRight: {
    minWidth: 0,
    alignItems: "flex-end",
    justifyContent: "flex-end",
    gap: 2,
  },
  financialLabel: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  financialLabelRight: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    textAlign: "right",
  },
  financialAmount: {
    color: theme.primary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  financialActivity: {
    color: theme.textPrimary,
    fontSize: fontSize.md,
    lineHeight: 28,
    fontWeight: "800",
    textAlign: "right",
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

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
  return scheduled.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
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
    <Screen subPageTitle="Task details">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.page}>
        <View style={styles.briefDocument}>
          <View style={styles.titleCard}>
            <View style={styles.badgeRow}>
              <StatusBadge tone="brand" label={categoryLabel} />
              <StatusBadge tone="success" label="Open" />
              {task.sameDay ? <StatusBadge tone="warning" label="Same-day" /> : null}
            </View>

            <View style={styles.titleBlock}>
              <Text style={styles.title} accessibilityRole="header">
                {task.title}
              </Text>
              <Text style={styles.description}>{task.description}</Text>
            </View>

            {/*
              Category-specific specifics the Client answered when posting (property
              type, stairs, key items). Shown as their own labelled rows because
              this is what a Tasker actually quotes against.
            */}
            {answers.length > 0 ? (
              <View style={styles.answerList}>
                <Text style={styles.eyebrow}>TASK SPECIFICS</Text>
                {answers.map((answer) => (
                  <View key={answer.questionId} style={styles.answerRow}>
                    <Text style={styles.answerLabel}>{answer.label}</Text>
                    <Text style={styles.answerValue}>{answer.answer}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <View style={[styles.summaryRow, isTablet ? styles.summaryRowTablet : null]}>
            <View style={[styles.summaryItem, isTablet ? styles.summaryItemTablet : null]}>
              <Text style={styles.summaryLabel}>BUDGET</Text>
              <Text style={styles.budget}>{formatPhp(task.budgetCentavos)}</Text>
            </View>
            <View style={isTablet ? styles.summaryDividerTablet : styles.summaryDivider} />
            <View style={[styles.summaryItem, isTablet ? styles.summaryItemTablet : null]}>
              <Text style={styles.summaryLabel}>OFFER ACTIVITY</Text>
              <Text style={styles.summaryValue}>{offerLabel}</Text>
            </View>
          </View>

          <View style={[styles.detailTable, isTablet ? styles.detailTableTablet : null]}>
            <View style={[styles.detailBlock, isTablet ? styles.detailBlockTablet : null]}>
              <View style={styles.detailHeader}>
                <Icon name="calendar" size={20} color={theme.primary} />
                <Text style={styles.detailLabel}>SCHEDULE</Text>
              </View>
              <Text style={styles.detailValue}>{taskTimingLabel(task)}</Text>
            </View>
            <View style={isTablet ? styles.detailDividerTablet : styles.detailDivider} />
            <View style={[styles.detailBlock, isTablet ? styles.detailBlockTablet : null]}>
              <View style={styles.detailHeader}>
                <Icon name="map-pin" size={20} color={theme.primary} />
                <Text style={styles.detailLabel}>APPROXIMATE AREA</Text>
              </View>
              <Text style={styles.detailValue}>{task.landmark}</Text>
            </View>
          </View>

          <View style={styles.privacyStatement}>
            <View style={styles.privacyHeader}>
              <Icon name="shield" size={20} color={theme.textSecondary} />
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
    gap: spacing.lg,
  },
  titleCard: {
    minWidth: 0,
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  taskTypeChip: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  titleBlock: {
    minWidth: 0,
    gap: spacing.sm,
  },
  eyebrow: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: {
    color: theme.textPrimary,
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: "800",
  },
  description: {
    color: theme.textSecondary,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
  },
  answerList: {
    minWidth: 0,
    width: "100%",
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderColor: theme.borderSubtle,
  },
  answerRow: {
    minWidth: 0,
    gap: 2,
  },
  answerLabel: {
    minWidth: 0,
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: "700",
  },
  answerValue: {
    minWidth: 0,
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
  },
  summaryRow: {
    minWidth: 0,
    width: "100%",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.borderSubtle,
  },
  summaryRowTablet: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  summaryItem: {
    minWidth: 0,
    gap: spacing.xs,
  },
  summaryItemTablet: {
    flex: 1,
  },
  summaryDivider: {
    height: 1,
    marginVertical: spacing.md,
    backgroundColor: theme.borderSubtle,
  },
  summaryDividerTablet: {
    width: 1,
    alignSelf: "stretch",
    marginHorizontal: spacing.md,
    backgroundColor: theme.borderSubtle,
  },
  summaryLabel: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  budget: {
    color: theme.primary,
    fontSize: fontSize.xl,
    fontWeight: "800",
  },
  summaryValue: {
    color: theme.textPrimary,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: "800",
  },
  detailTable: {
    minWidth: 0,
    width: "100%",
    overflow: "hidden",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.borderSubtle,
  },
  detailTableTablet: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  detailBlock: {
    minWidth: 0,
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  detailBlockTablet: {
    flex: 1,
  },
  detailHeader: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  detailLabel: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  detailValue: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
  },
  detailDivider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
  },
  detailDividerTablet: {
    width: 1,
    alignSelf: "stretch",
    marginHorizontal: spacing.md,
    backgroundColor: theme.borderSubtle,
  },
  privacyStatement: {
    minWidth: 0,
    gap: spacing.sm,
  },
  privacyHeader: {
    minWidth: 0,
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  privacyTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "700",
  },
  privacyText: {
    minWidth: 0,
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
});

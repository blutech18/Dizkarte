import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import type { TaskId } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { Screen } from "../../../src/components/ui/Screen";
import { Button } from "../../../src/components/ui/Button";
import { Icon, type IconName } from "../../../src/components/ui/Icon";
import { StatusBadge } from "../../../src/components/ui/StatusBadge";
import { CenterDialogModal } from "../../../src/components/ui/CenterDialogModal";
import {
  AnimatedFilterPressable,
  AnimatedFilterText,
  AnimatedFilterView,
} from "../../../src/components/ui/AnimatedFilterPressable";
import { LoadingState, ErrorState, DeniedState } from "../../../src/components/ui/AsyncState";
import { useSession } from "../../../src/providers/SessionProvider";
import { useMarketplace } from "../../../src/providers/MarketplaceProvider";
import type {
  OfferRecord,
  OwnedTaskRecord,
  TaskAnswerRecord,
  TaskQuestionRecord,
} from "../../../src/services/marketplace/types";
import { timeOfDayLabel } from "../../../src/components/task/taskDraftValue";
import {
  theme,
  spacing,
  fontSize,
  lineHeight,
  radii,
  useResponsiveLayout,
} from "../../../src/theme";

type LoadState = "loading" | "loaded" | "denied" | "error";
type ActivityTabId = "offers" | "questions";

/** Respect the device/browser motion preference for activity-panel transitions. */
function useReducedMotionPreference(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

function taskTimingLabel(task: OwnedTaskRecord["draft"]): string {
  const period = timeOfDayLabel(task.timeOfDay);
  const suffix = period ? ` · ${period}` : "";
  if (task.sameDay) return `Needed today${suffix}`;
  if (!task.scheduledFor) return `Flexible schedule${suffix}`;
  const scheduled = new Date(task.scheduledFor);
  if (Number.isNaN(scheduled.getTime())) return `Flexible schedule${suffix}`;
  return `${scheduled.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  })}${suffix}`;
}

const STATUS_PRESENTATION: Record<
  OwnedTaskRecord["status"],
  { readonly label: string; readonly tone: "success" | "warning" | "info" | "neutral" | "brand" }
> = {
  DRAFT: { label: "Draft", tone: "warning" },
  OPEN: { label: "Published", tone: "success" },
  BOOKING_PENDING: { label: "Payment pending", tone: "warning" },
  ASSIGNED: { label: "Assigned", tone: "info" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  COMPLETION_REQUESTED: { label: "Awaiting your confirmation", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  DISPUTED: { label: "In dispute", tone: "warning" },
  REMOVED: { label: "Removed", tone: "neutral" },
};

function shortDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function OwnedTaskPageShell({ children }: { readonly children: ReactNode }) {
  return (
    <Screen subPageTitle="Your task">
      <Stack.Screen options={{ headerShown: false }} />
      {children}
    </Screen>
  );
}

/**
 * Owner-only task detail with questions, offer comparison and conflict-safe
 * selection. OPEN tasks use the explicit Waiting for offers checkpoint.
 */
export default function OwnedTaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, status } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const [task, setTask] = useState<OwnedTaskRecord | null>(null);
  const [questions, setQuestions] = useState<ReadonlyArray<TaskQuestionRecord>>([]);
  const [offers, setOffers] = useState<ReadonlyArray<OfferRecord>>([]);
  const [answers, setAnswers] = useState<ReadonlyArray<TaskAnswerRecord>>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [selecting, setSelecting] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  /**
   * Which side of the task's activity is showing. Offers lead because that is
   * the decision the Client is here to make; questions are the supporting
   * conversation. Mirrors the reference flow's "Offers / Questions" tabs.
   */
  const reduceMotion = useReducedMotionPreference();
  const [activityTab, setActivityTab] = useState<ActivityTabId>("offers");
  const [visibleActivityTab, setVisibleActivityTab] = useState<ActivityTabId>("offers");
  const activityTabRef = useRef<ActivityTabId>("offers");
  const activityTransitionRequestRef = useRef(0);
  const activityOpacity = useRef(new Animated.Value(1)).current;
  const activityTranslateX = useRef(new Animated.Value(0)).current;
  const [showCancel, setShowCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    repository
      .getOwnedTask(id as TaskId, session.userId)
      .then(async (result) => {
        if (!result) {
          setState("denied");
          return;
        }
        const [q, o, a] = await Promise.all([
          repository.listQuestions(result.id),
          repository.listOffers(result.id, session.userId),
          repository.listTaskAnswers(result.id),
        ]);
        setTask(result);
        setQuestions(q);
        setOffers(o);
        setAnswers(a);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [id, repository, session]);

  useEffect(() => {
    load();
  }, [load]);

  const handleActivityTabChange = useCallback(
    (nextTab: ActivityTabId) => {
      if (nextTab === activityTabRef.current) return;

      activityTabRef.current = nextTab;
      setActivityTab(nextTab);
      const requestId = activityTransitionRequestRef.current + 1;
      activityTransitionRequestRef.current = requestId;
      const direction = nextTab === "questions" ? 1 : -1;

      activityOpacity.stopAnimation();
      activityTranslateX.stopAnimation();
      if (reduceMotion) {
        setVisibleActivityTab(nextTab);
        activityOpacity.setValue(1);
        activityTranslateX.setValue(0);
        return;
      }

      Animated.parallel([
        Animated.timing(activityOpacity, {
          toValue: 0,
          duration: 100,
          easing: Easing.in(Easing.quad),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(activityTranslateX, {
          toValue: -direction * 8,
          duration: 100,
          easing: Easing.in(Easing.quad),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start(({ finished }) => {
        if (!finished || requestId !== activityTransitionRequestRef.current) return;

        setVisibleActivityTab(nextTab);
        activityOpacity.setValue(0);
        activityTranslateX.setValue(direction * 10);
        requestAnimationFrame(() => {
          if (requestId !== activityTransitionRequestRef.current) return;
          Animated.parallel([
            Animated.timing(activityOpacity, {
              toValue: 1,
              duration: 190,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: Platform.OS !== "web",
            }),
            Animated.timing(activityTranslateX, {
              toValue: 0,
              duration: 190,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: Platform.OS !== "web",
            }),
          ]).start();
        });
      });
    },
    [activityOpacity, activityTranslateX, reduceMotion],
  );

  useEffect(() => {
    if (!reduceMotion) return;
    activityTransitionRequestRef.current += 1;
    activityOpacity.stopAnimation();
    activityTranslateX.stopAnimation();
    setVisibleActivityTab(activityTabRef.current);
    activityOpacity.setValue(1);
    activityTranslateX.setValue(0);
  }, [activityOpacity, activityTranslateX, reduceMotion]);

  useEffect(
    () => () => {
      activityTransitionRequestRef.current += 1;
      activityOpacity.stopAnimation();
      activityTranslateX.stopAnimation();
    },
    [activityOpacity, activityTranslateX],
  );

  const handleSelect = useCallback(
    async (offer: OfferRecord) => {
      if (!session || !task) return;
      setSelecting(offer.id);
      setSelectError(null);
      try {
        const idempotencyKey = `select-${task.id}-${offer.id}`;
        const outcome = await repository.selectOffer(
          task.id,
          offer.id,
          session.userId,
          idempotencyKey,
        );
        if (!outcome.ok) {
          setSelectError(
            outcome.reason === "ALREADY_ASSIGNED"
              ? "This task already has an active booking. Refresh to see its status."
              : outcome.reason === "OFFER_NOT_ELIGIBLE"
                ? "This offer is no longer available."
                : "You are not allowed to select an offer for this task.",
          );
          load();
          return;
        }
        notifyChanged();
        router.push({ pathname: "/booking/[id]", params: { id: outcome.bookingId } });
      } finally {
        setSelecting(null);
      }
    },
    [repository, session, task, notifyChanged, load],
  );

  /**
   * Retire an unbooked task. On success the Client leaves the task workspace —
   * the task is no longer actionable, so staying on it would be a dead end.
   */
  const handleCancel = useCallback(async () => {
    if (!session || !task) return;
    setCancelError(null);
    setCancelling(true);
    try {
      const outcome = await repository.cancelOwnTask(task.id, session.userId);
      if (!outcome.ok) {
        setCancelError(outcome.reason ?? "Could not cancel this task.");
        setShowCancel(false);
        load();
        return;
      }
      notifyChanged();
      setShowCancel(false);
      router.replace("/(tabs)/my-tasks");
    } catch {
      setCancelError("Could not cancel this task. Check your connection and try again.");
      setShowCancel(false);
    } finally {
      setCancelling(false);
    }
  }, [repository, session, task, notifyChanged, load]);

  if (status === "loading") {
    return (
      <OwnedTaskPageShell>
        <LoadingState label="Loading" />
      </OwnedTaskPageShell>
    );
  }
  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (state === "loading") {
    return (
      <OwnedTaskPageShell>
        <LoadingState label="Loading task" />
      </OwnedTaskPageShell>
    );
  }
  if (state === "error") {
    return (
      <OwnedTaskPageShell>
        <ErrorState onRetry={load} />
      </OwnedTaskPageShell>
    );
  }
  if (state === "denied" || !task) {
    return (
      <OwnedTaskPageShell>
        <DeniedState title="Task not found" description="This task could not be loaded." />
      </OwnedTaskPageShell>
    );
  }

  const canSelectOffer = task.status === "OPEN" && !task.activeBookingId;
  const paymentPending = task.status === "BOOKING_PENDING" && task.activeBookingId;

  return (
    <OwnedTaskPageShell>
      <View style={styles.container}>
        <View style={styles.ownedTaskDocument}>
          <View style={styles.taskSummary}>
            <Text style={styles.taskTitle} accessibilityRole="header">
              {task.draft.title || "Untitled task"}
            </Text>
            <Text style={styles.taskDescription}>
              {task.draft.description || "No description added."}
            </Text>
            {/* The category specifics answered when posting, as Taskers see them. */}
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

          <View style={styles.overviewCard}>
            <View style={styles.summaryTopRow}>
              <View style={styles.taskTypeChip}>
                <Icon name="briefcase" size={15} color={theme.primary} />
                <Text style={styles.taskSummaryLabel}>YOUR TASK</Text>
              </View>
              <StatusBadge
                tone={STATUS_PRESENTATION[task.status].tone}
                label={STATUS_PRESENTATION[task.status].label}
                accessibilityLabel={`Task status: ${STATUS_PRESENTATION[task.status].label}`}
              />
            </View>

            <View style={styles.overviewDivider} />

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>SCHEDULE</Text>
              <Text style={styles.metaValue}>{taskTimingLabel(task.draft)}</Text>
            </View>

            <View style={styles.overviewDivider} />

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>
                {task.draft.locationType === "online" ? "LOCATION" : "APPROXIMATE AREA"}
              </Text>
              <Text style={styles.metaValue}>
                {task.draft.locationType === "online"
                  ? "Online / Remote"
                  : task.draft.dropoffLandmark
                    ? `${task.draft.landmark || "No landmark set"} → ${task.draft.dropoffLandmark}`
                    : task.draft.landmark || "No landmark set"}
              </Text>
            </View>

            <View style={styles.overviewDivider} />

            <View style={styles.budgetRow}>
              <Text style={styles.budgetLabel}>Budget</Text>
              <Text
                style={styles.budgetAmount}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {formatPhp(task.draft.budgetCentavos)}
              </Text>
            </View>

            {task.activeBookingId ? (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/booking/[id]",
                    params: { id: task.activeBookingId! },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel="View active booking"
                style={({ pressed }) => [
                  styles.bookingButton,
                  pressed ? styles.bookingButtonPressed : null,
                ]}
              >
                <Icon name="note" size={14} color={theme.primary} />
                <Text style={styles.bookingButtonText}>Booking</Text>
                <Icon name="arrow-right" size={12} color={theme.primary} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {task.status === "OPEN" ? (
          <TaskCheckpoint
            accentColor={theme.successSolid}
            stateColor={theme.successOnSoft}
            stateLabel="Live"
            icon="eye"
            title="Waiting for offers"
            description="Your task is visible to approved Taskers. Questions and offers will appear below as they arrive."
            leftLabel="Tasker visibility"
            leftValue="Live in the marketplace"
            rightLabel="Next step"
            rightValue="Compare incoming offers"
          />
        ) : null}

        {paymentPending ? (
          <TaskCheckpoint
            accentColor={theme.warningSolid}
            stateColor={theme.warningOnSoft}
            stateLabel="Action needed"
            icon="wallet"
            title="Payment pending"
            description="You selected an offer. Funds become protected only after the payment provider confirms the booking."
            leftLabel="Booking state"
            leftValue="Not active yet"
            rightLabel="Payment status"
            rightValue="Awaiting provider confirmation"
          >
            <Button
              label="Go to booking"
              icon="arrow-right"
              onPress={() =>
                router.push({ pathname: "/booking/[id]", params: { id: task.activeBookingId! } })
              }
              variant="secondary"
              fullWidth
            />
          </TaskCheckpoint>
        ) : null}

        {/*
          Offers and questions are two views of the same activity on this task,
          so they share one card and a tab switch that carries their counts —
          the Client sees "how many offers / how many questions" at a glance
          without scrolling past one list to reach the other.
        */}
        <View style={styles.sectionCard}>
          <View style={styles.activityTabBar} accessibilityRole="tablist">
            <ActivityTab
              label="Offers"
              count={offers.length}
              active={activityTab === "offers"}
              onPress={() => handleActivityTabChange("offers")}
            />
            <ActivityTab
              label="Questions"
              count={questions.length}
              active={activityTab === "questions"}
              onPress={() => handleActivityTabChange("questions")}
            />
          </View>

          <Animated.View
            style={[
              styles.activityPanel,
              {
                opacity: activityOpacity,
                transform: [{ translateX: activityTranslateX }],
              },
            ]}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${visibleActivityTab === "offers" ? "Offers" : "Questions"} activity`}
          >
            {visibleActivityTab === "offers" ? (
              <>
                <Text style={styles.activityHint}>
                  Compare price, trust signals, timing, and relevant experience before selecting.
                </Text>

                {offers.length === 0 ? (
                  <EmptyState
                    icon="briefcase"
                    title="No offers yet"
                    description="Approved Taskers who submit an offer will appear here for comparison."
                  />
                ) : (
                  <View style={styles.offerList}>
                    {offers.map((offer) => (
                      <OfferRow
                        key={offer.id}
                        offer={offer}
                        canSelect={canSelectOffer}
                        selecting={selecting === offer.id}
                        onSelect={() => handleSelect(offer)}
                      />
                    ))}
                  </View>
                )}

                {selectError ? (
                  <View style={styles.errorBanner}>
                    <Icon name="alert-circle" size={16} color={theme.errorOnSoft} />
                    <Text
                      style={styles.errorBannerText}
                      accessibilityRole="alert"
                      accessibilityLiveRegion="polite"
                    >
                      {selectError}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.activityHint}>
                  Answer Tasker questions about scope, timing, or access before they make an offer.
                </Text>

                {questions.length === 0 ? (
                  <EmptyState
                    icon="chat"
                    title="No questions yet"
                    description="Questions posted by Taskers will appear here for your reply."
                  />
                ) : (
                  <View style={styles.questionList}>
                    {questions.map((question, index) => (
                      <QuestionRow
                        key={question.id}
                        question={question}
                        separated={index < questions.length - 1}
                        onAnswer={async (answer) => {
                          if (!session) return;
                          const updated = await repository.answerQuestion(
                            question.id as unknown as string,
                            task.id,
                            session.userId,
                            answer,
                          );
                          setQuestions((prev) =>
                            prev.map((q) => (q.id === updated.id ? updated : q)),
                          );
                          notifyChanged();
                        }}
                      />
                    ))}
                  </View>
                )}
              </>
            )}
          </Animated.View>
        </View>

        <View style={styles.sectionCard}>
          <SectionHeading
            icon="shield"
            title="Need help?"
            description="Report an issue connected to this task and its marketplace activity."
          />
          <Button
            label="Report a problem with this task"
            icon="alert-circle"
            onPress={() =>
              router.push({
                pathname: "/support",
                params: { subjectType: "task", subjectId: task.id },
              })
            }
            variant="secondary"
            fullWidth
          />
        </View>

        {/*
          Cancelling is only offered while the task carries no booking. Once an
          offer is selected there is money or a commitment attached and the
          outcome depends on the cancellation policy (decision D13), so the
          action is withheld rather than guessing at a refund.
        */}
        {task.status === "DRAFT" || task.status === "OPEN" ? (
          <View style={styles.sectionCard}>
            <SectionHeading
              icon="close"
              title="No longer need this done?"
              description={
                offers.length > 0
                  ? `Cancelling withdraws this task from the marketplace and closes ${offers.length === 1 ? "the offer" : `all ${offers.length} offers`} on it.`
                  : "Cancelling withdraws this task from the marketplace. You can always post it again."
              }
            />
            {cancelError ? (
              <View style={styles.errorBanner}>
                <Icon name="alert-circle" size={16} color={theme.errorOnSoft} />
                <Text
                  style={styles.errorBannerText}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                >
                  {cancelError}
                </Text>
              </View>
            ) : null}
            <Button
              label="Cancel this task"
              icon="close"
              variant="secondary"
              fullWidth
              onPress={() => setShowCancel(true)}
            />
          </View>
        ) : null}
      </View>

      <CenterDialogModal
        visible={showCancel}
        onClose={() => !cancelling && setShowCancel(false)}
        dismissible={!cancelling}
      >
        <View style={styles.cancelCard}>
          <View style={styles.cancelIconBox}>
            <Icon name="alert-circle" size={24} color={theme.errorSolid} />
          </View>
          <Text style={styles.cancelTitle}>Cancel this task?</Text>
          <Text style={styles.cancelMessage}>
            {offers.length > 0
              ? `This removes "${task.draft.title}" from the marketplace and closes ${offers.length === 1 ? "the offer" : `all ${offers.length} offers`} on it. Taskers who offered will be notified.`
              : `This removes "${task.draft.title}" from the marketplace. This cannot be undone.`}
          </Text>
          <View style={styles.cancelActions}>
            <Button
              label="Cancel task"
              variant="destructive"
              loading={cancelling}
              fullWidth
              onPress={() => void handleCancel()}
            />
            <Button
              label="Keep task"
              variant="secondary"
              disabled={cancelling}
              fullWidth
              onPress={() => setShowCancel(false)}
            />
          </View>
        </View>
      </CenterDialogModal>
    </OwnedTaskPageShell>
  );
}

/**
 * One tab in the Offers / Questions switch, carrying its own live count.
 *
 * The count sits in the tab itself (not a separate metric row) so the Client
 * can compare "3 offers / 5 questions" without changing tabs, matching the
 * reference flow's tab headers.
 */
function ActivityTab({
  label,
  count,
  active,
  onPress,
}: {
  readonly label: string;
  readonly count: number;
  readonly active: boolean;
  readonly onPress: () => void;
}) {
  return (
    <AnimatedFilterPressable
      selected={active}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={`${label}, ${count} ${count === 1 ? "item" : "items"}`}
      inactiveBackgroundColor={theme.surfaceSubtle}
      selectedBackgroundColor={theme.surface}
      inactiveBorderColor="transparent"
      selectedBorderColor={theme.borderSubtle}
      pressScale={0.985}
      style={styles.activityTab}
    >
      <AnimatedFilterText
        style={styles.activityTabLabel}
        inactiveColor={theme.textSecondary}
        selectedColor={theme.primary}
        numberOfLines={1}
      >
        {label}
      </AnimatedFilterText>
      <AnimatedFilterView
        style={styles.activityTabCount}
        inactiveBackgroundColor={theme.borderSubtle}
        selectedBackgroundColor={theme.primarySoft}
      >
        <AnimatedFilterText
          style={styles.activityTabCountText}
          inactiveColor={theme.textSecondary}
          selectedColor={theme.primaryPressed}
          numberOfLines={1}
        >
          {count}
        </AnimatedFilterText>
      </AnimatedFilterView>
    </AnimatedFilterPressable>
  );
}

function TaskCheckpoint({
  accentColor,
  stateColor,
  stateLabel,
  icon,
  title,
  description,
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  children,
}: {
  readonly accentColor: string;
  readonly stateColor: string;
  readonly stateLabel: string;
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
  readonly leftLabel: string;
  readonly leftValue: string;
  readonly rightLabel: string;
  readonly rightValue: string;
  readonly children?: ReactNode;
}) {
  const { isTablet, isCompactPhone, isNarrowPhone } = useResponsiveLayout();
  const checkpointTitleSize = isTablet
    ? fontSize.lg
    : isNarrowPhone
      ? fontSize.sm
      : isCompactPhone
        ? fontSize.md - 1
        : fontSize.md;
  const checkpointTitleLineHeight = checkpointTitleSize + 6;

  return (
    <View style={[styles.checkpointCard, isCompactPhone ? { padding: spacing.md } : undefined]}>
      <View style={styles.checkpointHeader}>
        <View style={styles.checkpointTitleRow}>
          <View style={[styles.checkpointTitleIcon, { height: checkpointTitleLineHeight }]}>
            <Icon name={icon} size={20} color={accentColor} />
          </View>
          <Text
            style={[
              styles.checkpointTitle,
              { fontSize: checkpointTitleSize, lineHeight: checkpointTitleLineHeight },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.88}
            accessibilityRole="header"
          >
            {title}
          </Text>
        </View>

        <View
          style={styles.checkpointState}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`Status: ${stateLabel}`}
        >
          <View style={[styles.checkpointStateDot, { backgroundColor: accentColor }]} />
          <Text style={[styles.checkpointStateText, { color: stateColor }]}>{stateLabel}</Text>
        </View>
      </View>

      <Text style={styles.checkpointDescription}>{description}</Text>

      <View style={[styles.checkpointFacts, isTablet ? styles.checkpointFactsTablet : undefined]}>
        <View style={[styles.checkpointFact, isTablet ? styles.checkpointFactTablet : undefined]}>
          <Text style={styles.checkpointFactLabel}>{leftLabel}</Text>
          <Text style={styles.checkpointFactValue}>{leftValue}</Text>
        </View>
        <View
          style={[
            styles.checkpointFact,
            styles.checkpointFactSecondary,
            isTablet ? styles.checkpointFactTablet : undefined,
            isTablet ? styles.checkpointFactSecondaryTablet : undefined,
          ]}
        >
          <Text style={styles.checkpointFactLabel}>{rightLabel}</Text>
          <Text style={styles.checkpointFactValue}>{rightValue}</Text>
        </View>
      </View>

      {children ? <View style={styles.checkpointAction}>{children}</View> : null}
    </View>
  );
}

function SectionHeading({
  icon,
  title,
  description,
  count,
  countLabel,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
  readonly count?: number;
  readonly countLabel?: string;
}) {
  return (
    <View style={styles.sectionHeadingBlock}>
      <View style={styles.sectionHeadingTop}>
        <View style={styles.sectionTitleRow}>
          <Icon name={icon} size={20} color={theme.primary} />
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {title}
          </Text>
        </View>
        {count !== undefined ? (
          <StatusBadge
            tone="neutral"
            label={String(count)}
            accessibilityLabel={countLabel ?? String(count)}
          />
        ) : null}
      </View>
      <Text style={styles.sectionDescription}>{description}</Text>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <View
      style={styles.emptyRow}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${title}. ${description}`}
    >
      <View style={styles.emptyTitleRow}>
        <View style={styles.emptyTitleIcon}>
          <Icon name={icon} size={20} color={theme.primary} />
        </View>
        <Text style={styles.emptyTitle}>{title}</Text>
      </View>
      <Text style={styles.emptyDescription}>{description}</Text>
    </View>
  );
}

function OfferRow({
  offer,
  canSelect,
  selecting,
  onSelect,
}: {
  readonly offer: OfferRecord;
  readonly canSelect: boolean;
  readonly selecting: boolean;
  readonly onSelect: () => void;
}) {
  const unavailable =
    offer.status === "WITHDRAWN" || offer.status === "REJECTED" || offer.status === "EXPIRED";
  const selected = offer.status === "SELECTED";

  return (
    <View
      style={[
        styles.offerCard,
        selected ? styles.offerCardSelected : undefined,
        unavailable ? styles.offerCardUnavailable : undefined,
      ]}
    >
      <View style={styles.offerHeaderRow}>
        <Pressable
          onPress={() => router.push({ pathname: "/profile/[id]", params: { id: offer.taskerId } })}
          accessibilityRole="button"
          accessibilityLabel={`View ${offer.taskerDisplayName}'s profile`}
          style={({ pressed }) => [styles.offerTaskerButton, pressed ? { opacity: 0.7 } : null]}
        >
          <Text style={styles.offerTaskerName} numberOfLines={1}>
            {offer.taskerDisplayName}
          </Text>
          <Icon name="eye" size={15} color={theme.primary} />
        </Pressable>

        <View style={styles.offerHeaderRight}>
          {selected ? <StatusBadge tone="success" label="Selected" /> : null}
          {offer.status === "WITHDRAWN" ? <StatusBadge tone="neutral" label="Withdrawn" /> : null}
          {offer.status === "REJECTED" ? <StatusBadge tone="neutral" label="Not selected" /> : null}
          {offer.status === "EXPIRED" ? <StatusBadge tone="neutral" label="Expired" /> : null}
        </View>
      </View>

      <View style={styles.trustLine}>
        {offer.taskerProfile.ratingCount > 0 ? (
          <View style={styles.trustItem}>
            <Icon name="star" size={13} color="#F59E0B" />
            <Text style={styles.trustText}>
              <Text style={styles.trustBold}>{offer.taskerProfile.ratingAverage?.toFixed(1)}</Text>{" "}
              ({offer.taskerProfile.ratingCount})
            </Text>
          </View>
        ) : (
          <Text style={styles.trustText}>No reviews yet</Text>
        )}

        <Text style={styles.trustDot}>•</Text>

        <Text style={styles.trustText}>
          <Text style={styles.trustBold}>{offer.taskerProfile.completionCount}</Text> completed
        </Text>

        {offer.taskerProfile.verifiedIdentity ? (
          <>
            <Text style={styles.trustDot}>•</Text>
            <View style={styles.trustItem}>
              <Icon name="shield" size={13} color={theme.successSolid} />
              <Text style={styles.trustVerifiedText}>Verified</Text>
            </View>
          </>
        ) : null}
      </View>

      {offer.message ? <Text style={styles.offerMessage}>{offer.message}</Text> : null}

      <View style={styles.offerDivider} />

      <View style={styles.offerTermsRow}>
        <View style={styles.offerTermItem}>
          <Text style={styles.offerTermLabel}>ETA</Text>
          <Text style={styles.offerTermValue}>{offer.etaText}</Text>
        </View>
        <View style={styles.offerTermItem}>
          <Text style={styles.offerTermLabel}>AVAILABILITY</Text>
          <Text style={styles.offerTermValue}>{offer.availabilityText}</Text>
        </View>
        <View style={styles.offerTermItem}>
          <Text style={styles.offerTermLabel}>EXPERIENCE</Text>
          <Text style={styles.offerTermValue}>{offer.experienceText}</Text>
        </View>
      </View>

      <View style={styles.offerDivider} />

      <View style={styles.offerFooter}>
        <View style={styles.offerPriceRow}>
          <Text style={styles.offerFooterLabel}>Offer amount</Text>
          <Text
            style={styles.offerFooterAmount}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {formatPhp(offer.amountCentavos)}
          </Text>
        </View>

        {canSelect && offer.status === "SUBMITTED" ? (
          <View style={styles.offerAction}>
            <Button
              label="Select this offer"
              icon="check-circle"
              onPress={onSelect}
              loading={selecting}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function QuestionRow({
  question,
  separated,
  onAnswer,
}: {
  readonly question: TaskQuestionRecord;
  readonly separated: boolean;
  readonly onAnswer: (answer: string) => Promise<void>;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | undefined>(undefined);

  async function handleSubmit() {
    const trimmed = replyText.trim();
    if (!trimmed) {
      setReplyError("Reply cannot be empty.");
      return;
    }
    setReplyError(undefined);
    setSubmitting(true);
    try {
      await onAnswer(trimmed);
      setReplyText("");
      setReplyOpen(false);
    } catch {
      setReplyError("Failed to send reply. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={[styles.questionCard, separated ? styles.questionCardSeparated : undefined]}>
      <View style={styles.questionMetaRow}>
        <View style={styles.questionAuthorLead}>
          <View style={styles.questionAvatar}>
            <Text style={styles.questionAvatarText}>
              {(question.authorDisplayName || "T").charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.questionAuthor}>{question.authorDisplayName}</Text>
        </View>
        <Text style={styles.questionDate}>{shortDateLabel(question.createdAt)}</Text>
      </View>

      <Text style={styles.questionBody}>{question.body}</Text>

      {question.answer ? (
        <View style={styles.answerBlock}>
          <Text style={styles.answerLabel}>YOUR RESPONSE</Text>
          <Text style={styles.answerBody}>{question.answer}</Text>
        </View>
      ) : (
        <>
          {replyOpen ? (
            <View style={styles.replyForm}>
              <TextInput
                style={styles.replyInput}
                placeholder="Type your reply…"
                placeholderTextColor={theme.textSecondary}
                multiline
                value={replyText}
                onChangeText={(t) => {
                  setReplyText(t);
                  if (replyError) setReplyError(undefined);
                }}
                editable={!submitting}
                accessibilityLabel="Reply to question"
              />
              {replyError ? <Text style={styles.replyError}>{replyError}</Text> : null}
              <View style={styles.replyActions}>
                <Pressable
                  style={styles.replyCancelBtn}
                  onPress={() => {
                    setReplyOpen(false);
                    setReplyText("");
                    setReplyError(undefined);
                  }}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel reply"
                >
                  <Text style={styles.replyCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.replySendBtn, submitting ? styles.replySendBtnDisabled : null]}
                  onPress={() => void handleSubmit()}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel="Send reply"
                >
                  <Icon
                    name="arrow-right"
                    size={13}
                    color={submitting ? theme.textSecondary : theme.onPrimary}
                  />
                  <Text
                    style={[styles.replySendText, submitting ? styles.replySendTextDisabled : null]}
                  >
                    {submitting ? "Sending…" : "Send reply"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              style={styles.replyOpenBtn}
              onPress={() => setReplyOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Reply to this question"
            >
              <Icon name="edit" size={13} color={theme.primary} />
              <Text style={styles.replyOpenText}>Reply</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cancelCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  cancelIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  cancelTitle: {
    fontSize: fontSize.xl,
    fontWeight: "800",
    color: theme.textPrimary,
  },
  cancelMessage: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  cancelActions: {
    width: "100%",
    gap: spacing.sm,
  },
  activityTabBar: {
    minWidth: 0,
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md,
    padding: 4,
  },
  activityTab: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.sm,
  },
  activityTabLabel: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
  activityTabCount: {
    minWidth: 22,
    flexShrink: 0,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  activityTabCountText: {
    fontSize: fontSize.xs,
    fontWeight: "800",
  },
  activityPanel: {
    minWidth: 0,
    width: "100%",
    gap: spacing.md,
  },
  activityHint: {
    minWidth: 0,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: theme.textSecondary,
    marginBottom: spacing.md,
  },

  container: {
    minWidth: 0,
    width: "100%",
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  ownedTaskDocument: {
    minWidth: 0,
    width: "100%",
  },
  taskSummary: {
    minWidth: 0,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  summaryTopRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  detailLabelRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  taskSummaryLabel: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  taskTitle: {
    minWidth: 0,
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  taskDescription: {
    minWidth: 0,
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  answerList: {
    minWidth: 0,
    gap: 2,
    marginTop: spacing.sm,
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
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  taskTypeChip: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  overviewDivider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
  },
  metaRow: {
    minWidth: 0,
    gap: 3,
    paddingVertical: 1,
  },
  metaLabel: {
    color: theme.textSecondary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  metaValue: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm + 2,
    fontWeight: "700",
  },
  budgetRow: {
    minWidth: 0,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: 2,
  },
  budgetLabel: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
  },
  budgetAmount: {
    color: theme.primary,
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    fontWeight: "800",
  },
  bookingButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    marginTop: spacing.xs,
  },
  bookingButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  bookingButtonText: {
    color: theme.primary,
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
  mobileSectionDivider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
  },
  detailSpacerMobile: {
    height: spacing.md,
  },
  detailDividerTablet: {
    width: 1,
    alignSelf: "stretch",
    marginHorizontal: spacing.md,
    backgroundColor: theme.borderSubtle,
  },
  checkpointCard: {
    minWidth: 0,
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
  },
  checkpointHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  checkpointState: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  checkpointStateDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  checkpointStateText: {
    fontSize: fontSize.xs,
    fontWeight: "700",
  },
  checkpointTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  checkpointTitleIcon: {
    width: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  checkpointTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
  },
  checkpointDescription: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  checkpointFacts: {
    minWidth: 0,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
  },
  checkpointFactsTablet: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: spacing.md,
  },
  checkpointFact: {
    minWidth: 0,
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  checkpointFactTablet: {
    flex: 1,
    paddingTop: 0,
    paddingRight: spacing.md,
    paddingBottom: 0,
  },
  checkpointFactSecondary: {
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
  },
  checkpointFactSecondaryTablet: {
    paddingRight: 0,
    paddingLeft: spacing.md,
    borderTopWidth: 0,
    borderLeftWidth: 1,
    borderLeftColor: theme.borderSubtle,
  },
  checkpointFactLabel: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  checkpointFactValue: {
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "700",
  },
  checkpointAction: {
    paddingTop: spacing.xs,
  },
  sectionCard: {
    minWidth: 0,
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
  },
  sectionHeadingBlock: {
    minWidth: 0,
    gap: spacing.sm,
  },
  sectionEyebrow: {
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  sectionHeadingTop: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sectionTitleRow: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sectionTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.textPrimary,
    fontSize: fontSize.md,
    fontWeight: "800",
  },
  sectionDescription: {
    minWidth: 0,
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  emptyRow: {
    minWidth: 0,
    width: "100%",
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
  },
  emptyTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitleIcon: {
    width: 20,
    height: lineHeight.sm,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "700",
  },
  emptyDescription: {
    minWidth: 0,
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  questionList: {
    minWidth: 0,
    width: "100%",
    gap: spacing.md,
  },
  questionCard: {
    minWidth: 0,
    width: "100%",
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  questionCardSeparated: {},
  questionMetaRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  questionAuthorLead: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  questionAvatar: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: theme.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  questionAvatarText: {
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: "800",
  },
  questionAuthor: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: "800",
  },
  questionDate: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
  },
  questionBody: {
    minWidth: 0,
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm + 4,
  },
  answerBlock: {
    minWidth: 0,
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: theme.primary,
  },
  answerLabel: {
    color: theme.primary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  answerBody: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  replyOpenBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: spacing.xs,
    paddingVertical: 4,
  },
  replyOpenText: {
    color: theme.primary,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  replyForm: {
    minWidth: 0,
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  replyInput: {
    minWidth: 0,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm + 4,
    minHeight: 72,
    textAlignVertical: "top",
  },
  replyError: {
    color: theme.errorOnSoft,
    fontSize: fontSize.xs,
  },
  replyActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    justifyContent: "flex-end",
  },
  replyCancelBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  replyCancelText: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  replySendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: theme.primary,
  },
  replySendBtnDisabled: {
    backgroundColor: theme.surfaceSubtle,
  },
  replySendText: {
    color: theme.onPrimary,
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
  replySendTextDisabled: {
    color: theme.textSecondary,
  },
  offerList: {
    minWidth: 0,
    width: "100%",
    gap: spacing.md,
  },
  offerCard: {
    minWidth: 0,
    width: "100%",
    backgroundColor: theme.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: spacing.md,
    gap: spacing.sm + 2,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  offerCardSelected: {
    borderColor: theme.primary,
    borderWidth: 1.5,
  },
  offerCardUnavailable: {
    opacity: 0.6,
  },
  offerHeaderRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  offerTaskerButton: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  offerTaskerName: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.textPrimary,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: "800",
  },
  offerHeaderRight: {
    flexShrink: 0,
  },
  trustLine: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  trustItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  trustDot: {
    color: theme.textSecondary,
    fontSize: 10,
    opacity: 0.6,
  },
  trustText: {
    color: theme.textSecondary,
    fontSize: fontSize.xs + 1,
    lineHeight: lineHeight.xs + 3,
    fontWeight: "500",
  },
  trustBold: {
    color: theme.textPrimary,
    fontWeight: "700",
  },
  trustVerifiedText: {
    color: theme.successSolid,
    fontSize: fontSize.xs + 1,
    lineHeight: lineHeight.xs + 3,
    fontWeight: "700",
  },
  offerMessage: {
    minWidth: 0,
    color: theme.textPrimary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm + 4,
  },
  offerDivider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
  },
  offerTermsRow: {
    minWidth: 0,
    gap: spacing.xs + 2,
  },
  offerTermItem: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  offerTermLabel: {
    width: 85,
    color: theme.textSecondary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  offerTermValue: {
    minWidth: 0,
    flex: 1,
    color: theme.textPrimary,
    fontSize: fontSize.xs + 1,
    lineHeight: lineHeight.xs + 3,
    fontWeight: "600",
  },
  offerFooter: {
    minWidth: 0,
    width: "100%",
    gap: spacing.sm,
    paddingTop: 2,
  },
  offerPriceRow: {
    minWidth: 0,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  offerFooterLabel: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
  },
  offerFooterAmount: {
    color: theme.primary,
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    fontWeight: "800",
  },
  offerAction: {
    minWidth: 0,
    width: "100%",
    paddingTop: spacing.xs,
  },
  errorBanner: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: theme.errorSoft,
  },
  errorBannerText: {
    minWidth: 0,
    flex: 1,
    color: theme.errorOnSoft,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
  },
});

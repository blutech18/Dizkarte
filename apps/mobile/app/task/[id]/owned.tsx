import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { createSignedUrl } from "../../../src/services/storage/upload";
import { Redirect, Stack, router, useLocalSearchParams } from "expo-router";
import type { TaskId } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { Screen } from "../../../src/components/ui/Screen";
import { Button } from "../../../src/components/ui/Button";
import { Icon, type IconName } from "../../../src/components/ui/Icon";
import { StatusBadge } from "../../../src/components/ui/StatusBadge";
import { Collapsible } from "../../../src/components/ui/Collapsible";
import { CenterDialogModal } from "../../../src/components/ui/CenterDialogModal";
import {
  AnimatedFilterPressable,
  AnimatedFilterText,
  AnimatedFilterView,
} from "../../../src/components/ui/AnimatedFilterPressable";
import { LoadingState, ErrorState, DeniedState } from "../../../src/components/ui/AsyncState";
import { useSession } from "../../../src/providers/SessionProvider";
import { useMarketplace } from "../../../src/providers/MarketplaceProvider";
import { useScreenScroll } from "../../../src/providers/ScreenScrollContext";
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
import {
  MOTION_DURATION,
  MOTION_EASING,
  MOTION_NATIVE_DRIVER,
} from "../../../src/theme/motion";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
  const weekday = scheduled.toLocaleDateString("en-US", { weekday: "long" });
  const datePart = scheduled.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `${weekday} - ${datePart}${suffix}`;
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
    <Screen subPageTitle="Your task" keyboardAvoiding>
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
  const [showAllOffers, setShowAllOffers] = useState(false);
  const [showAllQuestions, setShowAllQuestions] = useState(false);

  /**
   * Sort offers to prioritize top-rated, most completed, and verified Taskers.
   * Must be declared here (before any early returns) to satisfy the Rules of Hooks.
   * 1. Selected offer (if any) is always pinned at the top.
   * 2. Verified Taskers first.
   * 3. Highest average rating (5.0 -> 1.0).
   * 4. Most review count.
   * 5. Most completed tasks.
   */
  const sortedOffers = useMemo(() => {
    return [...offers].sort((a, b) => {
      if (a.status === "SELECTED" && b.status !== "SELECTED") return -1;
      if (b.status === "SELECTED" && a.status !== "SELECTED") return 1;

      const aVerified = a.taskerProfile.verifiedIdentity ? 1 : 0;
      const bVerified = b.taskerProfile.verifiedIdentity ? 1 : 0;
      if (aVerified !== bVerified) return bVerified - aVerified;

      const aRating = a.taskerProfile.ratingAverage ?? 0;
      const bRating = b.taskerProfile.ratingAverage ?? 0;
      if (aRating !== bRating) return bRating - aRating;

      const aReviews = a.taskerProfile.ratingCount ?? 0;
      const bReviews = b.taskerProfile.ratingCount ?? 0;
      if (aReviews !== bReviews) return bReviews - aReviews;

      const aCompleted = a.taskerProfile.completionCount ?? 0;
      const bCompleted = b.taskerProfile.completionCount ?? 0;
      if (aCompleted !== bCompleted) return bCompleted - aCompleted;

      return 0;
    });
  }, [offers]);

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
  const displayedOffers = showAllOffers ? sortedOffers : sortedOffers.slice(0, 3);
  const displayedQuestions = showAllQuestions ? questions : questions.slice(0, 3);

  return (
    <OwnedTaskPageShell>
      <View style={styles.container}>
        <View style={styles.ownedTaskDocument}>
          <View style={styles.taskSummaryCard}>
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
              <Text style={styles.overviewSectionTitle}>Details</Text>
              <StatusBadge
                tone={STATUS_PRESENTATION[task.status].tone}
                label={STATUS_PRESENTATION[task.status].label}
                accessibilityLabel={`Task status: ${STATUS_PRESENTATION[task.status].label}`}
              />
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaLabelRow}>
                <Icon name="calendar" size={14} color={theme.primary} />
                <Text style={styles.metaLabel}>SCHEDULE</Text>
              </View>
              <Text style={styles.metaValue}>{taskTimingLabel(task.draft)}</Text>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaLabelRow}>
                <Icon name="map-pin" size={14} color={theme.primary} />
                <Text style={styles.metaLabel}>
                  {task.draft.locationType === "online" ? "LOCATION" : "APPROXIMATE AREA"}
                </Text>
              </View>
              <Text style={styles.metaValue}>
                {task.draft.locationType === "online"
                  ? "Online / Remote"
                  : task.draft.dropoffLandmark
                    ? `${task.draft.landmark || "No landmark set"} → ${task.draft.dropoffLandmark}`
                    : task.draft.landmark || "No landmark set"}
              </Text>
            </View>

            <View style={styles.budgetRow}>
              <Text style={styles.budgetLabel}>Budget</Text>
              <Text style={styles.budgetAmount} numberOfLines={1}>
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
                <Icon name="note" size={13} color={theme.primary} />
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

                {sortedOffers.length === 0 ? (
                  <EmptyState
                    icon="briefcase"
                    title="No offers yet"
                    description="Approved Taskers who submit an offer will appear here for comparison."
                  />
                ) : (
                  <View style={styles.offerList}>
                    {displayedOffers.map((offer) => (
                      <OfferRow
                        key={offer.id}
                        offer={offer}
                        canSelect={canSelectOffer}
                        selecting={selecting === offer.id}
                        onSelect={() => handleSelect(offer)}
                      />
                    ))}

                    {sortedOffers.length > 3 ? (
                      <View style={styles.expandAction}>
                        <Button
                          label={
                            showAllOffers
                              ? "Show top 3 offers"
                              : `Show all ${sortedOffers.length} offers (${sortedOffers.length - 3} more)`
                          }
                          icon={showAllOffers ? "chevron-up" : "chevron-down"}
                          variant="secondary"
                          size="sm"
                          onPress={() => setShowAllOffers((prev) => !prev)}
                        />
                      </View>
                    ) : null}
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
                    {displayedQuestions.map((question, index) => (
                      <QuestionRow
                        key={question.id}
                        question={question}
                        separated={index < displayedQuestions.length - 1}
                        onAnswer={async (answer) => {
                          if (!session) return;
                          const updated = await repository.answerQuestion(
                            question.id as unknown as string,
                            task.id,
                            session.userId,
                            answer,
                          );
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setQuestions((prev) =>
                            prev.map((q) => (q.id === updated.id ? updated : q)),
                          );
                          notifyChanged();
                        }}
                        onDeleteAnswer={async () => {
                          if (!session) return;
                          const updated = await repository.deleteAnswer(
                            question.id as unknown as string,
                            task.id,
                            session.userId,
                          );
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setQuestions((prev) =>
                            prev.map((q) => (q.id === updated.id ? updated : q)),
                          );
                          notifyChanged();
                        }}
                      />
                    ))}

                    {questions.length > 3 ? (
                      <View style={styles.expandAction}>
                        <Button
                          label={
                            showAllQuestions
                              ? "Show top 3 questions"
                              : `Show all ${questions.length} questions (${questions.length - 3} more)`
                          }
                          icon={showAllQuestions ? "chevron-up" : "chevron-down"}
                          variant="secondary"
                          size="sm"
                          onPress={() => setShowAllQuestions((prev) => !prev)}
                        />
                      </View>
                    ) : null}
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  // Captured into locals because a `length` check does not narrow indexed
  // access under `noUncheckedIndexedAccess`. `filter(Boolean)` has already
  // removed empty segments, so the fallbacks below can never actually apply.
  const first = parts[0];
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
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
  const [showSpecs, setShowSpecs] = useState(false);
  const chevronProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(chevronProgress, {
      toValue: showSpecs ? 1 : 0,
      duration: showSpecs ? 280 : 220,
      easing: showSpecs ? Easing.bezier(0.16, 1, 0.3, 1) : Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [showSpecs, chevronProgress]);

  const chevronRotate = chevronProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  const unavailable =
    offer.status === "WITHDRAWN" || offer.status === "REJECTED" || offer.status === "EXPIRED";
  const selected = offer.status === "SELECTED";
  const hasSpecs = Boolean(
    offer.etaText?.trim() || offer.availabilityText?.trim() || offer.experienceText?.trim()
  );

  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  useEffect(() => {
    let active = true;
    const path = offer.taskerProfile.avatarPath ?? null;
    setImageError(false);
    if (!path) {
      setAvatarUri(null);
      return;
    }
    void createSignedUrl("avatars", path).then((url) => {
      if (active) setAvatarUri(url);
    });
    return () => {
      active = false;
    };
  }, [offer.taskerProfile.avatarPath]);

  return (
    <View
      style={[
        styles.offerCard,
        selected ? styles.offerCardSelected : undefined,
        unavailable ? styles.offerCardUnavailable : undefined,
      ]}
    >
      {selected ? (
        <View
          style={styles.selectedEdgeBadge}
          accessibilityRole="text"
          accessibilityLabel="Selected offer"
        >
          <Icon name="check" size={16} color={theme.onPrimary} />
        </View>
      ) : null}

      <Pressable
        onPress={() => router.push({ pathname: "/profile/[id]", params: { id: offer.taskerId } })}
        accessibilityRole="button"
        accessibilityLabel={`View ${offer.taskerDisplayName}'s profile`}
        style={({ pressed }) => [styles.offerHeader, pressed ? { opacity: 0.8 } : null]}
      >
        <View style={styles.offerAvatar}>
          {avatarUri && !imageError ? (
            <Image
              source={{ uri: avatarUri }}
              style={styles.offerAvatarImage}
              onError={() => setImageError(true)}
            />
          ) : (
            <Text style={styles.offerAvatarText}>{getInitials(offer.taskerDisplayName)}</Text>
          )}
        </View>

        <View style={styles.offerTaskerMeta}>
          <Text style={styles.offerTaskerName} numberOfLines={1}>
            {offer.taskerDisplayName}
          </Text>

          <View style={styles.trustLine}>
            {offer.taskerProfile.ratingCount > 0 ? (
              <View style={styles.trustItem}>
                <Icon name="star" size={11} color="#F59E0B" />
                <Text style={styles.trustText}>
                  <Text style={styles.trustBold}>
                    {offer.taskerProfile.ratingAverage?.toFixed(1)}
                  </Text>{" "}
                  ({offer.taskerProfile.ratingCount})
                </Text>
              </View>
            ) : (
              <Text style={styles.trustText}>New Tasker</Text>
            )}

            <Text style={styles.trustDot}>•</Text>

            <Text style={styles.trustText}>
              <Text style={styles.trustBold}>{offer.taskerProfile.completionCount}</Text> completed
            </Text>

            {offer.taskerProfile.verifiedIdentity ? (
              <>
                <Text style={styles.trustDot}>•</Text>
                <View style={styles.trustItem}>
                  <Icon name="check-circle" size={12} color={theme.successSolid} />
                  <Text style={styles.trustVerifiedText}>Verified</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Pressable>

      {offer.message ? (
        <View style={styles.offerMessageBubble}>
          <Text style={styles.offerMessage}>{offer.message}</Text>
        </View>
      ) : null}

      {hasSpecs ? (
        <View style={styles.specsAccordion}>
          <Pressable
            onPress={() => setShowSpecs((prev) => !prev)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showSpecs }}
            accessibilityLabel={
              showSpecs
                ? "Hide proposal details"
                : "View proposal details (ETA, schedule and experience)"
            }
            style={({ pressed }) => [
              styles.specsHeader,
              pressed ? styles.specsHeaderPressed : null,
            ]}
          >
            <View style={styles.specsHeaderLeft}>
              <Icon name="clock" size={15} color={theme.primary} />
              <Text style={styles.specsHeaderText}>Proposal details</Text>
            </View>
            <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
              <Icon
                name="chevron-down"
                size={14}
                color={theme.textSecondary}
              />
            </Animated.View>
          </Pressable>

          <Collapsible expanded={showSpecs} maxHeight={360}>
            <View style={styles.specsBody}>
              {offer.etaText?.trim() ? (
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>ESTIMATED COMPLETION</Text>
                  <Text style={styles.specValue}>{offer.etaText}</Text>
                </View>
              ) : null}

              {offer.availabilityText?.trim() ? (
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>AVAILABILITY</Text>
                  <Text style={styles.specValue}>{offer.availabilityText}</Text>
                </View>
              ) : null}

              {offer.experienceText?.trim() ? (
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>RELEVANT EXPERIENCE</Text>
                  <Text style={styles.specValue}>{offer.experienceText}</Text>
                </View>
              ) : null}
            </View>
          </Collapsible>
        </View>
      ) : null}

      <View style={styles.offerFooter}>
        <View style={styles.offerPriceRow}>
          <View style={styles.offerPriceLabelGroup}>
            <Text style={styles.offerFooterLabel}>Offer amount</Text>
            {offer.status === "WITHDRAWN" ? (
              <StatusBadge tone="neutral" label="Withdrawn" />
            ) : null}
            {offer.status === "REJECTED" ? (
              <StatusBadge tone="neutral" label="Not selected" />
            ) : null}
            {offer.status === "EXPIRED" ? (
              <StatusBadge tone="neutral" label="Expired" />
            ) : null}
          </View>
          <Text style={styles.offerFooterAmount}>{formatPhp(offer.amountCentavos)}</Text>
        </View>

        {canSelect && offer.status === "SUBMITTED" ? (
          <View style={styles.offerActionRow}>
            <View style={styles.offerActionSecondary}>
              <Button
                label="View profile"
                variant="secondary"
                size="sm"
                onPress={() =>
                  router.push({ pathname: "/profile/[id]", params: { id: offer.taskerId } })
                }
                fullWidth
              />
            </View>
            <View style={styles.offerActionPrimary}>
              <Button
                label="Select offer"
                icon="check-circle"
                size="sm"
                onPress={onSelect}
                loading={selecting}
                fullWidth
              />
            </View>
          </View>
        ) : !unavailable && !selected ? (
          <View style={styles.offerActionSingle}>
            <Button
              label="View profile"
              variant="secondary"
              size="sm"
              onPress={() =>
                router.push({ pathname: "/profile/[id]", params: { id: offer.taskerId } })
              }
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
  onDeleteAnswer,
}: {
  readonly question: TaskQuestionRecord;
  readonly separated: boolean;
  readonly onAnswer: (answer: string) => Promise<void>;
  readonly onDeleteAnswer: () => Promise<void>;
}) {
  const screenScroll = useScreenScroll();
  const cardRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replyError, setReplyError] = useState<string | undefined>(undefined);

  const replyAnim = useRef(new Animated.Value(0)).current;
  const hasAnswer = Boolean(question.answer);
  const answerAnim = useRef(new Animated.Value(hasAnswer ? 1 : 0)).current;

  useEffect(() => {
    if (hasAnswer) {
      Animated.timing(answerAnim, {
        toValue: 1,
        duration: 250,
        easing: MOTION_EASING.open,
        useNativeDriver: MOTION_NATIVE_DRIVER,
      }).start();
    }
  }, [hasAnswer, answerAnim]);

  useEffect(() => {
    if (replyOpen) {
      replyAnim.setValue(0);
      Animated.timing(replyAnim, {
        toValue: 1,
        duration: MOTION_DURATION.open,
        easing: MOTION_EASING.open,
        useNativeDriver: MOTION_NATIVE_DRIVER,
      }).start();
    }
  }, [replyOpen, replyAnim]);

  function handleOpenReply() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setReplyOpen(true);
    screenScroll?.scrollToRef(cardRef);
    setTimeout(() => {
      inputRef.current?.focus();
      screenScroll?.scrollToRef(cardRef);
    }, 180);
  }

  function handleCancelReply() {
    Keyboard.dismiss();
    Animated.timing(replyAnim, {
      toValue: 0,
      duration: MOTION_DURATION.close,
      easing: MOTION_EASING.close,
      useNativeDriver: MOTION_NATIVE_DRIVER,
    }).start(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setReplyOpen(false);
      setReplyText("");
      setReplyError(undefined);
    });
  }

  async function handleSubmit() {
    const trimmed = replyText.trim();
    if (!trimmed) {
      setReplyError("Reply cannot be empty.");
      return;
    }
    setReplyError(undefined);
    setSubmitting(true);
    Keyboard.dismiss();
    try {
      await onAnswer(trimmed);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setReplyText("");
      setReplyOpen(false);
    } catch {
      setReplyError("Failed to send reply. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDeleteAnswer() {
    const doDelete = async () => {
      setDeleting(true);
      try {
        Animated.timing(answerAnim, {
          toValue: 0,
          duration: 180,
          easing: MOTION_EASING.close,
          useNativeDriver: MOTION_NATIVE_DRIVER,
        }).start(async () => {
          await onDeleteAnswer();
          setDeleting(false);
        });
      } catch {
        setDeleting(false);
      }
    };

    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Are you sure you want to delete your response?")) {
        void doDelete();
      }
    } else {
      Alert.alert("Delete response", "Are you sure you want to delete your response?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void doDelete() },
      ]);
    }
  }

  return (
    <View
      ref={cardRef}
      style={[styles.questionCard, separated ? styles.questionCardSeparated : undefined]}
    >
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
        <Animated.View
          style={[
            styles.answerBlock,
            {
              opacity: answerAnim,
              transform: [
                {
                  translateY: answerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-4, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.answerHeaderRow}>
            <Text style={styles.answerLabel}>YOUR RESPONSE</Text>
            <Pressable
              style={({ pressed }) => [
                styles.answerDeleteBtn,
                pressed ? styles.answerDeleteBtnPressed : null,
              ]}
              onPress={handleDeleteAnswer}
              disabled={deleting}
              accessibilityRole="button"
              accessibilityLabel="Delete response"
              hitSlop={8}
            >
              {deleting ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Icon name="trash" size={13} color={theme.textSecondary} />
              )}
            </Pressable>
          </View>
          <Text style={styles.answerBody}>{question.answer}</Text>
        </Animated.View>
      ) : (
        <>
          {replyOpen ? (
            <Animated.View
              style={[
                styles.replyForm,
                {
                  opacity: replyAnim,
                  transform: [
                    {
                      translateY: replyAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-6, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <TextInput
                ref={inputRef}
                style={styles.replyInput}
                placeholder="Type your reply…"
                placeholderTextColor={theme.textSecondary}
                multiline
                value={replyText}
                onChangeText={(t) => {
                  setReplyText(t);
                  if (replyError) setReplyError(undefined);
                }}
                onFocus={() => {
                  screenScroll?.scrollToRef(cardRef);
                }}
                editable={!submitting}
                accessibilityLabel="Reply to question"
              />
              {replyError ? <Text style={styles.replyError}>{replyError}</Text> : null}
              <View style={styles.replyActions}>
                <Pressable
                  style={styles.replyCancelBtn}
                  onPress={handleCancelReply}
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
                  {submitting ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <>
                      <Icon
                        name="arrow-right"
                        size={13}
                        color={theme.onPrimary}
                      />
                      <Text style={styles.replySendText}>Send reply</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </Animated.View>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.replyOpenBtn,
                pressed ? styles.replyOpenBtnPressed : null,
              ]}
              onPress={handleOpenReply}
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
  taskSummaryCard: {
    minWidth: 0,
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: spacing.md + 2,
    gap: spacing.sm,
    marginBottom: spacing.lg,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
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
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  overviewSectionTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.md,
    fontWeight: "800",
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
  metaLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
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
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingTop: 4,
  },
  budgetLabel: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingBottom: 2,
  },
  budgetAmount: {
    color: theme.primary,
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    fontWeight: "800",
  },
  bookingButton: {
    marginTop: spacing.xs,
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    backgroundColor: theme.primarySoft,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    flexShrink: 0,
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
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  checkpointFactsTablet: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingTop: spacing.xs,
    paddingBottom: 0,
    gap: spacing.md,
  },
  checkpointFact: {
    minWidth: 0,
    gap: spacing.xs,
  },
  checkpointFactTablet: {
    flex: 1,
    paddingTop: 0,
    paddingRight: spacing.md,
    paddingBottom: 0,
  },
  checkpointFactSecondary: {},
  checkpointFactSecondaryTablet: {
    paddingRight: 0,
    paddingLeft: spacing.md,
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
  answerHeaderRow: {
    minWidth: 0,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  answerDeleteBtn: {
    padding: 4,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  answerDeleteBtnPressed: {
    opacity: 0.6,
    backgroundColor: theme.errorSoft,
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
    alignSelf: "flex-end",
    gap: 5,
    marginTop: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  replyOpenBtnPressed: {
    opacity: 0.65,
  },
  replyOpenText: {
    color: theme.primary,
    fontSize: fontSize.sm,
    fontWeight: "700",
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
    fontWeight: "600",
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
    minWidth: 105,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: theme.primary,
  },
  replySendBtnDisabled: {
    backgroundColor: theme.primarySoft,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
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
  expandAction: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.xs,
  },
  offerCard: {
    minWidth: 0,
    width: "100%",
    backgroundColor: theme.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    padding: spacing.md + 2,
    gap: spacing.md,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  offerCardSelected: {
    borderColor: theme.primary,
    borderWidth: 1.5,
  },
  offerCardUnavailable: {
    opacity: 0.6,
  },
  offerHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  offerAvatar: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: theme.primarySoft,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  },
  offerAvatarImage: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
  },
  offerAvatarText: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  offerTaskerMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  offerTaskerNameRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  offerTaskerName: {
    flexShrink: 1,
    color: theme.textPrimary,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2.5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radii.pill,
    backgroundColor: theme.successSoft,
  },
  verifiedText: {
    color: theme.successSolid,
    fontSize: 9.5,
    fontWeight: "700",
  },
  offerHeaderRight: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  trustLine: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  trustItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  trustDot: {
    color: theme.textSecondary,
    fontSize: 9,
    opacity: 0.5,
  },
  trustText: {
    color: theme.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
  trustBold: {
    color: theme.textPrimary,
    fontWeight: "600",
  },
  trustVerifiedText: {
    color: theme.successSolid,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  offerMessageBubble: {
    minWidth: 0,
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  offerMessage: {
    minWidth: 0,
    color: theme.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400",
  },
  specsAccordion: {
    minWidth: 0,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    backgroundColor: theme.surfaceSubtle,
    overflow: "hidden",
  },
  specsHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: theme.surfaceSubtle,
  },
  specsHeaderOpen: {},
  specsHeaderPressed: {
    backgroundColor: theme.primarySoft,
  },
  specsHeaderLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  specsHeaderText: {
    flex: 1,
    minWidth: 0,
    color: theme.textPrimary,
    fontSize: 13.5,
    fontWeight: "700",
  },
  specsBody: {
    padding: 12,
    gap: spacing.sm,
    backgroundColor: theme.surface,
  },
  specItem: {
    gap: 2,
  },
  specLabel: {
    color: theme.textSecondary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  specValue: {
    color: theme.textPrimary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  specDivider: {
    height: 0,
  },
  offerDivider: {
    height: 0,
  },
  offerFooter: {
    minWidth: 0,
    width: "100%",
    gap: spacing.sm + 2,
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
  offerPriceLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
    flex: 1,
    minWidth: 0,
  },
  selectedEdgeBadge: {
    position: "absolute",
    top: -9,
    right: -9,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  offerFooterLabel: {
    color: theme.textSecondary,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "500",
  },
  offerFooterAmount: {
    color: theme.primary,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
  },
  offerActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    width: "100%",
  },
  offerActionSecondary: {
    flex: 1,
    minWidth: 0,
  },
  offerActionPrimary: {
    flex: 1.35,
    minWidth: 0,
  },
  offerActionSingle: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
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

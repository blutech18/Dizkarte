import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import type { TaskId } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { Screen } from "../../../src/components/ui/Screen";
import { Button } from "../../../src/components/ui/Button";
import { StatusBadge, type BadgeTone } from "../../../src/components/ui/StatusBadge";
import {
  LoadingState,
  ErrorState,
  DeniedState,
  EmptyState,
} from "../../../src/components/ui/AsyncState";
import { useSession } from "../../../src/providers/SessionProvider";
import { useMarketplace } from "../../../src/providers/MarketplaceProvider";
import { categoryName } from "../../../src/services/marketplace/categories";
import type {
  OfferRecord,
  OwnedTaskRecord,
  TaskQuestionRecord,
} from "../../../src/services/marketplace/types";
import { theme, spacing, fontSize, radii } from "../../../src/theme";

type LoadState = "loading" | "loaded" | "denied" | "error";

const TASK_STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: "neutral",
  OPEN: "brand",
  BOOKING_PENDING: "warning",
  ASSIGNED: "info",
  IN_PROGRESS: "info",
  COMPLETION_REQUESTED: "warning",
  COMPLETED: "success",
  DISPUTED: "error",
};

/**
 * Owned task detail: questions, offers comparison with Tasker trust signals,
 * unavailable/withdrawn offer states, single conflict-safe offer selection,
 * and the explicit PAYMENT_PENDING confirmation state once selected.
 */
export default function OwnedTaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { repository, notifyChanged } = useMarketplace();
  const [task, setTask] = useState<OwnedTaskRecord | null>(null);
  const [questions, setQuestions] = useState<ReadonlyArray<TaskQuestionRecord>>([]);
  const [offers, setOffers] = useState<ReadonlyArray<OfferRecord>>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [selecting, setSelecting] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);

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
        const [q, o] = await Promise.all([
          repository.listQuestions(result.id),
          repository.listOffers(result.id, session.userId),
        ]);
        setTask(result);
        setQuestions(q);
        setOffers(o);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [id, repository, session]);

  useEffect(() => {
    load();
  }, [load]);

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

  if (!session) return <DeniedState description="Sign in to view this task." />;
  if (state === "loading") return <LoadingState label="Loading task" />;
  if (state === "error") return <ErrorState onRetry={load} />;
  if (state === "denied" || !task) {
    return <DeniedState title="Task not found" description="This task could not be loaded." />;
  }

  const canSelectOffer = task.status === "OPEN" && !task.activeBookingId;
  const paymentPending = task.status === "BOOKING_PENDING" && task.activeBookingId;

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: "Task detail" }} />

      <View style={styles.headerRow}>
        <Text style={styles.title}>{task.draft.title}</Text>
        <StatusBadge tone={TASK_STATUS_TONE[task.status] ?? "neutral"} label={task.status} />
      </View>
      <Text style={styles.meta}>
        {categoryName(task.draft.categoryId)} · {formatPhp(task.draft.budgetCentavos)}
      </Text>

      {paymentPending ? (
        <View style={styles.pendingBanner}>
          <StatusBadge tone="warning" label="Payment pending" />
          <Text style={styles.pendingText}>
            An offer has been selected. The booking is authoritative-payment-pending — funds are
            protected once the provider confirms payment, not before.
          </Text>
          <Button
            label="Go to booking"
            onPress={() =>
              router.push({ pathname: "/booking/[id]", params: { id: task.activeBookingId! } })
            }
            variant="secondary"
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Questions ({questions.length})</Text>
        {questions.length === 0 ? (
          <Text style={styles.emptyText}>No questions yet.</Text>
        ) : (
          questions.map((q) => (
            <View key={q.id} style={styles.questionRow}>
              <Text style={styles.questionAuthor}>{q.authorDisplayName}</Text>
              <Text style={styles.questionBody}>{q.body}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Offers ({offers.length})</Text>
        {offers.length === 0 ? (
          <EmptyState
            title="No offers yet"
            description="Approved Taskers who submit an offer will appear here for comparison."
          />
        ) : (
          offers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              canSelect={canSelectOffer}
              selecting={selecting === offer.id}
              onSelect={() => handleSelect(offer)}
            />
          ))
        )}
        {selectError ? (
          <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {selectError}
          </Text>
        ) : null}
      </View>

      <Button
        label="Report a problem with this task"
        onPress={() =>
          router.push({ pathname: "/support", params: { subjectType: "task", subjectId: task.id } })
        }
        variant="secondary"
        fullWidth
      />
    </Screen>
  );
}

function OfferCard({
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
    <View style={[styles.offerCard, unavailable ? styles.offerCardUnavailable : null]}>
      <View style={styles.offerHeaderRow}>
        <Text style={styles.offerTaskerName}>{offer.taskerDisplayName}</Text>
        {selected ? <StatusBadge tone="success" label="Selected" /> : null}
        {offer.status === "WITHDRAWN" ? <StatusBadge tone="neutral" label="Withdrawn" /> : null}
        {offer.status === "REJECTED" ? <StatusBadge tone="neutral" label="Not selected" /> : null}
        {offer.status === "EXPIRED" ? <StatusBadge tone="neutral" label="Expired" /> : null}
      </View>

      <View style={styles.trustRow}>
        {offer.taskerProfile.verifiedIdentity ? (
          <StatusBadge tone="success" label="Identity verified" />
        ) : (
          <StatusBadge tone="warning" label="Not yet verified" />
        )}
        {offer.taskerProfile.ratingCount > 0 ? (
          <StatusBadge
            tone="brand"
            icon="star"
            label={`${offer.taskerProfile.ratingAverage?.toFixed(1)} (${offer.taskerProfile.ratingCount})`}
          />
        ) : (
          <StatusBadge tone="neutral" label="No reviews yet" />
        )}
        <StatusBadge tone="info" label={`${offer.taskerProfile.completionCount} completed`} />
      </View>

      <Text style={styles.offerAmount}>{formatPhp(offer.amountCentavos)}</Text>
      <Text style={styles.offerMessage}>{offer.message}</Text>
      <Text style={styles.offerMeta}>ETA: {offer.etaText}</Text>
      <Text style={styles.offerMeta}>Availability: {offer.availabilityText}</Text>
      <Text style={styles.offerMeta}>Experience: {offer.experienceText}</Text>

      {canSelect && offer.status === "SUBMITTED" ? (
        <Button label="Select this offer" onPress={onSelect} loading={selecting} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: theme.textPrimary, flexShrink: 1 },
  meta: { fontSize: fontSize.sm, color: theme.textSecondary, marginBottom: spacing.lg },
  pendingBanner: {
    backgroundColor: theme.warningSoft,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  pendingText: { color: theme.warningOnSoft, fontSize: fontSize.sm },
  section: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: { fontSize: fontSize.md, fontWeight: "700", color: theme.textPrimary },
  emptyText: { fontSize: fontSize.sm, color: theme.textSecondary },
  questionRow: {
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.sm,
    padding: spacing.md,
  },
  questionAuthor: { fontSize: fontSize.xs, fontWeight: "700", color: theme.textPrimary },
  questionBody: { fontSize: fontSize.sm, color: theme.textPrimary },
  offerCard: {
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  offerCardUnavailable: { opacity: 0.6 },
  offerHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  offerTaskerName: { fontSize: fontSize.md, fontWeight: "700", color: theme.textPrimary },
  trustRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
  offerAmount: { fontSize: fontSize.lg, fontWeight: "700", color: theme.primary },
  offerMessage: { fontSize: fontSize.sm, color: theme.textPrimary },
  offerMeta: { fontSize: fontSize.xs, color: theme.textSecondary },
  errorText: {
    color: theme.errorOnSoft,
    backgroundColor: theme.errorSoft,
    padding: spacing.md,
    borderRadius: radii.sm,
    fontWeight: "600",
  },
});

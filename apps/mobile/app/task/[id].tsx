import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { PublicTaskFeedItem, TaskId } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { Screen } from "../../src/components/ui/Screen";
import { LoadingState, EmptyState, ErrorState } from "../../src/components/ui/AsyncState";
import { StatusBadge } from "../../src/components/ui/StatusBadge";
import { useMarketplace } from "../../src/providers/MarketplaceProvider";
import { useSession } from "../../src/providers/SessionProvider";
import { isEligibleTasker } from "../../src/services/session-types";
import { theme, spacing, fontSize, radii } from "../../src/theme";
import { QuestionAndOfferPanel } from "../../src/components/task/QuestionAndOfferPanel";

type LoadState = "loading" | "loaded" | "empty" | "error";

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { repository } = useMarketplace();
  const [task, setTask] = useState<PublicTaskFeedItem | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    repository
      .getPublicTask(id as TaskId)
      .then(async (result) => {
        if (cancelled) return;
        if (!result) {
          setState("empty");
          return;
        }
        // Owners are redirected to the owned detail view (questions/offers/
        // selection), which is a distinct private-facing screen from the
        // public discovery detail rendered here.
        if (session) {
          const owned = await repository.getOwnedTask(id as TaskId, session.userId);
          if (!cancelled && owned) {
            router.replace({ pathname: "/task/[id]/owned", params: { id: owned.id } });
            return;
          }
        }
        if (cancelled) return;
        setTask(result);
        setState("loaded");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [id, repository, session]);

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

  return (
    <Screen>
      <Text style={styles.title}>{task.title}</Text>
      <View style={styles.badgeRow}>
        <StatusBadge tone="brand" label="Open" />
        {task.sameDay ? <StatusBadge tone="warning" label="Same-day" /> : null}
      </View>
      <Text style={styles.budget}>{formatPhp(task.budgetCentavos)}</Text>
      <Text style={styles.description}>{task.description}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location</Text>
        <Text style={styles.body}>{task.landmark}</Text>
        <Text style={styles.caption}>
          Only an approximate area is shown before a booking is confirmed. The exact address is
          shared with the selected Tasker only after payment is confirmed.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Offers</Text>
        <Text style={styles.body}>
          {task.offerCount} offer{task.offerCount === 1 ? "" : "s"} submitted so far.
        </Text>
      </View>

      <QuestionAndOfferPanel taskId={task.id} eligibleToOffer={eligibleToOffer} session={session} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.xxl,
    fontWeight: "700",
    color: theme.textPrimary,
    marginBottom: spacing.sm,
  },
  badgeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  budget: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: theme.textPrimary,
    marginBottom: spacing.md,
  },
  description: {
    fontSize: fontSize.md,
    color: theme.textSecondary,
    marginBottom: spacing.lg,
  },
  section: {
    backgroundColor: theme.surfaceSubtle,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: theme.textPrimary,
    marginBottom: spacing.xs,
  },
  body: {
    fontSize: fontSize.md,
    color: theme.textPrimary,
  },
  caption: {
    fontSize: fontSize.xs,
    color: theme.textSecondary,
    marginTop: spacing.xs,
  },
});

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Link, router } from "expo-router";
import type { TaskStatus } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { AppHeader } from "../ui/AppHeader";
import { Button } from "../ui/Button";
import { StatusBadge, type BadgeTone } from "../ui/StatusBadge";
import { Icon } from "../ui/Icon";
import { LoadingState, ErrorState, EmptyState } from "../ui/AsyncState";
import { useSession } from "../../providers/SessionProvider";
import { useMarketplace } from "../../providers/MarketplaceProvider";
import { categoryName } from "../../services/marketplace/categories";
import type { OwnedTaskRecord } from "../../services/marketplace/types";
import { theme, spacing, fontSize, radii, MIN_TOUCH_TARGET } from "../../theme";

type FilterKey = "all" | "draft" | "published" | "assigned" | "completed" | "closed";

const FILTERS: ReadonlyArray<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "published", label: "Published" },
  { key: "assigned", label: "Assigned" },
  { key: "completed", label: "Completed" },
  { key: "closed", label: "Closed" },
];

const STATUS_TONE: Record<TaskStatus, BadgeTone> = {
  DRAFT: "neutral",
  OPEN: "brand",
  BOOKING_PENDING: "warning",
  ASSIGNED: "info",
  IN_PROGRESS: "info",
  COMPLETION_REQUESTED: "warning",
  COMPLETED: "success",
  EXPIRED: "neutral",
  CANCELLED: "neutral",
  DISPUTED: "error",
  REMOVED: "neutral",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Published — open for offers",
  BOOKING_PENDING: "Payment pending",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  COMPLETION_REQUESTED: "Completion requested",
  COMPLETED: "Completed",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
  DISPUTED: "Disputed",
  REMOVED: "Removed",
};

/**
 * The client's next action for a task. `actionable` drives the emphasized
 * (accented + arrow) treatment so "My Tasks" reads as a management queue —
 * what needs my attention — rather than a generic card list.
 */
function nextAction(task: OwnedTaskRecord): { readonly label: string; readonly actionable: boolean } {
  switch (task.status) {
    case "DRAFT":
      return { label: "Finish & publish", actionable: true };
    case "OPEN":
      return task.offerCount > 0
        ? {
            label: `Review ${task.offerCount} offer${task.offerCount === 1 ? "" : "s"}`,
            actionable: true,
          }
        : { label: "Waiting for offers", actionable: false };
    case "BOOKING_PENDING":
      return { label: "Complete payment", actionable: true };
    case "ASSIGNED":
    case "IN_PROGRESS":
      return { label: "Work in progress", actionable: false };
    case "COMPLETION_REQUESTED":
      return { label: "Confirm & release funds", actionable: true };
    case "COMPLETED":
      return { label: "Completed", actionable: false };
    default:
      return { label: STATUS_LABEL[task.status], actionable: false };
  }
}

function matchesFilter(status: TaskStatus, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true;
    case "draft":
      return status === "DRAFT";
    case "published":
      return status === "OPEN";
    case "assigned":
      return (
        status === "BOOKING_PENDING" ||
        status === "ASSIGNED" ||
        status === "IN_PROGRESS" ||
        status === "COMPLETION_REQUESTED"
      );
    case "completed":
      return status === "COMPLETED";
    case "closed":
      return (
        status === "EXPIRED" ||
        status === "CANCELLED" ||
        status === "REMOVED" ||
        status === "DISPUTED"
      );
    default:
      return true;
  }
}

type LoadState = "loading" | "loaded" | "error";

/** Client "My Tasks": populated list with status filters. */
export function ClientMyTasks() {
  const { session } = useSession();
  const { repository, revision } = useMarketplace();
  const [tasks, setTasks] = useState<ReadonlyArray<OwnedTaskRecord>>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [filter, setFilter] = useState<FilterKey>("all");

  const load = useCallback(() => {
    if (!session) return;
    setState("loading");
    repository
      .listMyTasks(session.userId)
      .then((result) => {
        setTasks(result);
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [repository, session]);

  useEffect(() => {
    load();
  }, [load, revision]);

  const filtered = useMemo(
    () => tasks.filter((task) => matchesFilter(task.status, filter)),
    [tasks, filter],
  );

  if (!session) return null;
  if (state === "loading") return <LoadingState label="Loading your tasks" />;
  if (state === "error") return <ErrorState onRetry={load} />;

  return (
    <View style={styles.container}>
      <AppHeader
        title="My Tasks"
        action={
          <Link href="/task/create" asChild>
            <Button label="Post a task" onPress={() => {}} />
          </Link>
        }
      />

      <View style={styles.filterRow} accessibilityRole="tablist">
        {FILTERS.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setFilter(item.key)}
            accessibilityRole="tab"
            accessibilityLabel={`${item.label} tasks`}
            accessibilityState={{ selected: filter === item.key }}
            style={[styles.filterChip, filter === item.key ? styles.filterChipActive : null]}
          >
            <Text style={filter === item.key ? styles.filterTextActive : styles.filterText}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {filtered.length === 0 ? (
        tasks.length === 0 ? (
          <EmptyState
            title="You have not posted any tasks yet"
            description="Post a task to get offers from approved Taskers near you."
            actionLabel="Post a task"
            onAction={() => router.push("/task/create")}
          />
        ) : (
          <EmptyState
            title="No tasks in this filter"
            description="Try a different status filter."
          />
        )
      ) : (
        <View style={styles.list}>
          {filtered.map((task) => {
            const action = nextAction(task);
            return (
              <Pressable
                key={task.id}
                onPress={() =>
                  task.status === "DRAFT"
                    ? router.push({ pathname: "/task/[id]/preview", params: { id: task.id } })
                    : router.push({ pathname: "/task/[id]/owned", params: { id: task.id } })
                }
                accessibilityRole="button"
                accessibilityLabel={`${task.draft.title || "Untitled task"}, ${STATUS_LABEL[task.status]}, ${action.label}`}
                style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{task.draft.title || "Untitled task"}</Text>
                  <StatusBadge tone={STATUS_TONE[task.status]} label={STATUS_LABEL[task.status]} />
                </View>
                <Text style={styles.cardMeta}>
                  {categoryName(task.draft.categoryId)} · {formatPhp(task.draft.budgetCentavos || 0)}
                  {task.questionCount > 0
                    ? ` · ${task.questionCount} question${task.questionCount === 1 ? "" : "s"}`
                    : ""}
                </Text>
                <View
                  style={[styles.actionRow, action.actionable ? styles.actionRowActive : null]}
                >
                  <Text
                    style={action.actionable ? styles.actionTextActive : styles.actionTextMuted}
                  >
                    {action.label}
                  </Text>
                  {action.actionable ? (
                    <Icon name="arrow-right" size={16} color={theme.primaryPressed} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.lg },
  filterChip: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    justifyContent: "center",
    backgroundColor: theme.surface,
  },
  filterChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  filterText: { color: theme.textSecondary, fontSize: fontSize.sm, fontWeight: "600" },
  filterTextActive: { color: theme.onPrimary, fontSize: fontSize.sm, fontWeight: "600" },
  list: { gap: spacing.sm },
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardPressed: { backgroundColor: theme.surfaceSubtle },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  cardTitle: { fontSize: fontSize.md, fontWeight: "700", color: theme.textPrimary, flexShrink: 1 },
  cardMeta: { fontSize: fontSize.xs, color: theme.textSecondary },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
  },
  actionRowActive: {},
  actionTextActive: { fontSize: fontSize.sm, fontWeight: "700", color: theme.primaryPressed },
  actionTextMuted: { fontSize: fontSize.sm, color: theme.textSecondary },
});

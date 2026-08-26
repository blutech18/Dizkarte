import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type ScrollView } from "react-native";
import { Link, router } from "expo-router";
import type { TaskStatus } from "@dizkarte/domain";
import { formatPhp } from "@dizkarte/domain";
import { AppHeader } from "../ui/AppHeader";
import { Button } from "../ui/Button";
import { AnimatedFilterPressable } from "../ui/AnimatedFilterPressable";
import { Screen } from "../ui/Screen";
import { Icon } from "../ui/Icon";
import { LoadingState, ErrorState, EmptyState } from "../ui/AsyncState";
import { useSession } from "../../providers/SessionProvider";
import { useMarketplace } from "../../providers/MarketplaceProvider";
import { useCategories } from "../../providers/CategoriesProvider";
import type { OwnedTaskRecord } from "../../services/marketplace/types";
import {
  theme,
  spacing,
  fontSize,
  lineHeight,
  radii,
  MIN_TOUCH_TARGET,
  noWebOutline,
  useResponsiveLayout,
} from "../../theme";
import {
  MY_TASK_STATUS_FILTERS,
  TaskStatusFilterPanel,
  type MyTaskStatusFilter,
} from "./TaskStatusFilterPanel";

const FILTERS = MY_TASK_STATUS_FILTERS;

const STATUS_ACCENT_COLOR: Record<TaskStatus, string> = {
  DRAFT: theme.textSecondary,
  OPEN: theme.primary,
  BOOKING_PENDING: theme.warningOnSoft,
  ASSIGNED: theme.infoOnSoft,
  IN_PROGRESS: theme.infoOnSoft,
  COMPLETION_REQUESTED: theme.warningOnSoft,
  COMPLETED: theme.successOnSoft,
  EXPIRED: theme.textSecondary,
  CANCELLED: theme.textSecondary,
  DISPUTED: theme.errorOnSoft,
  REMOVED: theme.textSecondary,
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Open for offers",
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
function nextAction(task: OwnedTaskRecord): {
  readonly label: string;
  readonly actionable: boolean;
} {
  switch (task.status) {
    case "DRAFT":
      return { label: "Finish & publish draft", actionable: true };
    case "OPEN":
      return task.offerCount > 0
        ? {
            label: `Review ${task.offerCount} offer${task.offerCount === 1 ? "" : "s"}`,
            actionable: true,
          }
        : { label: "Waiting for offers", actionable: false };
    case "BOOKING_PENDING":
      return { label: "Complete payment to assign Tasker", actionable: true };
    case "ASSIGNED":
    case "IN_PROGRESS":
      return { label: "View active booking & chat", actionable: true };
    case "COMPLETION_REQUESTED":
      return { label: "Confirm completion to release funds", actionable: true };
    case "COMPLETED":
      return { label: "Task completed — view details", actionable: false };
    case "EXPIRED":
      return { label: "Expired with no selection", actionable: false };
    case "CANCELLED":
      return { label: "Cancelled", actionable: false };
    case "DISPUTED":
      return { label: "Under support review", actionable: false };
    case "REMOVED":
      return { label: "Removed for policy", actionable: false };
  }
}

function taskScheduleLabel(task: OwnedTaskRecord): string {
  if (task.draft.sameDay) return "Needed today";
  if (!task.draft.scheduledFor) return "Flexible schedule";
  const scheduled = new Date(task.draft.scheduledFor);
  if (Number.isNaN(scheduled.getTime())) return "Flexible schedule";
  return scheduled.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function taskUpdatedLabel(task: OwnedTaskRecord): string {
  const updated = new Date(task.updatedAt);
  if (Number.isNaN(updated.getTime())) return "Recently updated";
  return `Updated ${updated.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

export function ClientMyTasks() {
  const { session } = useSession();
  const { repository, revision } = useMarketplace();
  const { nameFor } = useCategories();
  const { isTablet } = useResponsiveLayout();
  const [tasks, setTasks] = useState<ReadonlyArray<OwnedTaskRecord>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MyTaskStatusFilter>("all");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const activeStatusFilterCount = filter === "all" ? 0 : 1;

  const categoryLabel = (categoryId: string | null) =>
    categoryId ? (nameFor(categoryId) ?? "Task") : "General";

  const handleApplyStatusFilter = (nextFilter: MyTaskStatusFilter) => {
    setFilter(nextFilter);
    setFilterPanelOpen(false);
  };

  const loadTasks = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const result = await repository.listMyTasks(session.userId);
      setTasks(result);
    } catch {
      setError("Could not load your tasks. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [session, repository]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks, revision]);

  // A filter switch or a reload can shrink the list (e.g. from many tasks
  // down to one). The screen's ScrollView otherwise keeps whatever offset the
  // user had scrolled to, which — clamped to the new, shorter content — shows
  // blank space where the removed rows used to be, with the remaining card(s)
  // stuck near the bottom instead of appearing right after the filter row.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [filter, searchQuery, tasks]);

  const counts = useMemo(() => {
    const map: Record<MyTaskStatusFilter, number> = {
      all: tasks.length,
      draft: 0,
      published: 0,
      assigned: 0,
      completed: 0,
      closed: 0,
    };
    for (const t of tasks) {
      if (t.status === "DRAFT") map.draft++;
      else if (t.status === "OPEN" || t.status === "BOOKING_PENDING") map.published++;
      else if (
        t.status === "ASSIGNED" ||
        t.status === "IN_PROGRESS" ||
        t.status === "COMPLETION_REQUESTED"
      )
        map.assigned++;
      else if (t.status === "COMPLETED") map.completed++;
      else if (
        t.status === "EXPIRED" ||
        t.status === "CANCELLED" ||
        t.status === "DISPUTED" ||
        t.status === "REMOVED"
      )
        map.closed++;
    }
    return map;
  }, [tasks]);

  const attentionCount = useMemo(
    () => tasks.filter((task) => nextAction(task).actionable).length,
    [tasks],
  );
  /**
   * Offers still awaiting the Client's decision.
   *
   * `offerCount` already excludes selected/rejected offers, and only an OPEN task
   * can still have one chosen — a task that moved on has nothing left to review.
   * The tile is labelled "To review" for that reason: labelling it "Offers" made
   * a correct 0 look like a bug on an account whose offers were all already
   * accepted, while its cards showed the booking those offers produced.
   */
  const offerCount = useMemo(
    () => tasks.reduce((sum, task) => sum + (task.status === "OPEN" ? task.offerCount : 0), 0),
    [tasks],
  );

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === "draft" && t.status !== "DRAFT") return false;
      if (filter === "published" && !(t.status === "OPEN" || t.status === "BOOKING_PENDING"))
        return false;
      if (
        filter === "assigned" &&
        !(
          t.status === "ASSIGNED" ||
          t.status === "IN_PROGRESS" ||
          t.status === "COMPLETION_REQUESTED"
        )
      )
        return false;
      if (filter === "completed" && t.status !== "COMPLETED") return false;
      if (
        filter === "closed" &&
        !(
          t.status === "EXPIRED" ||
          t.status === "CANCELLED" ||
          t.status === "DISPUTED" ||
          t.status === "REMOVED"
        )
      )
        return false;

      if (searchQuery.trim().length > 0) {
        const query = searchQuery.trim().toLowerCase();
        const title = (t.draft.title || "").toLowerCase();
        const desc = (t.draft.description || "").toLowerCase();
        return title.includes(query) || desc.includes(query);
      }

      return true;
    });
  }, [tasks, filter, searchQuery]);

  if (!session) return null;

  return (
    <Screen scrollViewRef={scrollRef}>
      <View style={styles.container}>
        <AppHeader
          title="My Tasks"
          subtitle="Manage your posted tasks, drafts, and active bookings"
        />

        {!loading && !error && tasks.length > 0 ? (
          <View style={styles.overviewGrid} accessibilityLabel="Task overview">
            <View
              accessible
              accessibilityLabel={`${tasks.length} total task${tasks.length === 1 ? "" : "s"}`}
              style={[styles.overviewCard, isTablet ? styles.overviewCardTablet : null]}
            >
              <Text
                style={styles.overviewValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {tasks.length}
              </Text>
              <Text
                style={[styles.overviewLabel, isTablet ? styles.overviewLabelTablet : null]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Total
              </Text>
            </View>
            <View
              accessible
              accessibilityLabel={`${attentionCount} task${attentionCount === 1 ? "" : "s"} need attention`}
              style={[styles.overviewCard, isTablet ? styles.overviewCardTablet : null]}
            >
              <Text
                style={styles.overviewValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {attentionCount}
              </Text>
              <Text
                style={[styles.overviewLabel, isTablet ? styles.overviewLabelTablet : null]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                Need attention
              </Text>
            </View>
            <View
              accessible
              accessibilityLabel={`Offers to review: ${offerCount}`}
              style={[styles.overviewCard, isTablet ? styles.overviewCardTablet : null]}
            >
              <Text
                style={styles.overviewValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {offerCount}
              </Text>
              <Text
                style={[styles.overviewLabel, isTablet ? styles.overviewLabelTablet : null]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                To review
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.controlsCard}>
          <View style={styles.searchFilterRow}>
            <View
              style={[
                styles.searchBarContainer,
                searchFocused ? styles.searchBarContainerFocused : null,
              ]}
            >
              <View style={styles.searchIcon}>
                <Icon
                  name="search"
                  size={16}
                  color={searchFocused ? theme.primary : theme.textSecondary}
                />
              </View>
              <TextInput
                style={[styles.searchInput, noWebOutline]}
                placeholder="Search your tasks..."
                placeholderTextColor={theme.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                autoCorrect={false}
                spellCheck={false}
                accessibilityLabel="Search my tasks"
              />
              {searchQuery.length > 0 ? (
                <Pressable
                  onPress={() => setSearchQuery("")}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search text"
                  style={({ pressed }) => [
                    styles.clearSearchButton,
                    pressed ? styles.iconButtonPressed : null,
                  ]}
                >
                  <Icon name="close" size={14} color={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            <AnimatedFilterPressable
              selected={activeStatusFilterCount > 0}
              onPress={() => setFilterPanelOpen(true)}
              accessibilityLabel={`Open status filters${activeStatusFilterCount > 0 ? ", 1 active" : ""}`}
              accessibilityState={{ expanded: filterPanelOpen }}
              selectionAccessibilityState="none"
              style={styles.filterButton}
              inactiveBackgroundColor={theme.surface}
              selectedBackgroundColor={theme.primarySoft}
              inactiveBorderColor={theme.borderControl}
              selectedBorderColor={theme.primary}
              pressScale={0.94}
            >
              <Icon
                name="filter"
                size={19}
                color={activeStatusFilterCount > 0 ? theme.primary : theme.textSecondary}
              />
              {activeStatusFilterCount > 0 ? (
                <View style={styles.filterCountBadge}>
                  <Text style={styles.filterCountText}>{activeStatusFilterCount}</Text>
                </View>
              ) : null}
            </AnimatedFilterPressable>
          </View>

          <View style={styles.postTaskAction}>
            <Link href="/task/create" asChild>
              <Button
                label="Post a task"
                icon="plus"
                accessibilityHint="Opens the new task form"
                fullWidth
                onPress={() => {}}
              />
            </Link>
          </View>

          {filter !== "all" || searchQuery.trim() ? (
            <View style={styles.activeFiltersBlock}>
              <Text style={styles.activeFiltersText} numberOfLines={2}>
                {filter === "all"
                  ? "All statuses"
                  : (FILTERS.find((item) => item.key === filter)?.label ?? "Selected")}
                {searchQuery.trim() ? ` · “${searchQuery.trim()}”` : ""}
              </Text>
              <Pressable
                onPress={() => {
                  setFilter("all");
                  setSearchQuery("");
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear task search and filters"
                style={({ pressed }) => [
                  styles.clearFiltersButton,
                  pressed ? styles.clearFiltersButtonPressed : null,
                ]}
              >
                <Text style={styles.clearFiltersText}>Clear</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {!loading && !error && tasks.length > 0 ? (
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>
              {filter === "all"
                ? searchQuery.trim()
                  ? "Search results"
                  : "Your tasks"
                : `${FILTERS.find((item) => item.key === filter)?.label ?? "Selected"} tasks`}
            </Text>
            <View
              style={styles.resultsCountBadge}
              accessibilityLabel={`${filtered.length} task${filtered.length === 1 ? "" : "s"} shown`}
            >
              <Text style={styles.resultsCountText}>{filtered.length}</Text>
            </View>
          </View>
        ) : null}

        {loading ? (
          <LoadingState label="Loading your tasks" />
        ) : error ? (
          <ErrorState description={error} onRetry={loadTasks} />
        ) : filtered.length === 0 ? (
          tasks.length === 0 ? (
            <EmptyState
              title="No tasks posted yet"
              description="Post your first task to start receiving offers from local taskers."
              actionLabel="Post a task"
              onAction={() => router.push("/task/create")}
            />
          ) : (
            <EmptyState
              title="No matching tasks"
              description="Try another search or return to all task stages."
              actionLabel="Clear filters"
              onAction={() => {
                setFilter("all");
                setSearchQuery("");
              }}
            />
          )
        ) : (
          <View style={styles.list}>
            {filtered.map((task) => {
              const action = nextAction(task);
              const category = categoryLabel(task.draft.categoryId);
              const statusAccent = STATUS_ACCENT_COLOR[task.status];
              return (
                <Pressable
                  key={task.id}
                  onPress={() =>
                    task.status === "DRAFT"
                      ? router.push({ pathname: "/task/[id]/preview", params: { id: task.id } })
                      : router.push({ pathname: "/task/[id]/owned", params: { id: task.id } })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${task.draft.title || "Untitled task"}, ${category} category, status ${STATUS_LABEL[task.status]}, ${action.label}`}
                  style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
                >
                  <View style={styles.cardCopy}>
                    <Text style={styles.cardTitle}>{task.draft.title || "Untitled task"}</Text>
                    <Text style={styles.cardDescription}>
                      {task.draft.description || "No description added."}
                    </Text>
                  </View>
                  <View style={styles.cardDetails}>
                    <View style={styles.cardDetailRow}>
                      <Icon name="briefcase" size={15} color={theme.textSecondary} />
                      <Text style={styles.cardDetailText}>{category}</Text>
                    </View>
                    <View style={styles.cardDetailRow}>
                      <Icon name="calendar" size={15} color={theme.textSecondary} />
                      <Text style={styles.cardDetailText}>{taskScheduleLabel(task)}</Text>
                    </View>
                    {task.draft.landmark.trim() ? (
                      <View style={styles.cardDetailRow}>
                        <Icon name="map-pin" size={15} color={theme.textSecondary} />
                        <Text style={styles.cardDetailText} numberOfLines={1}>
                          {task.draft.landmark}
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.cardDetailRow}>
                      <Icon name="edit" size={15} color={theme.textSecondary} />
                      <Text style={styles.cardDetailText}>{taskUpdatedLabel(task)}</Text>
                    </View>
                  </View>
                  <View style={styles.cardActivityMetrics}>
                    <View
                      style={[
                        styles.activityBadge,
                        task.questionCount > 0 ? styles.activityBadgeActive : null,
                      ]}
                    >
                      <Icon
                        name="chat"
                        size={13}
                        color={task.questionCount > 0 ? theme.primary : theme.textSecondary}
                      />
                      <Text
                        style={[
                          styles.activityBadgeText,
                          task.questionCount > 0 ? styles.activityBadgeTextActive : null,
                        ]}
                        numberOfLines={1}
                      >
                        {task.questionCount} {task.questionCount === 1 ? "question" : "questions"}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.activityBadge,
                        task.offerCount > 0 ? styles.activityBadgeActive : null,
                      ]}
                    >
                      <Icon
                        name="briefcase"
                        size={13}
                        color={task.offerCount > 0 ? theme.primary : theme.textSecondary}
                      />
                      <Text
                        style={[
                          styles.activityBadgeText,
                          task.offerCount > 0 ? styles.activityBadgeTextActive : null,
                        ]}
                        numberOfLines={1}
                      >
                        {task.offerCount} {task.offerCount === 1 ? "offer" : "offers"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardDivider} />

                  <View style={styles.cardBottomBlock}>
                    <View style={styles.statusAndBudgetRow}>
                      <View style={styles.statusCol}>
                        <Text style={styles.microLabel}>STATUS</Text>
                        <Text
                          style={[styles.statusBadgeText, { color: statusAccent }]}
                          numberOfLines={1}
                        >
                          {STATUS_LABEL[task.status]}
                        </Text>
                      </View>

                      <View style={styles.budgetCol}>
                        <Text style={styles.microLabel}>BUDGET</Text>
                        <Text
                          style={styles.cardBudgetText}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                        >
                          {task.draft.budgetCentavos > 0
                            ? formatPhp(task.draft.budgetCentavos)
                            : "Not set"}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.cardActionBanner,
                        action.actionable ? styles.cardActionBannerActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.cardActionBannerText,
                          action.actionable ? styles.cardActionBannerTextActive : null,
                        ]}
                        numberOfLines={1}
                      >
                        {action.label}
                      </Text>
                      <Icon
                        name="chevron-right"
                        size={15}
                        color={action.actionable ? theme.primary : theme.textSecondary}
                      />
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <TaskStatusFilterPanel
        visible={filterPanelOpen}
        filter={filter}
        counts={counts}
        onApply={handleApplyStatusFilter}
        onClose={() => setFilterPanelOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.lg,
  },
  controlsCard: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  resultsTitle: {
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
  },
  resultsCountBadge: {
    minWidth: 34,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: theme.primarySoft,
  },
  resultsCountText: {
    color: theme.primary,
    fontSize: fontSize.sm,
    fontWeight: "800",
  },
  clearFiltersButton: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: theme.primarySoft,
  },
  clearFiltersButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
  clearFiltersText: { color: theme.primary, fontSize: fontSize.xs, fontWeight: "800" },
  searchFilterRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  searchBarContainer: {
    flex: 1,
    minWidth: 0,
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderControl,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
  },
  searchBarContainerFocused: {
    borderColor: theme.primary,
    backgroundColor: theme.surface,
  },
  postTaskAction: {
    width: "100%",
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: MIN_TOUCH_TARGET,
    paddingVertical: 0,
    fontSize: fontSize.sm,
    color: theme.textPrimary,
  },
  clearSearchButton: {
    width: 30,
    height: 30,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  filterButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radii.md,
    position: "relative",
  },
  filterCountBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: theme.surface,
    borderRadius: 9,
    backgroundColor: theme.primary,
  },
  filterCountText: {
    color: theme.onPrimary,
    fontSize: 10,
    fontWeight: "800",
  },
  iconButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.92 }],
  },
  overviewGrid: {
    minWidth: 0,
    flexDirection: "row",
    gap: spacing.sm,
  },
  overviewCard: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.md,
    backgroundColor: theme.surface,
  },
  overviewCardTablet: {
    paddingHorizontal: spacing.md,
  },
  overviewValue: {
    minWidth: 0,
    color: theme.primary,
    fontSize: fontSize.xl,
    fontWeight: "800",
  },
  overviewLabel: {
    minWidth: 0,
    color: theme.textSecondary,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
  },
  overviewLabelTablet: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  activeFiltersBlock: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
  },
  activeFiltersText: {
    flex: 1,
    minWidth: 0,
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: "600",
  },
  cardCopy: {
    gap: spacing.xs,
  },
  cardDescription: {
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  cardDetails: {
    gap: spacing.sm,
  },
  cardDetailRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },

  cardStatusDot: {
    width: 8,
    height: 8,
    flexShrink: 0,
    borderRadius: 4,
  },
  cardDetailText: {
    minWidth: 0,
    flex: 1,
    color: theme.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "500",
  },

  cardActivityMetrics: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  activityBadge: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    backgroundColor: theme.surfaceSubtle,
  },
  activityBadgeActive: {
    backgroundColor: theme.primarySoft,
  },
  activityBadgeText: {
    color: theme.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: "700",
  },
  activityBadgeTextActive: {
    color: theme.primary,
  },
  cardDivider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
  },
  cardBottomBlock: {
    gap: spacing.sm + 2,
  },
  statusAndBudgetRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  statusCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  budgetCol: {
    flexShrink: 0,
    alignItems: "flex-end",
    gap: 2,
  },
  microLabel: {
    color: theme.textSecondary,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  statusBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusBadgeText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    fontWeight: "800",
  },
  cardBudgetText: {
    color: theme.primary,
    fontSize: fontSize.md,
    lineHeight: 20,
    fontWeight: "800",
  },
  cardActionBanner: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: theme.surfaceSubtle,
  },
  cardActionBannerActive: {
    backgroundColor: theme.primarySoft,
  },
  cardActionBannerText: {
    flex: 1,
    minWidth: 0,
    color: theme.textSecondary,
    fontSize: fontSize.xs + 1,
    fontWeight: "700",
  },
  cardActionBannerTextActive: {
    color: theme.primary,
    fontWeight: "800",
  },
  list: { gap: spacing.sm },
  card: {
    minWidth: 0,
    width: "100%",
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: theme.surface,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardPressed: {
    backgroundColor: theme.surfaceSubtle,
    borderColor: theme.primarySoft,
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  cardTitle: {
    width: "100%",
    color: theme.textPrimary,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "800",
  },
});
